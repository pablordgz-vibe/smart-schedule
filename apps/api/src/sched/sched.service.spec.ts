import { describe, expect, it } from 'vitest';
import {
  materializeScheduleOccurrences,
  previewUpcomingOccurrences,
  type ScheduleDefinition,
} from '@smart-schedule/domain-sched';

describe('schedule domain materialization', () => {
  it('supports future rule changes and pause windows', () => {
    const definition: ScheduleDefinition = {
      boundaryEndDate: null,
      boundaryStartDate: '2026-03-01',
      description: null,
      id: 'schedule-1',
      name: 'Pattern changes',
      state: 'active',
      versions: [
        {
          effectiveFromDate: '2026-03-01',
          id: 'version-1',
          items: [
            {
              dayOffset: 0,
              description: null,
              dueTime: '10:00',
              durationMinutes: null,
              groupKey: null,
              id: 'task-1',
              itemType: 'task',
              location: null,
              notes: null,
              repetitionMode: 'individual',
              startTime: null,
              title: 'Morning task',
              workRelated: true,
            },
          ],
          recurrence: {
            count: null,
            dayOfMonth: null,
            frequency: 'weekly',
            interval: 1,
            pauses: [{ endDate: '2026-03-15', startDate: '2026-03-09' }],
            weekdays: [1],
          },
          timezone: 'UTC',
          timezoneMode: 'wall_clock',
        },
        {
          effectiveFromDate: '2026-03-22',
          id: 'version-2',
          items: [
            {
              dayOffset: 0,
              description: null,
              dueTime: '10:00',
              durationMinutes: null,
              groupKey: null,
              id: 'task-1',
              itemType: 'task',
              location: null,
              notes: null,
              repetitionMode: 'individual',
              startTime: null,
              title: 'Morning task',
              workRelated: true,
            },
          ],
          recurrence: {
            count: null,
            dayOfMonth: null,
            frequency: 'daily',
            interval: 2,
            pauses: [],
            weekdays: [],
          },
          timezone: 'UTC',
          timezoneMode: 'wall_clock',
        },
      ],
    };

    const materialized = materializeScheduleOccurrences({
      definition,
      exceptions: [],
      window: {
        from: '2026-03-01',
        to: '2026-03-31',
      },
    });

    expect(
      materialized.projections.map((projection) => projection.localDate),
    ).toEqual([
      '2026-03-02',
      '2026-03-16',
      '2026-03-23',
      '2026-03-25',
      '2026-03-27',
      '2026-03-29',
      '2026-03-31',
    ]);

    const preview = previewUpcomingOccurrences({
      definition,
      exceptions: [],
      fromDate: '2026-03-01',
      limit: 3,
    });

    expect(preview.occurrences.map((occurrence) => occurrence.date)).toEqual([
      '2026-03-02',
      '2026-03-16',
      '2026-03-23',
    ]);
  });
});
