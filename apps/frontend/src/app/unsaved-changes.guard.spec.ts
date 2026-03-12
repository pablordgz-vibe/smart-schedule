import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DirtyStateService } from './dirty-state.service';
import { unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  it('allows navigation when the route is clean', () => {
    TestBed.configureTestingModule({});

    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard({} as never, {} as never, {} as never),
    );
    expect(result).toBe(true);
  });

  it('prompts before leaving a dirty route', () => {
    TestBed.configureTestingModule({});
    const dirtyState = TestBed.inject(DirtyStateService);
    dirtyState.markDirty();

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard({} as never, {} as never, {} as never),
    );

    expect(confirmSpy).toHaveBeenCalled();
    expect(result).toBe(false);

    confirmSpy.mockRestore();
  });

  it('allows one approved dirty navigation without prompting again', () => {
    TestBed.configureTestingModule({});
    const dirtyState = TestBed.inject(DirtyStateService);
    dirtyState.markDirty();
    dirtyState.approveNextNavigation();

    const confirmSpy = vi.spyOn(window, 'confirm');
    const result = TestBed.runInInjectionContext(() =>
      unsavedChangesGuard({} as never, {} as never, {} as never),
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result).toBe(true);
    expect(dirtyState.isDirty()).toBe(false);

    confirmSpy.mockRestore();
  });
});
