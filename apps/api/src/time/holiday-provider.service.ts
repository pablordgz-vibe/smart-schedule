import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Country, State } from 'country-state-city';
import type {
  HolidayProviderContract,
  OfficialHolidayLocationCatalog,
  OfficialHolidayRecord,
} from '@smart-schedule/domain-time';
import { DatabaseService } from '../persistence/database.service';

type IntegrationRow = {
  credentials: Record<string, unknown>;
  enabled: boolean;
};

type CountryCatalogRow = {
  code: string;
  name: string;
};

type CachedCatalog = {
  countries: CountryCatalogRow[];
  expiresAt: number;
};

const catalogCacheTtlMs = 24 * 60 * 60 * 1000;

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
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
    location:
      rest.length > 0 ? `${countryCode}-${rest.join('-')}`.toLowerCase() : null,
  };
}

@Injectable()
export class HolidayProviderService implements HolidayProviderContract {
  private readonly apiBaseUrl =
    process.env.CALENDARIFIC_API_BASE_URL || 'https://calendarific.com/api/v2';
  private catalogCache: CachedCatalog | null = null;

  constructor(private readonly databaseService: DatabaseService) {}

  async getLocationCatalog(input: {
    countryCode?: string;
    providerCode: string;
  }): Promise<OfficialHolidayLocationCatalog> {
    this.assertProviderSupported(input.providerCode);

    const integration = await this.readIntegrationState(input.providerCode);
    const countries = this.loadCountryCatalog();
    const selectedCountryCode = input.countryCode?.trim().toUpperCase();
    const subdivisions = selectedCountryCode
      ? State.getStatesOfCountry(selectedCountryCode)
          .map((subdivision) => ({
            code: toLocationCode(selectedCountryCode, subdivision.isoCode),
            countryCode: selectedCountryCode,
            name: subdivision.name,
          }))
          .sort((left, right) => left.name.localeCompare(right.name))
      : [];

    return {
      configured: Boolean(this.readCalendarificApiKey(integration)),
      countries: countries.map((country) => ({
        code: country.code,
        name: country.name,
      })),
      enabled: integration?.enabled ?? false,
      providerCode: input.providerCode,
      providerDisplayName: 'Calendarific',
      subdivisions,
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

  private loadCountryCatalog() {
    if (
      this.catalogCache &&
      this.catalogCache.expiresAt > Date.now() &&
      this.catalogCache.countries.length > 0
    ) {
      return this.catalogCache.countries;
    }

    const countries = Country.getAllCountries()
      .map((country) => ({
        code: country.isoCode,
        name: country.name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    this.catalogCache = {
      countries,
      expiresAt: Date.now() + catalogCacheTtlMs,
    };

    return countries;
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

}
