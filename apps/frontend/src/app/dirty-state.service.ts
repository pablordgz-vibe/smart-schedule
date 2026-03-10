import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DirtyStateService {
  private readonly dirty = signal(false);

  readonly isDirty = this.dirty.asReadonly();

  markDirty(): void {
    this.dirty.set(true);
  }

  markClean(): void {
    this.dirty.set(false);
  }
}
