import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { DirtyStateService } from './dirty-state.service';
import { routes } from './app.routes';
import { ScheduleBuilderComponent } from './schedule-builder.component';
import { SchedApiError, SchedApiService } from './sched-api.service';

function buildRoute(query: Record<string, string>) {
  return {
    snapshot: {
      queryParamMap: convertToParamMap(query),
    },
  };
}

describe('ScheduleBuilderComponent', () => {
  it('previews and creates a schedule from the dedicated builder', async () => {
    const schedApi = {
      create: vi.fn().mockResolvedValue({}),
      getSchedule: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        upcomingOccurrences: [
          {
            date: '2026-03-16',
            items: [{ itemType: 'event', title: 'Opening shift' }],
            occurrenceDate: '2026-03-16',
            versionId: 'version-1',
          },
        ],
        validation: [],
      }),
      update: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ScheduleBuilderComponent],
      providers: [
        provideRouter(routes),
        DirtyStateService,
        { provide: SchedApiService, useValue: schedApi },
        {
          provide: ActivatedRoute,
          useValue: buildRoute({}),
        },
      ],
    });

    const fixture = TestBed.createComponent(ScheduleBuilderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.patchDraft({
      name: 'Support rota',
      state: 'active',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(schedApi.preview).toHaveBeenCalled();
    expect(fixture.componentInstance.previewOccurrences()[0]?.date).toBe('2026-03-16');

    await fixture.componentInstance.save();

    expect(schedApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Support rota',
        state: 'active',
      }),
    );
  });

  it('manages items, recurrence phases, and preview failures in the builder state', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn(),
      preview: vi.fn().mockResolvedValue({
        upcomingOccurrences: [],
        validation: [{ field: 'name', level: 'warning', message: 'Name is short.' }],
      }),
      update: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ScheduleBuilderComponent],
      providers: [
        provideRouter(routes),
        DirtyStateService,
        { provide: SchedApiService, useValue: schedApi },
        {
          provide: ActivatedRoute,
          useValue: buildRoute({}),
        },
      ],
    });

    const fixture = TestBed.createComponent(ScheduleBuilderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.patchDraft({
      boundaryEndDate: '2026-04-30',
      description: 'Reusable support pattern',
      name: 'Support rota',
    });
    component.addItem('task');
    component.patchItem(1, {
      dueTime: '14:30',
      title: 'Checklist',
    });
    component.changeItemType(0, 'task');
    component.removeItem(1);
    component.addVersion();
    component.patchVersion(1, {
      effectiveFromDate: '2026-04-01',
      timezone: 'Europe/Madrid',
    });
    component.patchRecurrence(1, {
      dayOfMonth: 2,
      frequency: 'monthly',
      interval: 2,
    });
    component.addPause(1);
    component.patchPause(1, 0, {
      endDate: '2026-04-08',
      startDate: '2026-04-02',
    });
    component.removePause(1, 0);
    component.toggleWeekday(0, 3);
    component.toggleWeekday(0, 3);
    component.removeVersion(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.draft().name).toBe('Support rota');
    expect(component.primaryVersion().items).toHaveLength(1);
    expect(component.primaryVersion().items[0]).toMatchObject({
      dueTime: '11:00',
      itemType: 'task',
      startTime: null,
    });
    expect(component.draft().versions).toHaveLength(1);
    expect(component.toInt('7', 1)).toBe(7);
    expect(component.toInt('abc', 4)).toBe(4);

    await component.refreshPreview();
    expect(component.validation()).toEqual([
      { field: 'name', level: 'warning', message: 'Name is short.' },
    ]);

    schedApi.preview.mockRejectedValueOnce(new Error('Preview offline'));
    await component.refreshPreview();
    expect(component.error()).toBe('Preview offline');
    expect(component.isPreviewLoading()).toBe(false);
  });

  it('loads active schedules for editing and confirms scoped saves when exceptions conflict', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn().mockResolvedValue({
        schedule: {
          boundaryEndDate: null,
          boundaryStartDate: '2026-03-16',
          description: 'Live pattern',
          id: 'schedule-1',
          name: 'Support rota',
          state: 'active',
          versions: [
            {
              effectiveFromDate: '2026-03-16',
              id: 'version-1',
              items: [
                {
                  dayOffset: 0,
                  dueTime: '11:00',
                  itemType: 'task',
                  repetitionMode: 'individual',
                  title: 'Checklist',
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
        upcomingOccurrences: [
          {
            date: '2026-03-16',
            items: [{ itemType: 'task', title: 'Checklist' }],
            occurrenceDate: '2026-03-16',
            versionId: 'version-1',
          },
        ],
        validation: [],
      }),
      preview: vi.fn().mockResolvedValue({
        upcomingOccurrences: [
          {
            date: '2026-03-16',
            items: [{ itemType: 'task', title: 'Checklist' }],
            occurrenceDate: '2026-03-16',
            versionId: 'version-1',
          },
        ],
        validation: [],
      }),
      update: vi
        .fn()
        .mockRejectedValueOnce(
          new SchedApiError('Conflict', {
            dates: ['2026-03-23'],
            message: 'Conflict',
          }),
        )
        .mockResolvedValueOnce({}),
    };

    TestBed.configureTestingModule({
      imports: [ScheduleBuilderComponent],
      providers: [
        provideRouter(routes),
        DirtyStateService,
        { provide: SchedApiService, useValue: schedApi },
        {
          provide: ActivatedRoute,
          useValue: buildRoute({ scheduleId: 'schedule-1' }),
        },
      ],
    });

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ScheduleBuilderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.patchDraft({ description: 'Updated live pattern' });

    await component.save();
    expect(component.saveScope()).toMatchObject({
      anchorDate: '2026-03-16',
      scope: 'selected_and_future',
    });

    component.patchSaveScope({
      anchorDate: '2026-03-23',
      includePast: true,
    });
    await component.confirmScopedSave();
    expect(component.saveScope()?.error).toContain('overwrite existing exceptions');

    component.patchSaveScope({
      overwriteExceptions: true,
    });
    await component.confirmScopedSave();

    const [, updatePayload] = schedApi.update.mock.lastCall as [
      string,
      {
        changeControl: {
          anchorDate: string;
          includePast: boolean;
          overwriteExceptions: boolean;
          scope: 'all' | 'selected_and_future';
        };
        definition: { description: string };
      },
    ];
    expect(schedApi.update).toHaveBeenLastCalledWith('schedule-1', updatePayload);
    expect(updatePayload.changeControl).toEqual({
      anchorDate: '2026-03-23',
      includePast: true,
      overwriteExceptions: true,
      scope: 'selected_and_future',
    });
    expect(updatePayload.definition.description).toBe('Updated live pattern');
    expect(component.saveScope()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/schedules'], {
      queryParams: { tab: 'active' },
    });
  });

  it('handles load failures and builder no-op removals', async () => {
    const schedApi = {
      create: vi.fn(),
      getSchedule: vi.fn().mockRejectedValue(new Error('Load failed')),
      preview: vi.fn().mockRejectedValue(new Error('Preview failed')),
      update: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ScheduleBuilderComponent],
      providers: [
        provideRouter(routes),
        DirtyStateService,
        { provide: SchedApiService, useValue: schedApi },
        {
          provide: ActivatedRoute,
          useValue: buildRoute({ scheduleId: 'schedule-1' }),
        },
      ],
    });

    const fixture = TestBed.createComponent(ScheduleBuilderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    expect(component.error()).toBe('Preview failed');

    await component.load(null);
    component.removeItem(0);
    component.removeVersion(0);

    expect(component.primaryVersion().items).toHaveLength(1);
    expect(component.draft().versions).toHaveLength(1);
  });

  it('surfaces create save failures in create mode', async () => {
    const schedApi = {
      create: vi.fn().mockRejectedValue(new Error('Save failed')),
      getSchedule: vi.fn(),
      preview: vi.fn().mockRejectedValue(new Error('Preview failed')),
      update: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ScheduleBuilderComponent],
      providers: [
        provideRouter(routes),
        DirtyStateService,
        { provide: SchedApiService, useValue: schedApi },
        {
          provide: ActivatedRoute,
          useValue: buildRoute({}),
        },
      ],
    });

    const fixture = TestBed.createComponent(ScheduleBuilderComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;

    component.patchDraft({
      name: 'Broken save',
      state: 'template',
    });
    await component.save();

    expect(component.error()).toBe('Save failed');
    expect(component.isSaving()).toBe(false);
  });
});
