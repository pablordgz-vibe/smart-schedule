import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DirtyStateService {
  private readonly dirty = signal(false);
  private skipPromptOnce = false;

  readonly isDirty = this.dirty.asReadonly();

  markDirty(): void {
    this.dirty.set(true);
  }

  markClean(): void {
    this.dirty.set(false);
  }

  approveNextNavigation(): void {
    this.skipPromptOnce = true;
  }

  consumeApprovedNavigation(): boolean {
    if (!this.skipPromptOnce) {
      return false;
    }

    this.skipPromptOnce = false;
    this.markClean();
    return true;
  }
}
