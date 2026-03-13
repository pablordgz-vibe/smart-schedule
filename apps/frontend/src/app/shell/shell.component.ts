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
    <div class="shell min-h-screen bg-base-200" data-testid="app-shell">
      <header class="border-b border-base-300 bg-base-100/90 backdrop-blur" data-testid="shell-header">
        <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex min-w-0 items-center gap-3">
              <a class="text-lg font-semibold tracking-tight" routerLink="/home" data-testid="app-logo">
                SmartSchedule
              </a>
              <span class="badge badge-ghost hidden sm:inline-flex">Workspace</span>
            </div>

            <div class="flex flex-1 flex-col gap-3 xl:max-w-3xl xl:flex-row xl:items-center xl:justify-end">
              <label class="ui-field min-w-0 xl:max-w-56">
                <span class="sr-only">Active context</span>
                <select
                  class="select select-bordered w-full"
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

              <div class="search-wrap flex-1">
                <label class="ui-search w-full">
                  <span class="sr-only">Global search</span>
                  <input
                    type="search"
                    class="input input-bordered w-full"
                    placeholder="Search pages"
                    aria-label="Global search"
                    data-testid="global-search"
                    [ngModel]="searchQuery()"
                    (ngModelChange)="updateSearch($event)"
                    [ngModelOptions]="{ standalone: true }"
                    (keydown.enter)="openFirstSearchResult($event)"
                  />
                </label>

                <section
                  class="search-results card border border-base-300 bg-base-100 shadow-sm"
                  *ngIf="searchResults().length > 0"
                  data-testid="global-search-results"
                >
                  <div class="card-body gap-2 p-2">
                    <button
                      *ngFor="let result of searchResults(); let index = index"
                      class="btn btn-ghost justify-between rounded-box border border-transparent px-3 text-left normal-case hover:border-base-300 hover:bg-base-200"
                      type="button"
                      (click)="openSearchResult(result.path)"
                      [attr.data-testid]="'search-result-' + index"
                    >
                      <span class="flex min-w-0 flex-col items-start">
                        <strong class="truncate">{{ result.label }}</strong>
                        <small class="truncate text-base-content/60">{{ result.description }}</small>
                      </span>
                      <span class="badge badge-outline">{{ areaLabel(result.area) }}</span>
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2" data-testid="header-actions">
              <button
                class="btn btn-neutral btn-sm md:btn-md"
                type="button"
                (click)="openQuickCreate()"
                data-testid="quick-create"
              >
                Open Calendar
              </button>
              <button class="btn btn-ghost btn-sm" type="button" data-testid="notifications-button">
                Notifications
              </button>
              <button
                *ngIf="showAiEntry()"
                class="btn btn-ghost btn-sm"
                type="button"
                data-testid="ai-button"
              >
                AI
              </button>
              <button class="btn btn-ghost btn-sm" type="button" data-testid="help-button">Help</button>
              <button class="btn btn-ghost btn-sm" type="button" data-testid="user-menu">User</button>
            </div>
          </div>
        </div>
      </header>

      <div class="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:px-6">
        <aside class="hidden lg:block pr-0" data-testid="sidebar">
          <div class="sticky top-24 space-y-4">
            <section class="rounded-box border border-base-300 bg-base-100 p-2.5" *ngIf="showEndUserNav()">
              <p class="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
                End-user
              </p>
              <ul class="menu gap-1">
                <li *ngFor="let item of endUserItems">
                  <a
                    [routerLink]="item.path"
                    routerLinkActive="nav-active"
                    class="rounded-box text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    [attr.data-testid]="item.testId"
                  >
                    <span>{{ item.label }}</span>
                  </a>
                </li>
              </ul>
            </section>

            <section class="rounded-box border border-base-300 bg-base-100 p-2.5" *ngIf="showOrgAdminNav()">
              <p class="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
                Organization admin
              </p>
              <ul class="menu gap-1">
                <li *ngFor="let item of orgAdminItems">
                  <a
                    [routerLink]="item.path"
                    routerLinkActive="nav-active"
                    class="rounded-box text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    [attr.data-testid]="item.testId"
                  >
                    <span>{{ item.label }}</span>
                  </a>
                </li>
              </ul>
            </section>

            <section class="rounded-box border border-base-300 bg-base-100 p-2.5" *ngIf="showSystemAdminNav()">
              <p class="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
                System admin
              </p>
              <ul class="menu gap-1">
                <li *ngFor="let item of systemAdminItems">
                  <a
                    [routerLink]="item.path"
                    routerLinkActive="nav-active"
                    class="rounded-box text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    [attr.data-testid]="item.testId"
                  >
                    <span>{{ item.label }}</span>
                  </a>
                </li>
              </ul>
            </section>

            <section class="rounded-box border border-base-300 bg-base-100 p-4" data-testid="shell-status">
              <p class="ui-kicker">Shell status</p>
              <p class="mt-3 text-sm font-medium">{{ dirtyStateLabel() }}</p>
              <p class="mt-2 text-sm text-base-content/60">
                Route guards, context-aware fallbacks, and protected context switching are active.
              </p>
            </section>
          </div>
        </aside>

        <main class="min-w-0 pb-24 lg:pb-0" data-testid="page-outlet">
          <router-outlet></router-outlet>
        </main>
      </div>

      <nav class="btm-nav z-10 border-t border-base-300 bg-base-100 lg:hidden" data-testid="mobile-nav">
        <a
          *ngFor="let item of mobileItems()"
          [routerLink]="item.path"
          routerLinkActive="active"
          [attr.data-testid]="'mobile-' + item.testId"
        >
          <span class="text-xs font-medium">{{ item.label }}</span>
        </a>
            </nav>
    </div>
  `,
  styles: [
    `
      .search-wrap {
        position: relative;
      }

      .search-results {
        position: absolute;
        top: calc(100% + 0.5rem);
        left: 0;
        right: 0;
        z-index: 30;
      }
      .nav-active {
        background: var(--color-base-200);
        color: var(--color-base-content);
      }

      .btm-nav .active {
        background: var(--color-base-200);
        color: var(--color-base-content);
      }


      @media (max-width: 1279px) {
        .search-wrap {
          width: 100%;
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
    if (this.dirtyState.isDirty()) {
      this.dirtyState.approveNextNavigation();
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
