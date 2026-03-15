export const SCHEDULE_MOD = "schedule";

export type ScheduleOperationalState = "active" | "archived" | "template";
export type ScheduleItemType = "event" | "task";
export type ScheduleTimezoneMode = "utc_constant" | "wall_clock";
export type RecurrenceFrequency = "daily" | "monthly" | "weekly";
export type ScheduleMutationScope = "all" | "selected" | "selected_and_future";
export type ScheduleOccurrenceMutationAction = "cancel" | "move" | "replace";

export type SchedulePauseWindow = {
  endDate: string;
  startDate: string;
};

export type ScheduleRecurrenceRule = {
  count?: number | null;
  dayOfMonth?: number | null;
  frequency: RecurrenceFrequency;
  interval: number;
  pauses: SchedulePauseWindow[];
  weekdays: number[];
};

export type ScheduleItemDefinition = {
  dayOffset: number;
  description: string | null;
  dueTime: string | null;
  durationMinutes: number | null;
  groupKey: string | null;
  id: string;
  itemType: ScheduleItemType;
  location: string | null;
  notes: string | null;
  repetitionMode: "grouped" | "individual";
  startTime: string | null;
  title: string;
  workRelated: boolean;
};

export type ScheduleVersionDefinition = {
  effectiveFromDate: string;
  id: string;
  items: ScheduleItemDefinition[];
  recurrence: ScheduleRecurrenceRule;
  timezone: string;
  timezoneMode: ScheduleTimezoneMode;
};

export type ScheduleDefinition = {
  boundaryEndDate: string | null;
  boundaryStartDate: string | null;
  description: string | null;
  id: string;
  name: string;
  state: ScheduleOperationalState;
  versions: ScheduleVersionDefinition[];
};

export type ScheduleOccurrenceException = {
  action: ScheduleOccurrenceMutationAction;
  detached: boolean;
  id: string;
  occurrenceDate: string;
  overrideItem: Partial<ScheduleItemDefinition> | null;
  movedToDate: string | null;
  targetItemId: string | null;
};

export type ScheduleOccurrenceProjection = {
  detached: boolean;
  dueAt: string | null;
  endsAt: string | null;
  itemDefinitionId: string;
  itemType: ScheduleItemType;
  localDate: string;
  occurrenceDate: string;
  scheduleId: string;
  scheduleVersionId: string;
  startsAt: string | null;
  timezone: string;
  timezoneMode: ScheduleTimezoneMode;
  title: string;
};

export type ScheduleValidationMessage = {
  field: string;
  level: "error" | "warning";
  message: string;
};

type WindowBounds = {
  from: string;
  to: string;
};

type DateParts = {
  day: number;
  month: number;
  year: number;
};

type DateTimeParts = DateParts & {
  hours: number;
  minutes: number;
  seconds: number;
};

type TimeToken = {
  hours: number;
  minutes: number;
};

const millisecondsPerMinute = 60_000;
const zonedDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function parseDateToken(value: string): DateParts {
  const normalized = normalizeDateToken(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    throw new Error(`Invalid date token: ${value}`);
  }

  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function parseTimeToken(value: string): TimeToken {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid time token: ${value}`);
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function dateTokenFromParts(parts: DateParts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function compareDateTokens(left: string, right: string) {
  return normalizeDateToken(left).localeCompare(normalizeDateToken(right));
}

function normalizeDateToken(value: Date | string) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && value.includes("T")) {
    return value.slice(0, 10);
  }

  return value;
}

function addDays(dateToken: string, amount: number) {
  const parts = parseDateToken(dateToken);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateToken: string, amount: number) {
  const parts = parseDateToken(dateToken);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const initialDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + amount, 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(initialDay, lastDay));
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateToken: string) {
  const parts = parseDateToken(dateToken);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function dayOfMonthOf(dateToken: string) {
  return parseDateToken(dateToken).day;
}

function getDateTimeFormatter(timezone: string) {
  const cached = zonedDateTimeFormatterCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  zonedDateTimeFormatterCache.set(timezone, formatter);
  return formatter;
}

function partsFromDateTime(date: Date, timezone: string): DateTimeParts {
  const parts = getDateTimeFormatter(timezone).formatToParts(date);
  const result = {
    day: 0,
    hours: 0,
    minutes: 0,
    month: 0,
    seconds: 0,
    year: 0,
  };

  for (const part of parts) {
    if (part.type === "year") {
      result.year = Number(part.value);
    }
    if (part.type === "month") {
      result.month = Number(part.value);
    }
    if (part.type === "day") {
      result.day = Number(part.value);
    }
    if (part.type === "hour") {
      result.hours = Number(part.value);
    }
    if (part.type === "minute") {
      result.minutes = Number(part.value);
    }
    if (part.type === "second") {
      result.seconds = Number(part.value);
    }
  }

  return result;
}

function localTimeDifferenceMinutes(
  desired: DateTimeParts,
  actual: DateTimeParts,
) {
  const desiredEpoch = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hours,
    desired.minutes,
    desired.seconds,
  );
  const actualEpoch = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hours,
    actual.minutes,
    actual.seconds,
  );
  return Math.round((desiredEpoch - actualEpoch) / millisecondsPerMinute);
}

function matchesLocalDateTime(left: DateTimeParts, right: DateTimeParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hours === right.hours &&
    left.minutes === right.minutes
  );
}

function resolveLocalDateTimeToIso(input: {
  dateToken: string;
  timeToken: string;
  timezone: string;
}) {
  const date = parseDateToken(input.dateToken);
  const time = parseTimeToken(input.timeToken);
  const desired: DateTimeParts = {
    day: date.day,
    hours: time.hours,
    minutes: time.minutes,
    month: date.month,
    seconds: 0,
    year: date.year,
  };

  let guess = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hours,
    desired.minutes,
    0,
  );

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = partsFromDateTime(new Date(guess), input.timezone);
    const difference = localTimeDifferenceMinutes(desired, actual);
    if (difference === 0) {
      return new Date(guess).toISOString();
    }
    guess += difference * millisecondsPerMinute;
  }

  let best = new Date(guess);
  let bestParts = partsFromDateTime(best, input.timezone);
  if (matchesLocalDateTime(desired, bestParts)) {
    return best.toISOString();
  }

  // Resolve DST gaps by selecting the first valid local time after the requested wall clock.
  for (let minuteStep = 0; minuteStep < 180; minuteStep += 1) {
    best = new Date(best.getTime() + millisecondsPerMinute);
    bestParts = partsFromDateTime(best, input.timezone);
    const difference = localTimeDifferenceMinutes(desired, bestParts);
    if (difference <= 0) {
      return best.toISOString();
    }
  }

  return best.toISOString();
}

function timeZoneInstantForOccurrence(input: {
  item: ScheduleItemDefinition;
  occurrenceDate: string;
  timezone: string;
  timezoneMode: ScheduleTimezoneMode;
  versionEffectiveFromDate: string;
}) {
  const timeToken =
    input.item.itemType === "event" ? input.item.startTime : input.item.dueTime;
  if (!timeToken) {
    return null;
  }

  if (input.timezoneMode === "wall_clock") {
    return resolveLocalDateTimeToIso({
      dateToken: input.occurrenceDate,
      timeToken,
      timezone: input.timezone,
    });
  }

  const referenceDate = addDays(
    input.versionEffectiveFromDate,
    input.item.dayOffset,
  );
  const referenceInstant = resolveLocalDateTimeToIso({
    dateToken: referenceDate,
    timeToken,
    timezone: input.timezone,
  });
  const reference = new Date(referenceInstant);
  const date = parseDateToken(input.occurrenceDate);

  return new Date(
    Date.UTC(
      date.year,
      date.month - 1,
      date.day,
      reference.getUTCHours(),
      reference.getUTCMinutes(),
      reference.getUTCSeconds(),
    ),
  ).toISOString();
}

function isDateWithinPauses(dateToken: string, pauses: SchedulePauseWindow[]) {
  return pauses.some(
    (pause) =>
      compareDateTokens(dateToken, pause.startDate) >= 0 &&
      compareDateTokens(dateToken, pause.endDate) <= 0,
  );
}

function normalizeWeekdays(rule: ScheduleRecurrenceRule, anchorDate: string) {
  if (rule.frequency !== "weekly") {
    return [];
  }

  if (rule.weekdays.length > 0) {
    return [...rule.weekdays].sort((left, right) => left - right);
  }

  return [weekdayOf(anchorDate)];
}

function enumerateRuleDates(input: {
  boundaryEndDate: string | null;
  boundaryStartDate: string | null;
  nextVersionDate: string | null;
  rule: ScheduleRecurrenceRule;
  versionEffectiveFromDate: string;
  window: WindowBounds;
}) {
  const effectiveStart =
    compareDateTokens(input.window.from, input.versionEffectiveFromDate) > 0
      ? input.window.from
      : input.versionEffectiveFromDate;
  const effectiveEndCandidates = [
    input.window.to,
    input.boundaryEndDate,
    input.nextVersionDate ? addDays(input.nextVersionDate, -1) : null,
  ].filter((value): value is string => Boolean(value));
  const effectiveEnd = effectiveEndCandidates.sort(compareDateTokens)[0];

  const startFloor = input.boundaryStartDate ?? input.versionEffectiveFromDate;
  if (compareDateTokens(effectiveStart, effectiveEnd) > 0) {
    return [];
  }

  if (input.rule.frequency === "daily") {
    const results: string[] = [];
    let cursor = startFloor;
    let emitted = 0;
    while (compareDateTokens(cursor, effectiveEnd) <= 0) {
      if (
        compareDateTokens(cursor, effectiveStart) >= 0 &&
        !isDateWithinPauses(cursor, input.rule.pauses)
      ) {
        results.push(cursor);
      }

      emitted += 1;
      if (input.rule.count && emitted >= input.rule.count) {
        break;
      }
      cursor = addDays(cursor, input.rule.interval);
    }
    return results;
  }

  if (input.rule.frequency === "weekly") {
    const results: string[] = [];
    const weekdays = normalizeWeekdays(input.rule, startFloor);
    let weekCursor = startFloor;
    let emitted = 0;

    while (compareDateTokens(weekCursor, effectiveEnd) <= 0) {
      for (const weekday of weekdays) {
        const shift = weekday - weekdayOf(weekCursor);
        const candidate = addDays(weekCursor, shift);
        if (compareDateTokens(candidate, startFloor) < 0) {
          continue;
        }

        if (compareDateTokens(candidate, effectiveEnd) > 0) {
          continue;
        }

        if (
          compareDateTokens(candidate, effectiveStart) >= 0 &&
          !isDateWithinPauses(candidate, input.rule.pauses)
        ) {
          results.push(candidate);
        }

        emitted += 1;
        if (input.rule.count && emitted >= input.rule.count) {
          return results.sort(compareDateTokens);
        }
      }

      weekCursor = addDays(weekCursor, input.rule.interval * 7);
    }

    return results.sort(compareDateTokens);
  }

  const results: string[] = [];
  const referenceDay = input.rule.dayOfMonth ?? dayOfMonthOf(startFloor);
  let monthCursor = startFloor;
  let emitted = 0;

  while (compareDateTokens(monthCursor, effectiveEnd) <= 0) {
    const month = parseDateToken(monthCursor);
    const lastDay = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
    const candidate = dateTokenFromParts({
      day: Math.min(referenceDay, lastDay),
      month: month.month,
      year: month.year,
    });

    if (
      compareDateTokens(candidate, startFloor) >= 0 &&
      compareDateTokens(candidate, effectiveEnd) <= 0
    ) {
      if (
        compareDateTokens(candidate, effectiveStart) >= 0 &&
        !isDateWithinPauses(candidate, input.rule.pauses)
      ) {
        results.push(candidate);
      }

      emitted += 1;
      if (input.rule.count && emitted >= input.rule.count) {
        break;
      }
    }

    monthCursor = addMonths(monthCursor, input.rule.interval);
  }

  return results;
}

function versionForDate(
  versions: ScheduleVersionDefinition[],
  occurrenceDate: string,
) {
  let selected: ScheduleVersionDefinition | null = null;

  for (const version of versions) {
    if (compareDateTokens(version.effectiveFromDate, occurrenceDate) <= 0) {
      selected = version;
      continue;
    }
    break;
  }

  return selected;
}

export function summarizeRecurrence(rule: ScheduleRecurrenceRule) {
  const cadence =
    rule.frequency === "daily"
      ? rule.interval === 1
        ? "Every day"
        : `Every ${rule.interval} days`
      : rule.frequency === "weekly"
        ? rule.interval === 1
          ? "Every week"
          : `Every ${rule.interval} weeks`
        : rule.interval === 1
          ? "Every month"
          : `Every ${rule.interval} months`;

  if (rule.frequency === "weekly" && rule.weekdays.length > 0) {
    const labels = rule.weekdays.map(
      (weekday) =>
        ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday] ?? "?",
    );
    return `${cadence} on ${labels.join(", ")}`;
  }

  if (rule.frequency === "monthly" && rule.dayOfMonth) {
    return `${cadence} on day ${rule.dayOfMonth}`;
  }

  if (rule.pauses.length > 0) {
    return `${cadence}; ${rule.pauses.length} pause window${rule.pauses.length === 1 ? "" : "s"}`;
  }

  return cadence;
}

export function describeTimezoneMode(mode: ScheduleTimezoneMode) {
  return mode === "wall_clock"
    ? "Keep local wall-clock time constant"
    : "Keep UTC instant constant";
}

export function validateScheduleDefinition(
  definition: ScheduleDefinition,
): ScheduleValidationMessage[] {
  const issues: ScheduleValidationMessage[] = [];

  if (definition.name.trim().length < 2) {
    issues.push({
      field: "name",
      level: "error",
      message: "Schedule name must be at least two characters.",
    });
  }

  if (definition.versions.length === 0) {
    issues.push({
      field: "versions",
      level: "error",
      message: "At least one schedule version is required.",
    });
    return issues;
  }

  const seenDates = new Set<string>();
  for (const version of definition.versions) {
    if (seenDates.has(version.effectiveFromDate)) {
      issues.push({
        field: "versions",
        level: "error",
        message: "Each version must use a unique effective-from date.",
      });
    }
    seenDates.add(version.effectiveFromDate);

    if (version.items.length === 0) {
      issues.push({
        field: `version:${version.id}:items`,
        level: "error",
        message: "Each version must include at least one event or task item.",
      });
    }

    if (version.recurrence.interval < 1) {
      issues.push({
        field: `version:${version.id}:recurrence.interval`,
        level: "error",
        message: "Recurrence interval must be at least 1.",
      });
    }

    if (
      version.recurrence.frequency === "monthly" &&
      version.recurrence.dayOfMonth != null &&
      (version.recurrence.dayOfMonth < 1 || version.recurrence.dayOfMonth > 31)
    ) {
      issues.push({
        field: `version:${version.id}:recurrence.dayOfMonth`,
        level: "error",
        message: "Monthly day-of-month must be between 1 and 31.",
      });
    }

    for (const item of version.items) {
      if (item.itemType === "event") {
        if (
          !item.startTime ||
          !item.durationMinutes ||
          item.durationMinutes <= 0
        ) {
          issues.push({
            field: `item:${item.id}`,
            level: "error",
            message:
              "Event items require a start time and a positive duration.",
          });
        }
      } else if (!item.dueTime) {
        issues.push({
          field: `item:${item.id}`,
          level: "error",
          message: "Task items require a due time.",
        });
      }
    }
  }

  if (
    definition.boundaryStartDate &&
    definition.boundaryEndDate &&
    compareDateTokens(
      definition.boundaryStartDate,
      definition.boundaryEndDate,
    ) > 0
  ) {
    issues.push({
      field: "boundaryEndDate",
      level: "error",
      message: "Boundary end date must be on or after the boundary start date.",
    });
  }

  return issues;
}

export function materializeScheduleOccurrences(input: {
  definition: ScheduleDefinition;
  exceptions: ScheduleOccurrenceException[];
  window: WindowBounds;
}) {
  const issues = validateScheduleDefinition(input.definition).filter(
    (issue) => issue.level === "error",
  );
  if (issues.length > 0) {
    return {
      projections: [] as ScheduleOccurrenceProjection[],
      validation: issues,
    };
  }

  const versions = [...input.definition.versions].sort((left, right) =>
    compareDateTokens(left.effectiveFromDate, right.effectiveFromDate),
  );
  const projections: ScheduleOccurrenceProjection[] = [];

  for (let index = 0; index < versions.length; index += 1) {
    const version = versions[index];
    const nextVersionDate = versions[index + 1]?.effectiveFromDate ?? null;
    const occurrenceDates = enumerateRuleDates({
      boundaryEndDate: input.definition.boundaryEndDate,
      boundaryStartDate: input.definition.boundaryStartDate,
      nextVersionDate,
      rule: version.recurrence,
      versionEffectiveFromDate: version.effectiveFromDate,
      window: input.window,
    });

    for (const occurrenceDate of occurrenceDates) {
      const cancelException = input.exceptions.find(
        (exception) =>
          exception.action === "cancel" &&
          exception.occurrenceDate === occurrenceDate,
      );
      if (cancelException) {
        continue;
      }

      const moveException = input.exceptions.find(
        (exception) =>
          exception.action === "move" &&
          exception.occurrenceDate === occurrenceDate,
      );
      const effectiveOccurrenceDate =
        moveException?.movedToDate && moveException.movedToDate.trim()
          ? moveException.movedToDate
          : occurrenceDate;

      for (const item of version.items) {
        const replaceException = input.exceptions.find(
          (exception) =>
            exception.action === "replace" &&
            exception.occurrenceDate === occurrenceDate &&
            exception.targetItemId === item.id,
        );
        const effectiveItem = replaceException?.overrideItem
          ? {
              ...item,
              ...replaceException.overrideItem,
            }
          : item;
        const localDate = addDays(
          effectiveOccurrenceDate,
          effectiveItem.dayOffset,
        );
        const instant = timeZoneInstantForOccurrence({
          item: effectiveItem,
          occurrenceDate: localDate,
          timezone: version.timezone,
          timezoneMode: version.timezoneMode,
          versionEffectiveFromDate: version.effectiveFromDate,
        });

        projections.push({
          detached: Boolean(
            moveException?.detached || replaceException?.detached,
          ),
          dueAt: effectiveItem.itemType === "task" ? instant : null,
          endsAt:
            effectiveItem.itemType === "event" &&
            instant &&
            effectiveItem.durationMinutes
              ? new Date(
                  new Date(instant).getTime() +
                    effectiveItem.durationMinutes * millisecondsPerMinute,
                ).toISOString()
              : null,
          itemDefinitionId: effectiveItem.id,
          itemType: effectiveItem.itemType,
          localDate,
          occurrenceDate,
          scheduleId: input.definition.id,
          scheduleVersionId: version.id,
          startsAt: effectiveItem.itemType === "event" ? instant : null,
          timezone: version.timezone,
          timezoneMode: version.timezoneMode,
          title: effectiveItem.title,
        });
      }
    }
  }

  const deduped = new Map<string, ScheduleOccurrenceProjection>();
  for (const projection of projections) {
    deduped.set(
      `${projection.occurrenceDate}:${projection.itemDefinitionId}`,
      projection,
    );
  }

  return {
    projections: [...deduped.values()].sort((left, right) => {
      const leftTime = left.startsAt ?? left.endsAt ?? "";
      const rightTime = right.startsAt ?? right.endsAt ?? "";
      const byOccurrence = compareDateTokens(left.localDate, right.localDate);
      if (byOccurrence !== 0) {
        return byOccurrence;
      }
      return leftTime.localeCompare(rightTime);
    }),
    validation: validateScheduleDefinition(input.definition),
  };
}

export function previewUpcomingOccurrences(input: {
  definition: ScheduleDefinition;
  exceptions: ScheduleOccurrenceException[];
  fromDate: string;
  limit: number;
}) {
  const result = materializeScheduleOccurrences({
    definition: input.definition,
    exceptions: input.exceptions,
    window: {
      from: input.fromDate,
      to: addDays(input.fromDate, 180),
    },
  });

  const grouped = new Map<
    string,
    {
      date: string;
      items: Array<Pick<ScheduleOccurrenceProjection, "itemType" | "title">>;
    }
  >();

  for (const projection of result.projections) {
    if (!grouped.has(projection.occurrenceDate)) {
      grouped.set(projection.occurrenceDate, {
        date: projection.localDate,
        items: [],
      });
    }
    grouped.get(projection.occurrenceDate)!.items.push({
      itemType: projection.itemType,
      title: projection.title,
    });
    if (grouped.size >= input.limit) {
      break;
    }
  }

  return {
    occurrences: [...grouped.entries()].map(([occurrenceDate, value]) => ({
      date: value.date,
      items: value.items,
      occurrenceDate,
      versionId:
        versionForDate(input.definition.versions, occurrenceDate)?.id ?? null,
    })),
    validation: result.validation,
  };
}

export function countConflictingExceptions(input: {
  anchorDate: string;
  exceptions: ScheduleOccurrenceException[];
  includePast: boolean;
  scope: ScheduleMutationScope;
}) {
  return input.exceptions.filter((exception) => {
    if (input.scope === "selected") {
      return exception.occurrenceDate === input.anchorDate;
    }

    if (input.scope === "selected_and_future") {
      return compareDateTokens(exception.occurrenceDate, input.anchorDate) >= 0;
    }

    if (input.includePast) {
      return true;
    }

    return compareDateTokens(exception.occurrenceDate, input.anchorDate) >= 0;
  });
}

export function shiftVersionItems(
  items: ScheduleItemDefinition[],
  dayDelta: number,
) {
  return items.map((item) => ({
    ...item,
    dayOffset: item.dayOffset + dayDelta,
  }));
}

export function replaceVersionItem(input: {
  items: ScheduleItemDefinition[];
  replacement: Partial<ScheduleItemDefinition>;
  targetItemId: string;
}) {
  return input.items.map((item) =>
    item.id === input.targetItemId ? { ...item, ...input.replacement } : item,
  );
}

export function makeVersionEffective(input: {
  definition: ScheduleDefinition;
  version: ScheduleVersionDefinition;
  effectiveFromDate: string;
  includePast: boolean;
}) {
  const versions = [...input.definition.versions].sort((left, right) =>
    compareDateTokens(left.effectiveFromDate, right.effectiveFromDate),
  );

  if (input.includePast) {
    return [input.version];
  }

  return [
    ...versions.filter(
      (version) =>
        compareDateTokens(version.effectiveFromDate, input.effectiveFromDate) <
        0,
    ),
    {
      ...input.version,
      effectiveFromDate: input.effectiveFromDate,
    },
  ];
}
