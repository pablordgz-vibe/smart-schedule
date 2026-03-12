export const CAL_MOD = "cal";

export type CalendarContextType = "organization" | "personal";
export type CalendarItemType = "event" | "task";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed";

export type CalendarContext = {
  contextType: CalendarContextType;
  organizationId: string | null;
};

export type AllocationSummary = {
  allocatedMinutes: number;
  estimateMinutes: number | null;
  overAllocated: boolean;
  remainingMinutes: number | null;
};

export function resolveEventEnd(input: {
  allDay: boolean;
  durationMinutes?: number | null;
  endAt?: Date | null;
  startAt: Date;
}) {
  if (input.endAt) {
    return input.endAt;
  }

  const durationMinutes = input.durationMinutes ?? 0;
  if (durationMinutes <= 0) {
    throw new Error("Event duration must be greater than zero.");
  }

  return new Date(input.startAt.getTime() + durationMinutes * 60_000);
}

export function summarizeAllocation(input: {
  allocatedMinutes: number;
  estimateMinutes: number | null;
}): AllocationSummary {
  const estimateMinutes = input.estimateMinutes;
  if (estimateMinutes == null || estimateMinutes <= 0) {
    return {
      allocatedMinutes: input.allocatedMinutes,
      estimateMinutes: estimateMinutes ?? null,
      overAllocated: false,
      remainingMinutes: null,
    };
  }

  const remaining = estimateMinutes - input.allocatedMinutes;
  return {
    allocatedMinutes: input.allocatedMinutes,
    estimateMinutes,
    overAllocated: remaining < 0,
    remainingMinutes: Math.max(remaining, 0),
  };
}
