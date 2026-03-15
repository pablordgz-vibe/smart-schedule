import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStateService } from './auth-state.service';
import { SchedApiError, SchedApiService } from './sched-api.service';

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('SchedApiService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        SchedApiService,
        {
          provide: AuthStateService,
          useValue: {
            csrfToken: () => 'csrf-token',
          },
        },
      ],
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('adds auth headers to read requests and unwraps read payloads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ schedules: [{ id: 'schedule-1' }] }))
      .mockResolvedValueOnce(jsonResponse({ schedule: { id: 'schedule-1' } }))
      .mockResolvedValueOnce(jsonResponse({ occurrences: [{ occurrenceDate: '2026-03-16' }] }));

    const service = TestBed.inject(SchedApiService);

    await expect(
      service.listSchedules({
        query: ' support ',
        state: 'active',
      }),
    ).resolves.toEqual([{ id: 'schedule-1' }]);
    await expect(service.getSchedule('schedule-1')).resolves.toEqual({
      schedule: { id: 'schedule-1' },
    });
    await expect(
      service.listOccurrences('schedule-1', {
        from: '2026-03-01',
        to: '2026-03-31',
      }),
    ).resolves.toEqual([{ occurrenceDate: '2026-03-16' }]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/sched?state=active&query=support',
      expect.objectContaining({
        credentials: 'include',
        headers: { 'x-csrf-token': 'csrf-token' },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/sched/schedule-1',
      expect.objectContaining({
        credentials: 'include',
        headers: { 'x-csrf-token': 'csrf-token' },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/sched/schedule-1/occurrences?from=2026-03-01&to=2026-03-31',
      expect.objectContaining({
        credentials: 'include',
        headers: { 'x-csrf-token': 'csrf-token' },
      }),
    );
  });

  it('serializes write requests with JSON headers and bodies', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          recurrenceSummary: 'Every week',
          timezoneModeLabel: 'Keep local wall-clock time constant',
          upcomingOccurrences: [],
          validation: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ schedule: { id: 'schedule-1' } }))
      .mockResolvedValueOnce(jsonResponse({ schedule: { id: 'schedule-1' } }))
      .mockResolvedValueOnce(jsonResponse({ occurrences: [{ occurrenceDate: '2026-03-30' }] }));

    const service = TestBed.inject(SchedApiService);
    const definition = {
      boundaryEndDate: null,
      boundaryStartDate: '2026-03-16',
      description: 'Support rota',
      name: 'Support rota',
      state: 'active' as const,
      versions: [
        {
          effectiveFromDate: '2026-03-16',
          items: [
            {
              dayOffset: 0,
              dueTime: '11:00',
              id: 'item-1',
              itemType: 'task' as const,
              repetitionMode: 'individual' as const,
              title: 'Checklist',
              workRelated: true,
            },
          ],
          recurrence: {
            frequency: 'weekly' as const,
            interval: 1,
            pauses: [],
            weekdays: [1],
          },
          timezone: 'UTC',
          timezoneMode: 'wall_clock' as const,
        },
      ],
    };

    await service.preview(definition);
    await service.create(definition);
    await service.update('schedule-1', {
      changeControl: {
        anchorDate: '2026-03-16',
        includePast: true,
        overwriteExceptions: true,
        scope: 'all',
      },
      definition,
    });
    await expect(
      service.mutateOccurrence('schedule-1', '2026-03-30', {
        action: 'replace',
        detached: true,
        includePast: false,
        movedToDate: null,
        overrideItem: definition.versions[0].items[0],
        overwriteExceptions: true,
        scope: 'selected_and_future',
        targetItemId: 'item-1',
      }),
    ).resolves.toEqual([{ occurrenceDate: '2026-03-30' }]);

    for (const call of fetchMock.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': 'csrf-token',
          },
        }),
      );
    }

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sched/preview');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/sched');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/sched/schedule-1');
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      '/api/sched/schedule-1/occurrences/2026-03-30/mutate',
    );
    const patchRequest = fetchMock.mock.calls[2]?.[1] as RequestInit | undefined;
    const mutateRequest = fetchMock.mock.calls[3]?.[1] as RequestInit | undefined;
    const mutateBody = typeof mutateRequest?.body === 'string' ? mutateRequest.body : '';
    expect(patchRequest?.method).toBe('PATCH');
    expect(mutateBody).toContain('"targetItemId":"item-1"');
  });

  it('throws SchedApiError using array, nested, and fallback messages', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            message: ['First issue', 'Second issue'],
          },
          false,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: { message: 'Nested error' },
          },
          false,
        ),
      )
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
      } as unknown as Response);

    const service = TestBed.inject(SchedApiService);

    await expect(service.getSchedule('schedule-1')).rejects.toMatchObject({
      message: 'First issue, Second issue',
    });
    await expect(service.preview({} as never)).rejects.toMatchObject({
      message: 'Nested error',
    });

    try {
      await service.create({} as never);
      throw new Error('Expected create() to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SchedApiError);
      expect((error as SchedApiError).message).toBe('Request failed.');
    }
  });
});
