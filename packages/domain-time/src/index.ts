export const TIME_MOD = "time";

export type TimePolicyCategory =
  | "availability"
  | "blackout"
  | "holiday"
  | "max_hours"
  | "rest"
  | "unavailability"
  | "working_hours";

export type TimePolicyScopeLevel = "group" | "organization" | "user";

export type TimePolicyRecord = {
  id: string;
  category: TimePolicyCategory;
  scopeLevel: TimePolicyScopeLevel;
  targetGroupId: string | null;
  targetUserId: string | null;
  updatedAt: string;
  rule: {
    date?: string;
    daysOfWeek?: number[];
    endAt?: string;
    endTime?: string;
    holidayName?: string;
    locationCode?: string;
    maxDailyMinutes?: number;
    maxWeeklyMinutes?: number;
    minRestMinutes?: number;
    providerCode?: string;
    startAt?: string;
    startTime?: string;
  };
};

export type EffectivePolicySet = {
  categories: {
    [K in TimePolicyCategory]: {
      resolvedFromScope: TimePolicyScopeLevel | null;
      rules: TimePolicyRecord[];
    };
  };
};

export type AdvisoryActivity = {
  endAt: string;
  id: string;
  location: string | null;
  source: "event" | "task_due";
  startAt: string;
  title: string;
  workRelated: boolean;
};

export type AdvisoryCandidate = {
  allDay: boolean;
  endAt: string;
  location: string | null;
  startAt: string;
  title: string;
  workRelated: boolean;
};

export type AdvisoryCommuteSignal = {
  commuteMinutesAfter: number | null;
  commuteMinutesBefore: number | null;
  source: "provider" | "user";
};

export type AdvisoryWeatherSignal = {
  preparationNote: string;
  source: "provider" | "user";
  summary: string;
};

export type AdvisoryConcern = {
  category:
    | "availability"
    | "blackout"
    | "commute"
    | "holiday"
    | "maximum_hours"
    | "overlap"
    | "rest_rule"
    | "unavailability"
    | "weather_related_preparation"
    | "working_hours";
  code: string;
  details: Record<string, number | string | string[] | null>;
  level: "warning";
  message: string;
};

export type AlternativeSlotSuggestion = {
  endAt: string;
  reason: string;
  startAt: string;
};

export type AdvisoryResult = {
  alternativeSlots: AlternativeSlotSuggestion[];
  canProceed: true;
  concerns: AdvisoryConcern[];
};

const precedenceOrder: TimePolicyScopeLevel[] = [
  "user",
  "group",
  "organization",
];
const millisecondsPerMinute = 60_000;

function toDate(value: string) {
  return new Date(value);
}

function durationMinutes(startAt: string, endAt: string) {
  return Math.max(
    0,
    (toDate(endAt).getTime() - toDate(startAt).getTime()) /
      millisecondsPerMinute,
  );
}

function isWindowOverlap(
  left: { startAt: string; endAt: string },
  right: { startAt: string; endAt: string },
) {
  return (
    toDate(left.startAt) < toDate(right.endAt) &&
    toDate(right.startAt) < toDate(left.endAt)
  );
}

function dayOfWeekFromIso(isoDateTime: string) {
  return toDate(isoDateTime).getUTCDay();
}

function minutesOfDayFromIso(isoDateTime: string) {
  const dt = toDate(isoDateTime);
  return dt.getUTCHours() * 60 + dt.getUTCMinutes();
}

function minutesFromTimeToken(value: string) {
  const [hoursToken, minutesToken] = value.split(":");
  const hours = Number(hoursToken);
  const minutes = Number(minutesToken);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function isoDateToken(isoDateTime: string) {
  return toDate(isoDateTime).toISOString().slice(0, 10);
}

export function resolveEffectivePolicies(input: {
  records: TimePolicyRecord[];
  targetGroupIds: string[];
  targetUserId: string;
}): EffectivePolicySet {
  const categories: TimePolicyCategory[] = [
    "working_hours",
    "availability",
    "unavailability",
    "holiday",
    "blackout",
    "rest",
    "max_hours",
  ];

  const byCategory = new Map<
    TimePolicyCategory,
    {
      organization: TimePolicyRecord[];
      group: TimePolicyRecord[];
      user: TimePolicyRecord[];
    }
  >();

  for (const category of categories) {
    byCategory.set(category, {
      group: [],
      organization: [],
      user: [],
    });
  }

  const groups = new Set(input.targetGroupIds);

  for (const record of input.records) {
    const bucket = byCategory.get(record.category);
    if (!bucket) {
      continue;
    }

    if (record.scopeLevel === "organization") {
      bucket.organization.push(record);
      continue;
    }

    if (record.scopeLevel === "group") {
      if (record.targetGroupId && groups.has(record.targetGroupId)) {
        bucket.group.push(record);
      }
      continue;
    }

    if (record.targetUserId === input.targetUserId) {
      bucket.user.push(record);
    }
  }

  const resolved = Object.fromEntries(
    categories.map((category) => {
      const scoped = byCategory.get(category)!;

      const resolvedScope =
        precedenceOrder.find((scope) => scoped[scope].length > 0) ?? null;
      const rules = resolvedScope
        ? [...scoped[resolvedScope]].sort((left, right) => {
            const updatedAtSort = left.updatedAt.localeCompare(right.updatedAt);
            if (updatedAtSort !== 0) {
              return updatedAtSort;
            }

            return left.id.localeCompare(right.id);
          })
        : [];

      return [
        category,
        {
          resolvedFromScope: resolvedScope,
          rules,
        },
      ];
    }),
  ) as EffectivePolicySet["categories"];

  return { categories: resolved };
}

function applyWindowPolicyConcerns(input: {
  candidate: AdvisoryCandidate;
  concerns: AdvisoryConcern[];
  effectivePolicies: EffectivePolicySet;
}) {
  const dayOfWeek = dayOfWeekFromIso(input.candidate.startAt);
  const startMinutes = minutesOfDayFromIso(input.candidate.startAt);
  const endMinutes = minutesOfDayFromIso(input.candidate.endAt);
  const dateToken = isoDateToken(input.candidate.startAt);

  const workingHourRules =
    input.effectivePolicies.categories.working_hours.rules;
  if (workingHourRules.length > 0) {
    const inAnyWorkingWindow = workingHourRules.some((rule) => {
      const days = rule.rule.daysOfWeek ?? [];
      const startToken = rule.rule.startTime;
      const endToken = rule.rule.endTime;
      if (!startToken || !endToken || !days.includes(dayOfWeek)) {
        return false;
      }

      const windowStart = minutesFromTimeToken(startToken);
      const windowEnd = minutesFromTimeToken(endToken);
      if (windowStart == null || windowEnd == null) {
        return false;
      }

      return startMinutes >= windowStart && endMinutes <= windowEnd;
    });

    if (!inAnyWorkingWindow) {
      input.concerns.push({
        category: "working_hours",
        code: "working_hours_outside_window",
        details: {
          windowCount: workingHourRules.length,
        },
        level: "warning",
        message:
          "The selected time is outside the effective working-hour windows.",
      });
    }
  }

  const availabilityRules =
    input.effectivePolicies.categories.availability.rules;
  if (availabilityRules.length > 0) {
    const inAvailableWindow = availabilityRules.some((rule) => {
      const days = rule.rule.daysOfWeek ?? [];
      const startToken = rule.rule.startTime;
      const endToken = rule.rule.endTime;
      if (!startToken || !endToken || !days.includes(dayOfWeek)) {
        return false;
      }

      const windowStart = minutesFromTimeToken(startToken);
      const windowEnd = minutesFromTimeToken(endToken);
      if (windowStart == null || windowEnd == null) {
        return false;
      }

      return startMinutes >= windowStart && endMinutes <= windowEnd;
    });

    if (!inAvailableWindow) {
      input.concerns.push({
        category: "availability",
        code: "availability_outside_window",
        details: {
          windowCount: availabilityRules.length,
        },
        level: "warning",
        message:
          "The selected time is outside the configured availability windows.",
      });
    }
  }

  const unavailabilityRules =
    input.effectivePolicies.categories.unavailability.rules;
  for (const rule of unavailabilityRules) {
    const days = rule.rule.daysOfWeek ?? [];
    const startToken = rule.rule.startTime;
    const endToken = rule.rule.endTime;

    if (!startToken || !endToken || !days.includes(dayOfWeek)) {
      continue;
    }

    const windowStart = minutesFromTimeToken(startToken);
    const windowEnd = minutesFromTimeToken(endToken);
    if (windowStart == null || windowEnd == null) {
      continue;
    }

    const overlapsWindow = startMinutes < windowEnd && endMinutes > windowStart;
    if (overlapsWindow) {
      input.concerns.push({
        category: "unavailability",
        code: "unavailability_window_overlap",
        details: {
          policyId: rule.id,
        },
        level: "warning",
        message: "The selected time overlaps with an unavailability window.",
      });
      break;
    }
  }

  const holidayRules = input.effectivePolicies.categories.holiday.rules;
  const holidayMatch = holidayRules.find(
    (rule) => rule.rule.date === dateToken,
  );
  if (holidayMatch) {
    input.concerns.push({
      category: "holiday",
      code: "holiday_match",
      details: {
        holidayName: holidayMatch.rule.holidayName ?? "Holiday",
        policyId: holidayMatch.id,
      },
      level: "warning",
      message: "The selected day matches an active holiday policy.",
    });
  }

  const blackoutRules = input.effectivePolicies.categories.blackout.rules;
  for (const rule of blackoutRules) {
    const blackoutStart = rule.rule.startAt;
    const blackoutEnd = rule.rule.endAt;
    if (!blackoutStart || !blackoutEnd) {
      continue;
    }

    if (
      isWindowOverlap(
        { endAt: input.candidate.endAt, startAt: input.candidate.startAt },
        { endAt: blackoutEnd, startAt: blackoutStart },
      )
    ) {
      input.concerns.push({
        category: "blackout",
        code: "blackout_overlap",
        details: {
          policyId: rule.id,
          blackoutEnd,
          blackoutStart,
        },
        level: "warning",
        message: "The selected time overlaps with a blackout period.",
      });
      break;
    }
  }
}

function applyRestConcern(input: {
  activities: AdvisoryActivity[];
  candidate: AdvisoryCandidate;
  concerns: AdvisoryConcern[];
  effectivePolicies: EffectivePolicySet;
}) {
  const restRules = input.effectivePolicies.categories.rest.rules;
  if (restRules.length === 0) {
    return;
  }

  const minimumRestMinutes = Math.max(
    ...restRules
      .map((rule) => rule.rule.minRestMinutes)
      .filter(
        (value): value is number => typeof value === "number" && value > 0,
      ),
    0,
  );
  if (!minimumRestMinutes) {
    return;
  }

  const sorted = [...input.activities].sort((left, right) =>
    left.startAt.localeCompare(right.startAt),
  );
  const previous =
    sorted
      .filter((activity) => activity.endAt <= input.candidate.startAt)
      .at(-1) ?? null;
  const next =
    sorted.find((activity) => activity.startAt >= input.candidate.endAt) ??
    null;

  const beforeGapMinutes = previous
    ? durationMinutes(previous.endAt, input.candidate.startAt)
    : null;
  const afterGapMinutes = next
    ? durationMinutes(input.candidate.endAt, next.startAt)
    : null;

  if (
    (beforeGapMinutes != null && beforeGapMinutes < minimumRestMinutes) ||
    (afterGapMinutes != null && afterGapMinutes < minimumRestMinutes)
  ) {
    input.concerns.push({
      category: "rest_rule",
      code: "minimum_rest_gap_not_met",
      details: {
        afterGapMinutes,
        beforeGapMinutes,
        minimumRestMinutes,
      },
      level: "warning",
      message:
        "The selected time leaves less rest time than the effective minimum-rest rule.",
    });
  }
}

function applyMaxHourConcern(input: {
  activities: AdvisoryActivity[];
  candidate: AdvisoryCandidate;
  concerns: AdvisoryConcern[];
  effectivePolicies: EffectivePolicySet;
}) {
  if (!input.candidate.workRelated) {
    return;
  }

  const maxHourRules = input.effectivePolicies.categories.max_hours.rules;
  if (maxHourRules.length === 0) {
    return;
  }

  const dailyLimits = maxHourRules
    .map((rule) => rule.rule.maxDailyMinutes)
    .filter((value): value is number => typeof value === "number" && value > 0);
  const weeklyLimits = maxHourRules
    .map((rule) => rule.rule.maxWeeklyMinutes)
    .filter((value): value is number => typeof value === "number" && value > 0);

  const maxDailyMinutes =
    dailyLimits.length > 0 ? Math.min(...dailyLimits) : null;
  const maxWeeklyMinutes =
    weeklyLimits.length > 0 ? Math.min(...weeklyLimits) : null;

  const candidateDate = isoDateToken(input.candidate.startAt);
  const candidateStartDate = toDate(input.candidate.startAt);
  const weekStart = new Date(candidateStartDate);
  weekStart.setUTCDate(
    candidateStartDate.getUTCDate() - candidateStartDate.getUTCDay(),
  );
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

  const workActivities = input.activities.filter(
    (activity) => activity.workRelated,
  );
  const existingDailyMinutes = workActivities
    .filter((activity) => isoDateToken(activity.startAt) === candidateDate)
    .reduce(
      (sum, activity) =>
        sum + durationMinutes(activity.startAt, activity.endAt),
      0,
    );
  const existingWeeklyMinutes = workActivities
    .filter((activity) => {
      const activityStart = toDate(activity.startAt);
      return activityStart >= weekStart && activityStart < weekEnd;
    })
    .reduce(
      (sum, activity) =>
        sum + durationMinutes(activity.startAt, activity.endAt),
      0,
    );

  const candidateMinutes = durationMinutes(
    input.candidate.startAt,
    input.candidate.endAt,
  );
  const dailyTotal = existingDailyMinutes + candidateMinutes;
  const weeklyTotal = existingWeeklyMinutes + candidateMinutes;

  if (
    (maxDailyMinutes != null && dailyTotal > maxDailyMinutes) ||
    (maxWeeklyMinutes != null && weeklyTotal > maxWeeklyMinutes)
  ) {
    input.concerns.push({
      category: "maximum_hours",
      code: "maximum_hours_exceeded",
      details: {
        dailyTotal,
        maxDailyMinutes,
        maxWeeklyMinutes,
        weeklyTotal,
      },
      level: "warning",
      message:
        "Adding this work-related activity exceeds the effective maximum-hour thresholds.",
    });
  }
}

function buildAlternativeSlots(input: {
  activities: AdvisoryActivity[];
  candidate: AdvisoryCandidate;
  concerns: AdvisoryConcern[];
}) {
  if (!input.concerns.some((concern) => concern.category === "overlap")) {
    return [];
  }

  const candidateMinutes = durationMinutes(
    input.candidate.startAt,
    input.candidate.endAt,
  );
  const sorted = [...input.activities].sort((left, right) =>
    left.startAt.localeCompare(right.startAt),
  );

  const suggestions: AlternativeSlotSuggestion[] = [];
  for (const activity of sorted.slice(0, 3)) {
    const suggestedStart = new Date(
      toDate(activity.endAt).getTime() + 15 * millisecondsPerMinute,
    );
    const suggestedEnd = new Date(
      suggestedStart.getTime() + candidateMinutes * millisecondsPerMinute,
    );
    suggestions.push({
      endAt: suggestedEnd.toISOString(),
      reason: `Starts after "${activity.title}" to avoid overlap.`,
      startAt: suggestedStart.toISOString(),
    });
  }

  return suggestions;
}

export function evaluateAdvisory(input: {
  activities: AdvisoryActivity[];
  candidate: AdvisoryCandidate;
  commuteSignal: AdvisoryCommuteSignal | null;
  effectivePolicies: EffectivePolicySet;
  weatherSignal: AdvisoryWeatherSignal | null;
}): AdvisoryResult {
  const concerns: AdvisoryConcern[] = [];

  const overlappingActivities = input.activities.filter((activity) =>
    isWindowOverlap(
      { endAt: input.candidate.endAt, startAt: input.candidate.startAt },
      { endAt: activity.endAt, startAt: activity.startAt },
    ),
  );

  if (overlappingActivities.length > 0) {
    concerns.push({
      category: "overlap",
      code: "activity_overlap",
      details: {
        activityIds: overlappingActivities.map((activity) => activity.id),
        overlapCount: overlappingActivities.length,
      },
      level: "warning",
      message: "The selected time overlaps with existing scheduled activities.",
    });
  }

  if (
    input.commuteSignal &&
    ((input.commuteSignal.commuteMinutesBefore ?? Number.POSITIVE_INFINITY) <
      20 ||
      (input.commuteSignal.commuteMinutesAfter ?? Number.POSITIVE_INFINITY) <
        20)
  ) {
    concerns.push({
      category: "commute",
      code: "insufficient_commute_time",
      details: {
        commuteMinutesAfter: input.commuteSignal.commuteMinutesAfter,
        commuteMinutesBefore: input.commuteSignal.commuteMinutesBefore,
        source: input.commuteSignal.source,
      },
      level: "warning",
      message: "Commute time may be insufficient between adjacent activities.",
    });
  }

  if (input.weatherSignal) {
    concerns.push({
      category: "weather_related_preparation",
      code: "weather_preparation_signal",
      details: {
        source: input.weatherSignal.source,
        summary: input.weatherSignal.summary,
      },
      level: "warning",
      message: input.weatherSignal.preparationNote,
    });
  }

  applyWindowPolicyConcerns({
    candidate: input.candidate,
    concerns,
    effectivePolicies: input.effectivePolicies,
  });
  applyRestConcern({
    activities: input.activities,
    candidate: input.candidate,
    concerns,
    effectivePolicies: input.effectivePolicies,
  });
  applyMaxHourConcern({
    activities: input.activities,
    candidate: input.candidate,
    concerns,
    effectivePolicies: input.effectivePolicies,
  });

  return {
    alternativeSlots: buildAlternativeSlots({
      activities: input.activities,
      candidate: input.candidate,
      concerns,
    }),
    canProceed: true,
    concerns,
  };
}

export type OfficialHolidayImportRequest = {
  locationCode: string;
  providerCode: string;
  year: number;
};

export type OfficialHolidayRecord = {
  date: string;
  name: string;
};

export interface HolidayProviderContract {
  loadOfficialHolidays(
    input: OfficialHolidayImportRequest,
  ): Promise<OfficialHolidayRecord[]>;
}

export interface RouteAdvisoryContract {
  estimateCommute(input: {
    arrivalLocation: string;
    departureAt: string;
    departureLocation: string;
  }): Promise<{ minutes: number | null }>;
}

export interface WeatherAdvisoryContract {
  getPreparationSignal(input: {
    at: string;
    location: string;
  }): Promise<{ preparationNote: string; summary: string } | null>;
}
