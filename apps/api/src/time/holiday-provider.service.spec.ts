import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HolidayProviderService } from './holiday-provider.service';

describe('HolidayProviderService', () => {
  beforeEach(() => {
    process.env.CALENDARIFIC_API_BASE_URL = 'https://calendarific.test/api/v2';
    process.env.CALENDARIFIC_PORTAL_BASE_URL = 'https://calendarific.test';
    vi.restoreAllMocks();
  });

  it('discovers supported countries and subdivisions from Calendarific metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === 'https://calendarific.test/supported-countries') {
          return new Response(
            `
              <table>
                <tr>
                  <td>Spain</td>
                  <td>es</td>
                  <td>
                    <a href="/api?location=es-md">Madrid</a>,
                    <a href="/api?location=es-ct">Catalonia</a>
                  </td>
                </tr>
              </table>
            `,
            { status: 200 },
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

    const catalog = await service.getLocationCatalog({
      countryCode: 'ES',
      providerCode: 'calendarific',
    });

    expect(catalog.enabled).toBe(true);
    expect(catalog.configured).toBe(true);
    expect(catalog.countries).toEqual([
      { code: 'ES', name: 'Spain' },
    ]);
    expect(catalog.subdivisions).toEqual([
      { code: 'ES-CT', countryCode: 'ES', name: 'Catalonia' },
      { code: 'ES-MD', countryCode: 'ES', name: 'Madrid' },
    ]);
  });

  it('loads and deduplicates imported holidays from Calendarific', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: string | URL | Request) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.startsWith('https://calendarific.test/api/v2/holidays')) {
          return new Response(
            JSON.stringify({
              response: {
                holidays: [
                  { date: { iso: '2026-05-02T00:00:00+02:00' }, name: 'Community Day' },
                  { date: { iso: '2026-05-02T00:00:00+02:00' }, name: 'Community Day' },
                  { date: { iso: '2026-01-06T00:00:00+02:00' }, name: 'Epiphany' },
                ],
              },
            }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
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
});
