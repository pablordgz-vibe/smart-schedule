import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from './app.routes';
import { ContextService } from './context.service';
import { SchedulesComponent } from './schedules';
import { SchedApiError, SchedApiService } from './sched-api.service';

function buildScheduleDetail(state: 'active' | 'template' = 'active') {
  return {
    schedule: {
      boundaryEndDate: null,
      boundaryStartDate: '2026-03-16',
      description: 'Primary rotation',
      id: 'schedule-1',
      name: 'Support rota',
      state,
      versions: [
        {
          effectiveFromDate: '2026-03-16',
          id: 'version-1',
          items: [
            {
              dayOffset: 0,
              dueTime: '11:00',
              id: 'task-1',
              itemType: 'task',
              repetitionMode: 'individual',
              title: 'Checklist',
              workRelated: true,
            },
            {
              dayOffset: 0,
              durationMinutes: 60,
              id: 'event-1',
              itemType: 'event',
              repetitionMode: 'grouped',
              startTime: '09:00',
              title: 'Opening shift',
              workRelated: true,
            },
          ],
          recurrence: {
            frequency: 'weekly',
            interval: 1,
            pauses: [],
            weekdays: [1],
          },
          timezone: 'UTC',
          timezoneMode: 'wall_clock',
        },
      ],
    },
  };
}

function buildScheduleSummary(state: 'active' | 'template' = 'template') {
  return {
    assignmentCount: 0,
    boundaryEndDate: null,
    boundaryStartDate: '2026-03-16',
    description: 'Primary rotation',
    exceptionCount: 1,
    id: 'schedule-1',
    itemSummary: { eventCount: 1, taskCount: 1, total: 2 },
    name: 'Support rota',
    nextOccurrences: [
      {
        date: '2026-03-16',
        items: [
          { itemType: 'event' as const, title: 'Opening shift' },
          { itemType: 'task' as const, title: 'Checklist' },
        ],
        occurrenceDate: '2026-03-16',
        versionId: 'version-1',
      },
    ],
    recurrenceSummary: 'Every week on Mon',
    state,
    timezone: 'UTC',
    timezoneMode: 'wall_clock' as const,
    timezoneModeLabel: 'Keep local wall-clock time constant',
    validation: [],
    versionCount: 1,
  };
}

function configureComponent(schedApi: Record<string, unknown>) {
  TestBed.configureTestingModule({
    imports: [SchedulesComponent],
    providers: [
      provideRouter(routes),
      { provide: SchedApiService, useValue: schedApi },
      {
        provide: ContextService,
        useValue: {
          activeContext: signal({
            contextLabel: 'Personal',
            organizationId: null,
            type: 'personal',
          }),
          getContextLabel: () => 'Personal',
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap({ tab: 'template' }),
          },
        },
      },
    ],
  });

  return TestBed.createComponent(SchedulesComponent);
}

describe('SchedulesComponent', () => {
  it('loads schedules and surfaces overwrite-confirmation guidance for occurrence updates', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn().mockResolvedValue(buildScheduleDetail('active')),
      listOccurrences: vi.fn().mockResolvedValue([
        {
          detached: false,
          dueAt: '2026-03-16T11:00:00.000Z',
          endsAt: null,
          itemDefinitionId: 'task-1',
          itemType: 'task',
          localDate: '2026-03-16',
          occurrenceDate: '2026-03-16',
          scheduleId: 'schedule-1',
          scheduleVersionId: 'version-1',
          startsAt: null,
          timezone: 'UTC',
          timezoneMode: 'wall_clock',
          title: 'Checklist',
        },
      ]),
      listSchedules: vi.fn().mockResolvedValue([buildScheduleSummary()]),
      mutateOccurrence: vi.fn().mockRejectedValue(
        new SchedApiError('Conflict', {
          dates: ['2026-03-16'],
          message: 'Conflict',
        }),
      ),
      update: vi.fn(),
    };

    const fixture = configureComponent(schedApi);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Support rota');
    expect(host.textContent).toContain('Occurrence calendar');

    await fixture.componentInstance.openOccurrenceModal(
      'schedule-1',
      buildScheduleSummary().nextOccurrences[0],
      'replace',
    );

    await fixture.componentInstance.submitOccurrenceModal();

    expect(fixture.componentInstance.occurrenceModal()?.error).toContain(
      'conflicts with existing exceptions',
    );
  });

  it('duplicates, activates, and routes schedules while preserving canonical ids on updates', async () => {
    const schedApi = {
      create: vi.fn().mockResolvedValue({}),
      getSchedule: vi.fn().mockResolvedValue(buildScheduleDetail('template')),
      listOccurrences: vi.fn().mockResolvedValue([]),
      listSchedules: vi.fn().mockResolvedValue([buildScheduleSummary('template')]),
      mutateOccurrence: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };

    const fixture = configureComponent(schedApi);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    await component.duplicateSchedule('schedule-1');
    await component.toggleScheduleState(buildScheduleSummary('template'));
    component.openBuilder('schedule-1');
    component.setTab('active');
    component.shiftCalendarMonth(1);

    expect(component.activeTab()).toBe('active');
    expect(component.trackBySchedule(0, buildScheduleSummary())).toBe('schedule-1');
    expect(component.formatOccurrence('2026-03-16')).toContain('16');
    expect(component.formatOccurrenceTime(null)).toBe('No time set');
    expect(component.formatOccurrenceTime('2026-03-16T11:00:00.000Z')).not.toBe('No time set');
    expect(component.calendarMonthStart()).toMatch(/^20\d{2}-\d{2}-01$/);
    expect(schedApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Support rota copy',
        state: 'template',
        versions: [
          expect.objectContaining({
            id: undefined,
            items: [
              expect.objectContaining({ id: undefined }),
              expect.objectContaining({ id: undefined }),
            ],
          }),
        ],
      }),
    );
    const [, updatePayload] = schedApi.update.mock.calls[0] as [
      string,
      {
        definition: {
          state: 'active' | 'archived' | 'template';
          versions: Array<{
            id?: string;
            items: Array<{ id?: string }>;
          }>;
        };
      },
    ];
    expect(schedApi.update).toHaveBeenCalledWith('schedule-1', updatePayload);
    expect(updatePayload.definition.state).toBe('active');
    expect(updatePayload.definition.versions[0]?.id).toBe('version-1');
    expect(updatePayload.definition.versions[0]?.items[0]?.id).toBe('task-1');
    expect(updatePayload.definition.versions[0]?.items[1]?.id).toBe('event-1');
    expect(component.message()).toBe('Template activated.');
    expect(navigateSpy).toHaveBeenCalledWith(['/schedules/builder'], {
      queryParams: { scheduleId: 'schedule-1' },
    });
  });

  it('loads calendar occurrences and submits successful replacement updates', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn().mockResolvedValue(buildScheduleDetail('active')),
      listOccurrences: vi
        .fn()
        .mockResolvedValueOnce([
          {
            detached: false,
            dueAt: null,
            endsAt: '2026-03-16T10:00:00.000Z',
            itemDefinitionId: 'event-1',
            itemType: 'event',
            localDate: '2026-03-16',
            occurrenceDate: '2026-03-16',
            scheduleId: 'schedule-1',
            scheduleVersionId: 'version-1',
            startsAt: '2026-03-16T09:00:00.000Z',
            timezone: 'UTC',
            timezoneMode: 'wall_clock',
            title: 'Opening shift',
          },
        ])
        .mockResolvedValueOnce([]),
      listSchedules: vi.fn().mockResolvedValue([buildScheduleSummary('active')]),
      mutateOccurrence: vi.fn().mockResolvedValue({ occurrences: [] }),
      update: vi.fn(),
    };

    const fixture = configureComponent(schedApi);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    await (
      component as { loadCalendar(scheduleId: string, monthStart: string): Promise<void> }
    ).loadCalendar('schedule-1', '2026-03-01');
    component.selectedCalendarDay.set('2026-03-16');
    expect(component.selectedCalendarEntries()).toHaveLength(1);

    await component.openOccurrenceModal(
      'schedule-1',
      buildScheduleSummary('active').nextOccurrences[0],
      'replace',
    );
    component.patchModal({
      detached: true,
      includePast: true,
      selectedItemId: 'event-1',
    });
    component.replacementTitle.set('Coverage shift');
    component.replacementTime.set('10:30');
    await component.submitOccurrenceModal();

    const [, , mutatePayload] = schedApi.mutateOccurrence.mock.calls[0] as [
      string,
      string,
      {
        action: 'cancel' | 'move' | 'replace';
        detached?: boolean;
        includePast?: boolean;
        movedToDate?: string | null;
        overrideItem?: { id?: string; startTime?: string | null; title?: string } | null;
        overwriteExceptions?: boolean;
        scope: 'all' | 'selected' | 'selected_and_future';
        targetItemId?: string | null;
      },
    ];
    expect(schedApi.mutateOccurrence).toHaveBeenCalledWith(
      'schedule-1',
      '2026-03-16',
      mutatePayload,
    );
    expect(mutatePayload).toMatchObject({
      action: 'replace',
      detached: true,
      includePast: true,
      movedToDate: null,
      overwriteExceptions: false,
      scope: 'selected',
      targetItemId: 'event-1',
    });
    expect(mutatePayload.overrideItem).toMatchObject({
      id: 'event-1',
      startTime: '10:30',
      title: 'Coverage shift',
    });
    expect(component.message()).toBe('Occurrence update applied.');
    expect(component.occurrenceModal()).toBeNull();
  });

  it('surfaces calendar load failures without crashing the library view', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn(),
      listOccurrences: vi.fn().mockRejectedValue(new Error('Calendar offline')),
      listSchedules: vi.fn().mockResolvedValue([buildScheduleSummary('active')]),
      mutateOccurrence: vi.fn(),
      update: vi.fn(),
    };

    const fixture = configureComponent(schedApi);
    fixture.detectChanges();
    await fixture.whenStable();

    await (
      fixture.componentInstance as {
        loadCalendar(scheduleId: string, monthStart: string): Promise<void>;
      }
    ).loadCalendar('schedule-1', '2026-03-01');

    expect(fixture.componentInstance.calendarError()).toBe('Calendar offline');
    expect(fixture.componentInstance.isCalendarLoading()).toBe(false);
  });

  it('submits move mutations and tolerates missing schedule details in the modal', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn().mockRejectedValue(new Error('Schedule unavailable')),
      listOccurrences: vi.fn().mockResolvedValue([]),
      listSchedules: vi.fn().mockResolvedValue([buildScheduleSummary('active')]),
      mutateOccurrence: vi.fn().mockResolvedValue({ occurrences: [] }),
      update: vi.fn(),
    };

    const fixture = configureComponent(schedApi);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    await component.openOccurrenceModal(
      'schedule-1',
      buildScheduleSummary('active').nextOccurrences[0],
      'move',
    );
    component.patchModal({
      detached: true,
      includePast: true,
      movedToDate: '2026-03-23',
      overwriteExceptions: true,
      scope: 'selected_and_future',
    });
    await component.submitOccurrenceModal();

    expect(schedApi.mutateOccurrence).toHaveBeenCalledWith('schedule-1', '2026-03-16', {
      action: 'move',
      detached: true,
      includePast: true,
      movedToDate: '2026-03-23',
      overrideItem: null,
      overwriteExceptions: true,
      scope: 'selected_and_future',
      targetItemId: null,
    });
    expect(component.modalScheduleName()).toBe('selected schedule');
    expect(component.message()).toBe('Occurrence update applied.');
  });
});
