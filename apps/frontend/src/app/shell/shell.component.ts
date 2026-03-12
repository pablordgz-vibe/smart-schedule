import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStateService } from '../auth-state.service';
import { ContextService } from '../context.service';
import { DirtyStateService } from '../dirty-state.service';
import { SetupStateService } from '../setup/setup-state.service';
import {
  endUserNavItems,
  orgAdminNavItems,
  quickCreateRoute,
  searchableRoutes,
  systemAdminNavItems,
} from '../route-catalog';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell" data-testid="app-shell">
      <header class="shell-header">
        <a class="brand" routerLink="/home" data-testid="app-logo">SmartSchedule</a>

        <div class="header-center">
          <label class="ui-field">
            <span class="sr-only">Active context</span>
            <select
              class="ui-select"
              [ngModel]="activeContextId()"
              (ngModelChange)="switchContext($event)"
              data-testid="context-switcher"
              aria-label="Active context"
            >
              <option *ngFor="let context of contexts()" [value]="context.id">
                {{ context.label }}
              </option>
            </select>
          </label>
          <span class="ui-chip" data-testid="context-badge">{{ activeContextLabel() }}</span>
          <label class="ui-search">
            <span class="sr-only">Global search</span>
            <input
              type="search"
              placeholder="Search or jump to a route"
              aria-label="Global search"
              data-testid="global-search"
              [ngModel]="searchQuery()"
              (ngModelChange)="updateSearch($event)"
              [ngModelOptions]="{ standalone: true }"
              (keydown.enter)="openFirstSearchResult($event)"
            />
          </label>
          <section
            class="search-results ui-card"
            *ngIf="searchResults().length > 0"
            data-testid="global-search-results"
          >
            <button
              *ngFor="let result of searchResults(); let index = index"
              class="search-result"
              type="button"
              (click)="openSearchResult(result.path)"
              [attr.data-testid]="'search-result-' + index"
            >
              <span class="search-result-copy">
                <strong>{{ result.label }}</strong>
                <small>{{ result.description }}</small>
              </span>
              <span class="ui-chip search-result-area">{{ areaLabel(result.area) }}</span>
            </button>
          </section>
        </div>

        <div class="header-actions" data-testid="header-actions">
          <button
            class="ui-button ui-button-primary"
            type="button"
            (click)="openQuickCreate()"
            data-testid="quick-create"
          >
            Quick Create
          </button>
          <button
            class="ui-icon-button"
            type="button"
            aria-label="Notifications"
            data-testid="notifications-button"
          >
            Notifications
          </button>
          <button
            *ngIf="showAiEntry()"
            class="ui-icon-button"
            type="button"
            aria-label="AI assistant"
            data-testid="ai-button"
          >
            AI
          </button>
          <button class="ui-icon-button" type="button" aria-label="Help" data-testid="help-button">
            Help
          </button>
          <button
            class="ui-icon-button"
            type="button"
            aria-label="User menu"
            data-testid="user-menu"
          >
            User
          </button>
        </div>
      </header>

      <div class="shell-body">
        <aside class="shell-sidebar" data-testid="sidebar">
          <section class="nav-section" *ngIf="showEndUserNav()">
            <p class="nav-kicker">End-user</p>
            <a
              *ngFor="let item of endUserItems"
              [routerLink]="item.path"
              routerLinkActive="active"
              class="nav-link"
              [attr.data-testid]="item.testId"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          </section>

          <section class="nav-section" *ngIf="showOrgAdminNav()">
            <p class="nav-kicker">Organization admin</p>
            <a
              *ngFor="let item of orgAdminItems"
              [routerLink]="item.path"
              routerLinkActive="active"
              class="nav-link"
              [attr.data-testid]="item.testId"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          </section>

          <section class="nav-section" *ngIf="showSystemAdminNav()">
            <p class="nav-kicker">System admin</p>
            <a
              *ngFor="let item of systemAdminItems"
              [routerLink]="item.path"
              routerLinkActive="active"
              class="nav-link"
              [attr.data-testid]="item.testId"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          </section>

          <section class="ui-card shell-status" data-testid="shell-status">
            <p class="ui-kicker">Shell status</p>
            <p>{{ dirtyStateLabel() }}</p>
            <p class="status-copy">
              Route guards and context-aware fallbacks are active in the Sprint 0 shell scaffold.
            </p>
          </section>
        </aside>

        <main class="shell-main" data-testid="page-outlet">
          <router-outlet></router-outlet>
        </main>
      </div>

      <nav class="mobile-nav" data-testid="mobile-nav">
        <a
          *ngFor="let item of mobileItems()"
          [routerLink]="item.path"
          routerLinkActive="active"
          [attr.data-testid]="'mobile-' + item.testId"
        >
          <span>{{ item.icon }}</span>
          <small>{{ item.label }}</small>
        </a>
      </nav>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        background:
          radial-gradient(circle at top right, rgb(14 165 233 / 0.15), transparent 22rem),
          linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
      }

      .shell-header {
        position: sticky;
        top: 0;
        z-index: 20;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: var(--spacing-4);
        align-items: center;
        padding: var(--spacing-4) var(--spacing-6);
        border-bottom: 1px solid var(--border-default);
        background: rgb(255 255 255 / 0.88);
        backdrop-filter: blur(18px);
      }

      .brand {
        color: var(--text-primary);
        text-decoration: none;
        font-size: var(--font-size-2xl);
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .header-center {
        display: flex;
        align-items: center;
        gap: var(--spacing-3);
        position: relative;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--spacing-2);
      }

      .shell-body {
        display: grid;
        grid-template-columns: 18rem minmax(0, 1fr);
        gap: var(--spacing-6);
        padding: var(--spacing-6);
      }

      .shell-sidebar {
        display: grid;
        gap: var(--spacing-4);
        align-content: start;
      }

      .nav-section {
        display: grid;
        gap: var(--spacing-2);
      }

      .nav-kicker {
        margin: 0 0 var(--spacing-1);
        color: var(--text-muted);
        font-size: var(--font-size-xs);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .nav-link {
        display: flex;
        align-items: center;
        gap: var(--spacing-3);
        border-radius: var(--radius-lg);
        padding: var(--spacing-3) var(--spacing-4);
        color: var(--text-secondary);
        text-decoration: none;
      }

      .nav-link:hover,
      .nav-link.active {
        background: rgb(14 165 233 / 0.09);
        color: var(--text-primary);
      }

      .nav-icon {
        font-size: var(--font-size-sm);
        font-weight: 700;
        min-width: 5rem;
      }

      .shell-main {
        min-width: 0;
      }

      .search-results {
        position: absolute;
        top: calc(100% + var(--spacing-2));
        left: 0;
        right: 0;
        z-index: 10;
        display: grid;
        gap: var(--spacing-2);
        padding: var(--spacing-3);
      }

      .search-result {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: var(--spacing-3);
        padding: var(--spacing-3);
        border: 1px solid transparent;
        border-radius: var(--radius-lg);
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .search-result:hover {
        border-color: rgb(14 165 233 / 0.2);
        background: rgb(14 165 233 / 0.06);
      }

      .search-result-copy {
        display: grid;
        gap: 0.25rem;
      }

      .search-result-copy small {
        color: var(--text-secondary);
      }

      .search-result-area {
        flex-shrink: 0;
      }

      .shell-status {
        margin-top: var(--spacing-2);
      }

      .status-copy {
        color: var(--text-secondary);
        margin-bottom: 0;
      }

      .mobile-nav {
        display: none;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }

      @media (max-width: 1100px) {
        .shell-header {
          grid-template-columns: 1fr;
        }

        .header-center,
        .header-actions {
          flex-wrap: wrap;
        }

        .shell-body {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 768px) {
        .shell-header {
          padding: var(--spacing-4);
        }

        .shell-sidebar {
          display: none;
        }

        .shell-body {
          padding: var(--spacing-4);
        }

        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          border-top: 1px solid var(--border-default);
          background: rgb(255 255 255 / 0.95);
          backdrop-filter: blur(18px);
        }

        .mobile-nav a {
          display: grid;
          gap: 0.25rem;
          place-items: center;
          padding: var(--spacing-3) 0;
          color: var(--text-secondary);
          text-decoration: none;
        }

        .mobile-nav a.active {
          color: var(--color-primary-700);
          background: rgb(14 165 233 / 0.08);
        }

        .shell-main {
          padding-bottom: 6rem;
        }
      }
    `,
  ],
})
export class ShellComponent {
  private readonly router = inject(Router);
  private readonly authState = inject(AuthStateService);
  private readonly contextService = inject(ContextService);
  private readonly dirtyState = inject(DirtyStateService);
  private readonly setupState = inject(SetupStateService);

  readonly searchQuery = signal('');

  readonly contexts = this.contextService.contexts;
  readonly activeContextId = computed(() => this.contextService.activeContext().id);
  readonly activeContextLabel = computed(() => this.contextService.getContextLabel());
  readonly dirtyStateLabel = computed(() =>
    this.dirtyState.isDirty()
      ? 'Unsaved changes are active on a guarded route.'
      : 'No unsaved changes.',
  );

  readonly endUserItems = endUserNavItems;
  readonly orgAdminItems = orgAdminNavItems;
  readonly systemAdminItems = systemAdminNavItems;

  readonly showEndUserNav = computed(() =>
    this.contextService.visibleSections().includes('end-user'),
  );
  readonly showOrgAdminNav = computed(() =>
    this.contextService.visibleSections().includes('org-admin'),
  );
  readonly showSystemAdminNav = computed(() =>
    this.contextService.visibleSections().includes('system-admin'),
  );
  readonly showAiEntry = computed(
    () =>
      this.setupState
        .snapshot()
        ?.configuredIntegrations.some(
          (integration) => integration.enabled && integration.code === 'openai',
        ) ?? false,
  );
  readonly searchResults = computed(() => {
    const normalizedQuery = this.searchQuery().trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return searchableRoutes
      .filter((route) => {
        if (!this.contextService.visibleSections().includes(route.area)) {
          return false;
        }

        const haystack = [route.label, route.description, ...route.keywords]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .slice(0, 6);
  });
  readonly mobileItems = computed(() => {
    if (this.showSystemAdminNav()) {
      return this.systemAdminItems.slice(0, 4);
    }

    if (this.showOrgAdminNav()) {
      return this.endUserItems.filter((item) => item.mobile).slice(0, 4);
    }

    return this.endUserItems.filter((item) => item.mobile).slice(0, 4);
  });

  async switchContext(nextContextId: string): Promise<void> {
    const selectedContext = this.contexts().find((context) => context.id === nextContextId);
    if (!selectedContext) {
      return;
    }

    if (
      this.dirtyState.isDirty() &&
      !window.confirm('You have unsaved changes. Leave this screen?')
    ) {
      return;
    }

    const previousContextId = this.contextService.activeContext().id;
    const nextRoute = this.contextService.resolveRouteForContext(
      selectedContext.id,
      this.router.url,
    );

    if (this.authState.isAuthenticated()) {
      try {
        const session = await this.authState.switchContext({
          contextType:
            selectedContext.contextType === 'public' ? 'personal' : selectedContext.contextType,
          organizationId: selectedContext.organizationId ?? undefined,
        });
        this.contextService.applySessionSnapshot(session);
      } catch {
        this.contextService.setActiveContext(previousContextId);
        return;
      }
    } else {
      this.contextService.setActiveContext(selectedContext.id);
    }

    this.searchQuery.set('');
    void this.router.navigateByUrl(nextRoute);
  }

  openQuickCreate(): void {
    const nextRoute =
      this.contextService.activeContext().id === 'system' ? '/admin/setup' : quickCreateRoute;
    this.searchQuery.set('');
    void this.router.navigateByUrl(nextRoute);
  }

  updateSearch(value: string): void {
    this.searchQuery.set(value);
  }

  openFirstSearchResult(event: Event): void {
    const firstResult = this.searchResults()[0];
    if (!firstResult) {
      return;
    }

    event.preventDefault();
    this.openSearchResult(firstResult.path);
  }

  openSearchResult(path: string): void {
    this.searchQuery.set('');
    void this.router.navigateByUrl(path);
  }

  areaLabel(area: 'end-user' | 'org-admin' | 'system-admin'): string {
    if (area === 'org-admin') {
      return 'Organization admin';
    }

    if (area === 'system-admin') {
      return 'System admin';
    }

    return 'End-user';
  }
}
