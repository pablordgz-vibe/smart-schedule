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
    <section class="ui-page" [attr.data-testid]="testId()">
      <div class="ui-card page-hero">
        <p class="ui-kicker">{{ sectionLabel() }}</p>
        <div class="hero-topline">
          <div>
            <h1>{{ title() }}</h1>
            <p class="page-copy">{{ description() }}</p>
          </div>
          <div class="ui-chip" data-testid="page-context-chip">{{ contextLabel() }}</div>
        </div>

        <div class="ui-meta-grid">
          <div class="ui-panel">
            <h2>Active Context</h2>
            <p>Mutations on this route target {{ contextLabel().toLowerCase() }}.</p>
          </div>
          <div class="ui-panel">
            <h2>Sprint 0 Status</h2>
            <p>
              Skeleton route wired for navigation, guards, localization, and PWA-safe shell
              behavior.
            </p>
          </div>
        </div>

        <div class="ui-toolbar" *ngIf="mutationSurface()">
          <button
            class="ui-button ui-button-primary"
            type="button"
            (click)="markDirty()"
            data-testid="mark-dirty"
          >
            Simulate unsaved changes
          </button>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            (click)="markClean()"
            data-testid="mark-clean"
          >
            Clear unsaved changes
          </button>
          <span class="ui-chip" data-testid="dirty-indicator">
            {{ dirtyLabel() }}
          </span>
        </div>

        <a
          *ngIf="showBuilderLink()"
          class="ui-button ui-button-secondary"
          routerLink="/schedules/builder"
        >
          Open Schedule Builder
        </a>
      </div>
    </section>
  `,
  styles: [
    `
      .page-hero {
        display: grid;
        gap: var(--spacing-6);
      }

      .hero-topline {
        display: flex;
        justify-content: space-between;
        gap: var(--spacing-4);
        align-items: flex-start;
      }

      .page-copy {
        max-width: 60ch;
        margin-bottom: 0;
        color: var(--text-secondary);
      }

      @media (max-width: 768px) {
        .hero-topline {
          flex-direction: column;
        }
      }
    `,
  ],
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
