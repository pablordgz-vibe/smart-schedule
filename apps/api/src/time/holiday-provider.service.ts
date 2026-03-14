import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  HolidayProviderContract,
  OfficialHolidayLocationCatalog,
  OfficialHolidayRecord,
  OfficialHolidaySubdivision,
} from '@smart-schedule/domain-time';
import { DatabaseService } from '../persistence/database.service';

type IntegrationRow = {
  credentials: Record<string, unknown>;
  enabled: boolean;
};

type CalendarificCountryRow = {
  code: string;
  name: string;
  subdivisions: OfficialHolidaySubdivision[];
};

type CachedCatalog = {
  countries: CalendarificCountryRow[];
  expiresAt: number;
};

const catalogCacheTtlMs = 24 * 60 * 60 * 1000;

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string) {
  return normalizeText(
    decodeHtmlEntities(
      value
        .replace(/<br\s*\/?>/gi, ', ')
        .replace(/<\/(div|li|p|td|th|tr|h\d)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  );
}

function toLocationCode(countryCode: string, subdivisionCode?: string | null) {
  return subdivisionCode
    ? `${countryCode.toUpperCase()}-${subdivisionCode.toUpperCase()}`
    : countryCode.toUpperCase();
}

function toCalendarificLocationCode(locationCode: string) {
  const tokens = locationCode
    .trim()
    .split('-')
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    throw new BadRequestException('A holiday location code is required.');
  }

  const [countryCode, ...rest] = tokens;
  return {
    countryCode: countryCode.toUpperCase(),
    location: rest.length > 0 ? `${countryCode}-${rest.join('-')}`.toLowerCase() : null,
  };
}

@Injectable()
export class HolidayProviderService implements HolidayProviderContract {
  private readonly apiBaseUrl =
    process.env.CALENDARIFIC_API_BASE_URL || 'https://calendarific.com/api/v2';
  private readonly portalBaseUrl =
    process.env.CALENDARIFIC_PORTAL_BASE_URL || 'https://calendarific.com';
  private catalogCache: CachedCatalog | null = null;

  constructor(private readonly databaseService: DatabaseService) {}

  async getLocationCatalog(input: {
    countryCode?: string;
    providerCode: string;
  }): Promise<OfficialHolidayLocationCatalog> {
    this.assertProviderSupported(input.providerCode);

    const integration = await this.readIntegrationState(input.providerCode);
    const countries = await this.loadCalendarificCatalog();
    const selectedCountryCode = input.countryCode?.trim().toUpperCase();
    const selectedCountry = selectedCountryCode
      ? countries.find((country) => country.code === selectedCountryCode)
      : null;

    return {
      configured: Boolean(this.readCalendarificApiKey(integration)),
      countries: countries.map((country) => ({
        code: country.code,
        name: country.name,
      })),
      enabled: integration?.enabled ?? false,
      providerCode: input.providerCode,
      providerDisplayName: 'Calendarific',
      subdivisions: selectedCountry?.subdivisions ?? [],
    };
  }

  async loadOfficialHolidays(input: {
    locationCode: string;
    providerCode: string;
    year: number;
  }): Promise<OfficialHolidayRecord[]> {
    this.assertProviderSupported(input.providerCode);

    const integration = await this.readIntegrationState(input.providerCode);
    if (!integration?.enabled) {
      throw new BadRequestException(
        'The Calendarific holiday integration is not enabled in global integrations.',
      );
    }

    const apiKey = this.readCalendarificApiKey(integration);
    if (!apiKey) {
      throw new BadRequestException(
        'The Calendarific holiday integration is missing its API key.',
      );
    }

    const { countryCode, location } = toCalendarificLocationCode(
      input.locationCode,
    );
    const url = new URL(`${this.apiBaseUrl}/holidays`);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('country', countryCode);
    url.searchParams.set('year', String(input.year));
    if (location) {
      url.searchParams.set('location', location);
    }

    const response = await this.fetchJson<{
      response?: {
        holidays?: Array<{
          date?: { iso?: string };
          name?: string;
        }>;
      };
    }>(url, 'official holiday import');

    const uniqueRecords = new Map<string, OfficialHolidayRecord>();
    for (const holiday of response.response?.holidays ?? []) {
      const date = holiday.date?.iso?.slice(0, 10);
      const name = normalizeText(holiday.name ?? '');
      if (!date || !name) {
        continue;
      }

      uniqueRecords.set(`${date}:${name.toLowerCase()}`, { date, name });
    }

    return Array.from(uniqueRecords.values()).sort((left, right) =>
      left.date.localeCompare(right.date),
    );
  }

  private assertProviderSupported(providerCode: string) {
    if (providerCode !== 'calendarific') {
      throw new BadRequestException(
        `Unsupported holiday provider: ${providerCode}.`,
      );
    }
  }

  private async loadCalendarificCatalog() {
    if (
      this.catalogCache &&
      this.catalogCache.expiresAt > Date.now() &&
      this.catalogCache.countries.length > 0
    ) {
      return this.catalogCache.countries;
    }

    const url = `${this.portalBaseUrl}/supported-countries`;
    const response = await this.fetchText(url, 'holiday location discovery');
    const countries = this.parseSupportedCountries(response);

    this.catalogCache = {
      countries,
      expiresAt: Date.now() + catalogCacheTtlMs,
    };

    return countries;
  }

  private parseSupportedCountries(html: string) {
    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const countries: CalendarificCountryRow[] = [];

    for (const match of html.matchAll(rowPattern)) {
      const rowHtml = match[1];
      const rowText = stripHtml(rowHtml);
      const rowMatch = rowText.match(/^(.+?)\s+([a-z]{2})\s*(.*)$/i);
      if (!rowMatch) {
        continue;
      }

      const [, rawName, rawCountryCode, rawSubdivisionText] = rowMatch;
      const countryCode = rawCountryCode.toUpperCase();
      const countryName = normalizeText(rawName);
      if (countryName.length < 2) {
        continue;
      }

      const inlineCodes = Array.from(
        new Set(
          Array.from(
            rowHtml.matchAll(
              new RegExp(`${rawCountryCode.toLowerCase()}-([a-z0-9-]{1,8})`, 'gi'),
            ),
            (codeMatch) => codeMatch[1].toUpperCase(),
          ),
        ),
      );

      const subdivisions = rawSubdivisionText
        .split(',')
        .map((token) => normalizeText(token))
        .filter((token) => token.length > 1)
        .map((name, index) => ({
          code:
            inlineCodes.length ===
            rawSubdivisionText
              .split(',')
              .map((token) => normalizeText(token))
              .filter((token) => token.length > 1).length
              ? toLocationCode(countryCode, inlineCodes[index])
              : null,
          countryCode,
          name,
        }))
        .filter(
          (entry, index, entries) =>
            entries.findIndex(
              (candidate) => candidate.name.toLowerCase() === entry.name.toLowerCase(),
            ) === index,
        )
        .sort((left, right) => left.name.localeCompare(right.name));

      countries.push({
        code: countryCode,
        name: countryName,
        subdivisions,
      });
    }

    return countries
      .filter(
        (entry, index, entries) =>
          entries.findIndex(
            (candidate) =>
              candidate.code === entry.code ||
              candidate.name.toLowerCase() === entry.name.toLowerCase(),
          ) === index,
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private async readIntegrationState(providerCode: string) {
    const result = await this.databaseService.query<IntegrationRow>(
      `select credentials, enabled
       from setup_integrations
       where code = $1`,
      [providerCode],
    );

    return result.rows[0] ?? null;
  }

  private readCalendarificApiKey(integration: IntegrationRow | null) {
    const credentials = integration?.credentials ?? {};
    const apiKey = credentials.apiKey ?? credentials.secret;
    return typeof apiKey === 'string' && apiKey.trim().length > 0
      ? apiKey.trim()
      : null;
  }

  private async fetchJson<T>(url: URL | string, purpose: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Calendarific ${purpose} failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  private async fetchText(url: string, purpose: string) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'SmartSchedule/1.0',
      },
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Calendarific ${purpose} failed with status ${response.status}.`,
      );
    }

    return response.text();
  }
}
