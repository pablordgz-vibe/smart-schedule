import { describe, expect, it } from 'vitest';
import {
  evaluateAdvisory,
  resolveEffectivePolicies,
} from '@smart-schedule/domain-time';

describe('time policy precedence and advisory domain logic', () => {
  it('resolves precedence as user > group > organization', () => {
    const preview = resolveEffectivePolicies({
      records: [
        {
          category: 'working_hours',
          id: 'org-rule',
          rule: { daysOfWeek: [1, 2, 3], endTime: '17:00', startTime: '09:00' },
          scopeLevel: 'organization',
          targetGroupId: null,
          targetUserId: null,
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
        {
          category: 'working_hours',
          id: 'group-rule',
          rule: {
            daysOfWeek: [1, 2, 3, 4],
            endTime: '18:00',
            startTime: '08:00',
          },
          scopeLevel: 'group',
          targetGroupId: 'group-1',
          targetUserId: null,
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
        {
          category: 'working_hours',
          id: 'user-rule',
          rule: {
            daysOfWeek: [1, 2, 3, 4, 5],
            endTime: '16:00',
            startTime: '07:00',
          },
          scopeLevel: 'user',
          targetGroupId: null,
          targetUserId: 'user-1',
          updatedAt: '2026-03-03T00:00:00.000Z',
        },
      ],
      targetGroupIds: ['group-1'],
      targetUserId: 'user-1',
    });

    expect(preview.categories.working_hours.resolvedFromScope).toBe('user');
    expect(
      preview.categories.working_hours.rules.map((rule) => rule.id),
    ).toEqual(['user-rule']);
  });

  it('keeps conflict concerns advisory-only and returns alternative slots', () => {
    const effectivePolicies = resolveEffectivePolicies({
      records: [
        {
          category: 'rest',
          id: 'rest-rule',
          rule: { minRestMinutes: 60 },
          scopeLevel: 'organization',
          targetGroupId: null,
          targetUserId: null,
          updatedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      targetGroupIds: [],
      targetUserId: 'user-1',
    });

    const advisory = evaluateAdvisory({
      activities: [
        {
          endAt: '2026-03-12T10:00:00.000Z',
          id: 'event-1',
          location: 'Office A',
          source: 'event',
          startAt: '2026-03-12T09:00:00.000Z',
          title: 'Existing meeting',
          workRelated: true,
        },
      ],
      candidate: {
        allDay: false,
        endAt: '2026-03-12T10:30:00.000Z',
        location: 'Office B',
        startAt: '2026-03-12T09:30:00.000Z',
        title: 'New meeting',
        workRelated: true,
      },
      commuteSignal: {
        commuteMinutesAfter: 10,
        commuteMinutesBefore: 15,
        source: 'provider',
      },
      effectivePolicies,
      weatherSignal: {
        preparationNote: 'Rain expected. Add setup buffer.',
        source: 'provider',
        summary: 'Rain',
      },
    });

    expect(advisory.canProceed).toBe(true);
    expect(
      advisory.concerns.some((concern) => concern.category === 'overlap'),
    ).toBe(true);
    expect(
      advisory.concerns.some((concern) => concern.category === 'commute'),
    ).toBe(true);
    expect(advisory.alternativeSlots.length).toBeGreaterThan(0);
  });
});
