import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContextService } from './context.service';
import { DirtyStateService } from './dirty-state.service';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="grid gap-6" [attr.data-testid]="testId()">
      <div class="card border border-base-300 bg-base-100 p-6 shadow-sm grid gap-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="max-w-2xl">
            <p class="ui-kicker">{{ sectionLabel() }}</p>
            <h1 class="mt-3 text-3xl font-semibold tracking-tight">{{ title() }}</h1>
            <p class="mt-2 text-sm leading-6 text-base-content/65">{{ description() }}</p>
          </div>
          <div class="badge badge-outline h-10 px-4 text-sm" data-testid="page-context-chip">
            {{ contextLabel() }}
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2 class="text-lg font-semibold">Active Context</h2>
            <p class="mt-2 text-sm leading-6 text-base-content/60">
              Mutations on this route target {{ contextLabel().toLowerCase() }}.
            </p>
          </div>
          <div class="rounded-box border border-base-300 bg-base-100 p-4">
            <h2 class="text-lg font-semibold">Sprint 0 Status</h2>
            <p class="mt-2 text-sm leading-6 text-base-content/60">
              Skeleton route wired for navigation, guards, localization, and PWA-safe shell
              behavior.
            </p>
          </div>
        </div>

        <div class="grid gap-4 lg:grid-cols-2">
          <article class="alert alert-warning">
            <h2>Warning</h2>
            <p>Advisory issues stay visually distinct from blocked actions.</p>
          </article>
          <article class="alert border border-base-300 bg-base-200">
            <h2>Requires approval</h2>
            <p>Approval-gated actions remain separate from hard permission denials.</p>
          </article>
          <article class="alert alert-error">
            <h2>Not permitted</h2>
            <p>Authorization failures are rendered differently from advisories and approvals.</p>
          </article>
          <article class="alert alert-success">
            <h2>Entitlement limited</h2>
            <p>Edition or plan limitations get their own state treatment in the shared shell.</p>
          </article>
        </div>

        <div class="flex flex-wrap items-center gap-3" *ngIf="mutationSurface()">
          <button
            class="btn btn-neutral"
            type="button"
            (click)="markDirty()"
            data-testid="mark-dirty"
          >
            Simulate unsaved changes
          </button>
          <button
            class="btn btn-outline"
            type="button"
            (click)="markClean()"
            data-testid="mark-clean"
          >
            Clear unsaved changes
          </button>
          <span class="badge badge-outline" data-testid="dirty-indicator">
            {{ dirtyLabel() }}
          </span>
        </div>

        <div>
          <a *ngIf="showBuilderLink()" class="btn btn-outline" routerLink="/schedules/builder">
            Open Schedule Builder
          </a>
        </div>
      </div>
    </section>
  `,
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly contextService = inject(ContextService);
  private readonly dirtyState = inject(DirtyStateService);

  readonly title = computed(
    () => (this.route.snapshot.data['title'] as string) ?? 'Smart Schedule',
  );
  readonly description = computed(
    () => (this.route.snapshot.data['description'] as string) ?? 'Sprint 0 route placeholder.',
  );
  readonly sectionLabel = computed(
    () => (this.route.snapshot.data['sectionLabel'] as string) ?? 'Workspace',
  );
  readonly testId = computed(
    () => (this.route.snapshot.data['testId'] as string) ?? 'page-placeholder',
  );
  readonly mutationSurface = computed(() => Boolean(this.route.snapshot.data['mutationSurface']));
  readonly showBuilderLink = computed(() => Boolean(this.route.snapshot.data['showBuilderLink']));
  readonly contextLabel = computed(() => this.contextService.getContextLabel());
  readonly dirtyLabel = computed(() =>
    this.dirtyState.isDirty() ? 'Unsaved changes active' : 'Clean state',
  );

  markDirty(): void {
    this.dirtyState.markDirty();
  }

  markClean(): void {
    this.dirtyState.markClean();
  }
}
