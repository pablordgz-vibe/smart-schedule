import { describe, expect, it } from 'vitest';
import {
  countConflictingExceptions,
  materializeScheduleOccurrences,
  type ScheduleDefinition,
  type ScheduleOccurrenceException,
} from '../../../../packages/domain-sched/src';

function buildDefinition(
  timezoneMode: 'utc_constant' | 'wall_clock',
): ScheduleDefinition {
  return {
    boundaryEndDate: null,
    boundaryStartDate: '2026-03-23',
    description: null,
    id: 'schedule-1',
    name: 'DST schedule',
    state: 'active',
    versions: [
      {
        effectiveFromDate: '2026-03-23',
        id: 'version-1',
        items: [
          {
            dayOffset: 0,
            description: null,
            dueTime: null,
            durationMinutes: 60,
            groupKey: null,
            id: 'item-event',
            itemType: 'event',
            location: null,
            notes: null,
            repetitionMode: 'grouped',
            startTime: '09:00',
            title: 'Opening shift',
            workRelated: true,
          },
          {
            dayOffset: 0,
            description: null,
            dueTime: '11:00',
            durationMinutes: null,
            groupKey: null,
            id: 'item-task',
            itemType: 'task',
            location: null,
            notes: null,
            repetitionMode: 'individual',
            startTime: null,
            title: 'Checklist',
            workRelated: true,
          },
        ],
        recurrence: {
          count: null,
          dayOfMonth: null,
          frequency: 'weekly',
          interval: 1,
          pauses: [],
          weekdays: [1],
        },
        timezone: 'Europe/Madrid',
        timezoneMode,
      },
    ],
  };
}

describe('schedule domain materialization', () => {
  it('keeps wall-clock and UTC-constant schedules distinct across DST boundaries', () => {
    const wallClock = materializeScheduleOccurrences({
      definition: buildDefinition('wall_clock'),
      exceptions: [],
      window: { from: '2026-03-23', to: '2026-04-06' },
    });
    const utcConstant = materializeScheduleOccurrences({
      definition: buildDefinition('utc_constant'),
      exceptions: [],
      window: { from: '2026-03-23', to: '2026-04-06' },
    });

    const wallClockStarts = wallClock.projections
      .filter((projection) => projection.itemType === 'event')
      .map((projection) => projection.startsAt);
    const utcConstantStarts = utcConstant.projections
      .filter((projection) => projection.itemType === 'event')
      .map((projection) => projection.startsAt);

    expect(wallClockStarts).toEqual([
      '2026-03-23T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
      '2026-04-06T07:00:00.000Z',
    ]);
    expect(utcConstantStarts).toEqual([
      '2026-03-23T08:00:00.000Z',
      '2026-03-30T08:00:00.000Z',
      '2026-04-06T08:00:00.000Z',
    ]);
  });

  it('applies detached replacements and counts conflicts for future edits', () => {
    const exceptions: ScheduleOccurrenceException[] = [
      {
        action: 'replace',
        detached: true,
        id: 'exception-1',
        movedToDate: null,
        occurrenceDate: '2026-03-30',
        overrideItem: {
          dueTime: '12:00',
          title: 'Checklist - detached',
        },
        targetItemId: 'item-task',
      },
    ];

    const result = materializeScheduleOccurrences({
      definition: buildDefinition('wall_clock'),
      exceptions,
      window: { from: '2026-03-23', to: '2026-04-06' },
    });

    expect(
      result.projections.find(
        (projection) =>
          projection.occurrenceDate === '2026-03-30' &&
          projection.itemDefinitionId === 'item-task',
      ),
    ).toMatchObject({
      detached: true,
      dueAt: '2026-03-30T10:00:00.000Z',
      title: 'Checklist - detached',
    });

    expect(
      countConflictingExceptions({
        anchorDate: '2026-03-30',
        exceptions,
        includePast: false,
        scope: 'selected_and_future',
      }),
    ).toHaveLength(1);
  });
});
