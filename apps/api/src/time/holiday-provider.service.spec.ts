import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HolidayProviderService } from './holiday-provider.service';

describe('HolidayProviderService', () => {
  beforeEach(() => {
    process.env.CALENDARIFIC_API_BASE_URL = 'https://calendarific.test/api/v2';
    process.env.CALENDARIFIC_PORTAL_BASE_URL = 'https://calendarific.test';
    vi.restoreAllMocks();
  });

  it('discovers supported countries and subdivisions from Calendarific metadata', async () => {
    const service = new HolidayProviderService({
      query: vi.fn().mockResolvedValue({
        rows: [{ credentials: { secret: 'calendarific-key' }, enabled: true }],
      }),
    } as never);

    const catalog = await service.getLocationCatalog({
      countryCode: 'ES',
      providerCode: 'calendarific',
    });

    expect(catalog.enabled).toBe(true);
    expect(catalog.configured).toBe(true);
    expect(catalog.countries).toEqual(
      expect.arrayContaining([{ code: 'ES', name: 'Spain' }]),
    );
    expect(catalog.subdivisions).toEqual(
      expect.arrayContaining([
        { code: 'ES-AN', countryCode: 'ES', name: 'Andalusia' },
        { code: 'ES-MD', countryCode: 'ES', name: 'Madrid' },
      ]),
    );
  });

  it('discovers additional subdivisions from the local subdivision catalog', async () => {
    const service = new HolidayProviderService({
      query: vi.fn().mockResolvedValue({
        rows: [{ credentials: { secret: 'calendarific-key' }, enabled: true }],
      }),
    } as never);

    const catalog = await service.getLocationCatalog({
      countryCode: 'ES',
      providerCode: 'calendarific',
    });

    expect(catalog.subdivisions).toEqual(
      expect.arrayContaining([
        { code: 'ES-AN', countryCode: 'ES', name: 'Andalusia' },
        { code: 'ES-PV', countryCode: 'ES', name: 'Basque Country' },
      ]),
    );
  });

  it('caches catalog discovery responses and tolerates unconfigured integrations', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new HolidayProviderService({ query } as never);

    const firstCatalog = await service.getLocationCatalog({
      providerCode: 'calendarific',
    });
    const secondCatalog = await service.getLocationCatalog({
      countryCode: 'ES',
      providerCode: 'calendarific',
    });

    expect(firstCatalog.configured).toBe(false);
    expect(firstCatalog.enabled).toBe(false);
    expect(secondCatalog.subdivisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ES-MD', name: 'Madrid' }),
      ]),
    );
  });

  it('loads and deduplicates imported holidays from Calendarific', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.startsWith('https://calendarific.test/api/v2/holidays')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                response: {
                  holidays: [
                    {
                      date: { iso: '2026-05-02T00:00:00+02:00' },
                      name: 'Community Day',
                    },
                    {
                      date: { iso: '2026-05-02T00:00:00+02:00' },
                      name: 'Community Day',
                    },
                    {
                      date: { iso: '2026-01-06T00:00:00+02:00' },
                      name: 'Epiphany',
                    },
                  ],
                },
              }),
              {
                headers: { 'content-type': 'application/json' },
                status: 200,
              },
            ),
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
    );

    const service = new HolidayProviderService({
      query: vi.fn().mockResolvedValue({
        rows: [{ credentials: { secret: 'calendarific-key' }, enabled: true }],
      }),
    } as never);

    const holidays = await service.loadOfficialHolidays({
      locationCode: 'ES-MD',
      providerCode: 'calendarific',
      year: 2026,
    });

    expect(holidays).toEqual([
      { date: '2026-01-06', name: 'Epiphany' },
      { date: '2026-05-02', name: 'Community Day' },
    ]);
  });

  it('rejects unsupported providers and incomplete integration state', async () => {
    const service = new HolidayProviderService({
      query: vi.fn().mockResolvedValue({
        rows: [{ credentials: {}, enabled: false }],
      }),
    } as never);

    await expect(
      service.getLocationCatalog({
        providerCode: 'custom',
      }),
    ).rejects.toThrow('Unsupported holiday provider: custom.');

    await expect(
      service.loadOfficialHolidays({
        locationCode: 'ES',
        providerCode: 'calendarific',
        year: 2026,
      }),
    ).rejects.toThrow(
      'The Calendarific holiday integration is not enabled in global integrations.',
    );

    const enabledWithoutKey = new HolidayProviderService({
      query: vi.fn().mockResolvedValue({
        rows: [{ credentials: {}, enabled: true }],
      }),
    } as never);

    await expect(
      enabledWithoutKey.loadOfficialHolidays({
        locationCode: 'ES',
        providerCode: 'calendarific',
        year: 2026,
      }),
    ).rejects.toThrow(
      'The Calendarific holiday integration is missing its API key.',
    );

    await expect(
      service.loadOfficialHolidays({
        locationCode: '',
        providerCode: 'calendarific',
        year: 2026,
      }),
    ).rejects.toThrow('The Calendarific holiday integration is not enabled');
  });

  it('surfaces provider import outages as service unavailability', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 503 }),
    );

    const service = new HolidayProviderService({
      query: vi.fn().mockResolvedValue({
        rows: [{ credentials: { secret: 'calendarific-key' }, enabled: true }],
      }),
    } as never);

    await expect(
      service.loadOfficialHolidays({
        locationCode: 'ES-MD',
        providerCode: 'calendarific',
        year: 2026,
      }),
    ).rejects.toThrow(
      'Calendarific official holiday import failed with status 503.',
    );
  });
});
