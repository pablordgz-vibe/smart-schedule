import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStateService } from '../auth-state.service';
import { ContextService } from '../context.service';
import { DirtyStateService } from '../dirty-state.service';
import {
  endUserNavItems,
  orgAdminNavItems,
  searchableRoutes,
  systemAdminNavItems,
} from '../route-catalog';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="drawer">
      <input
        id="mobile-drawer"
        type="checkbox"
        class="drawer-toggle"
        [ngModel]="isDrawerOpen()"
        (ngModelChange)="isDrawerOpen.set($event)"
      />
      <div
        class="drawer-content flex flex-col shell min-h-screen bg-base-200"
        data-testid="app-shell"
      >
        <header
          class="border-b border-base-300 bg-base-100/90 backdrop-blur"
          data-testid="shell-header"
        >
          <div class="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div class="flex min-w-0 items-center gap-3">
                <label
                  for="mobile-drawer"
                  class="btn btn-square btn-ghost lg:hidden drawer-button"
                  aria-label="Open menu"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    class="inline-block h-6 w-6 stroke-current"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 6h16M4 12h16M4 18h16"
                    ></path>
                  </svg>
                </label>
                <a
                  class="text-lg font-semibold tracking-tight"
                  routerLink="/home"
                  data-testid="app-logo"
                >
                  SmartSchedule
                </a>
                <span class="badge badge-ghost hidden sm:inline-flex">Workspace</span>
              </div>

              <div
                class="flex flex-1 flex-col gap-3 xl:max-w-3xl xl:flex-row xl:items-center xl:justify-end"
              >
                <label class="ui-field min-w-0 xl:max-w-56">
                  <span class="sr-only">Active context</span>
                  <select
                    #contextSelect
                    class="select select-bordered w-full"
                    [value]="contextSwitcherValue()"
                    (change)="switchContext(contextSelect.value)"
                    data-testid="context-switcher"
                    aria-label="Active context"
                  >
                    <option
                      *ngFor="let context of contexts()"
                      [value]="context.id"
                      [selected]="context.id === contextSwitcherValue()"
                    >
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
                          <small class="truncate text-base-content/60">{{
                            result.description
                          }}</small>
                        </span>
                        <span class="badge badge-outline">{{ areaLabel(result.area) }}</span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              <div
                class="flex flex-wrap items-center gap-2 xl:justify-end"
                data-testid="header-actions"
              >
                <div class="relative">
                  <button
                    class="btn btn-neutral btn-sm md:btn-md"
                    type="button"
                    (click)="toggleQuickCreateMenu()"
                    data-testid="quick-create"
                  >
                    {{ activeContextId() === 'system' ? 'Open setup' : 'Quick create' }}
                  </button>
                  <section
                    *ngIf="quickCreateMenuOpen() && activeContextId() !== 'system'"
                    class="header-popover card border border-base-300 bg-base-100 shadow-md"
                    data-testid="quick-create-menu"
                  >
                    <div class="card-body gap-2 p-3">
                      <button
                        class="btn btn-ghost justify-start"
                        type="button"
                        (click)="openCompose('event')"
                      >
                        New event in {{ activeContextLabel() }}
                      </button>
                      <button
                        class="btn btn-ghost justify-start"
                        type="button"
                        (click)="openCompose('task')"
                      >
                        New task in {{ activeContextLabel() }}
                      </button>
                    </div>
                  </section>
                </div>

                <div class="relative">
                  <button
                    class="btn btn-ghost btn-sm"
                    type="button"
                    (click)="toggleHelpPanel()"
                    data-testid="help-button"
                  >
                    Help
                  </button>
                  <section
                    *ngIf="helpPanelOpen()"
                    class="header-popover card border border-base-300 bg-base-100 shadow-md"
                    data-testid="help-panel"
                  >
                    <div class="card-body gap-3 p-4 text-sm">
                      <div>
                        <strong class="block">Current context</strong>
                        <span class="text-base-content/65">{{ activeContextLabel() }}</span>
                      </div>
                      <p class="text-base-content/70">
                        Use the context switcher before creating or editing data. Personal and
                        organization records remain separate.
                      </p>
                      <p class="text-base-content/70">
                        Quick create opens event and task entry directly in the active context.
                      </p>
                    </div>
                  </section>
                </div>

                <div class="relative">
                  <button
                    class="btn btn-ghost btn-sm"
                    type="button"
                    (click)="toggleUserMenu()"
                    data-testid="user-menu"
                  >
                    Account
                  </button>
                  <section
                    *ngIf="userMenuOpen()"
                    class="header-popover card border border-base-300 bg-base-100 shadow-md"
                    data-testid="user-menu-panel"
                  >
                    <div class="card-body gap-2 p-3">
                      <button
                        class="btn btn-ghost justify-start"
                        type="button"
                        (click)="openSettings()"
                      >
                        Settings
                      </button>
                      <button class="btn btn-ghost justify-start" type="button" (click)="logout()">
                        Sign out
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div
          class="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:px-6"
        >
          <aside class="hidden lg:block pr-0" data-testid="sidebar">
            <div class="sticky top-24">
              <ng-container
                *ngTemplateOutlet="navContent; context: { testIdPrefix: '' }"
              ></ng-container>
            </div>
          </aside>

          <main class="min-w-0 pb-24 lg:pb-0" data-testid="page-outlet">
            <router-outlet></router-outlet>
          </main>
        </div>

        <nav
          class="btm-nav z-10 border-t border-base-300 bg-base-100 lg:hidden"
          data-testid="mobile-nav"
        >
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

      <div class="drawer-side lg:hidden z-50">
        <label for="mobile-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
        <div class="w-80 min-h-full bg-base-200 p-4">
          <div class="flex items-center gap-3 pb-6 pt-2">
            <a
              class="text-lg font-semibold tracking-tight"
              routerLink="/home"
              (click)="isDrawerOpen.set(false)"
            >
              SmartSchedule
            </a>
          </div>
          <ng-container
            *ngTemplateOutlet="navContent; context: { testIdPrefix: 'drawer-' }"
          ></ng-container>
        </div>
      </div>
    </div>

    <ng-template #navContent let-testIdPrefix="testIdPrefix">
      <div class="space-y-4">
        <section
          class="rounded-box border border-base-300 bg-base-100 p-2.5"
          *ngIf="showEndUserNav()"
        >
          <p
            class="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/45"
          >
            End-user
          </p>
          <ul class="menu gap-1">
            <li *ngFor="let item of endUserItems">
              <a
                [routerLink]="item.path"
                routerLinkActive="nav-active"
                class="rounded-box text-base-content/70 hover:bg-base-200 hover:text-base-content"
                [attr.data-testid]="testIdPrefix + item.testId"
                (click)="isDrawerOpen.set(false)"
              >
                <span>{{ item.label }}</span>
              </a>
            </li>
          </ul>
        </section>

        <section
          class="rounded-box border border-base-300 bg-base-100 p-2.5"
          *ngIf="showOrgAdminNav()"
        >
          <p
            class="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/45"
          >
            Organization admin
          </p>
          <ul class="menu gap-1">
            <li *ngFor="let item of orgAdminItems">
              <a
                [routerLink]="item.path"
                routerLinkActive="nav-active"
                class="rounded-box text-base-content/70 hover:bg-base-200 hover:text-base-content"
                [attr.data-testid]="testIdPrefix + item.testId"
                (click)="isDrawerOpen.set(false)"
              >
                <span>{{ item.label }}</span>
              </a>
            </li>
          </ul>
        </section>

        <section
          class="rounded-box border border-base-300 bg-base-100 p-2.5"
          *ngIf="showSystemAdminNav()"
        >
          <p
            class="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/45"
          >
            System admin
          </p>
          <ul class="menu gap-1">
            <li *ngFor="let item of systemAdminItems">
              <a
                [routerLink]="item.path"
                routerLinkActive="nav-active"
                class="rounded-box text-base-content/70 hover:bg-base-200 hover:text-base-content"
                [attr.data-testid]="testIdPrefix + item.testId"
                (click)="isDrawerOpen.set(false)"
              >
                <span>{{ item.label }}</span>
              </a>
            </li>
          </ul>
        </section>

        <section
          class="rounded-box border border-base-300 bg-base-100 p-4"
          data-testid="shell-status"
        >
          <p class="ui-kicker">Shell status</p>
          <p class="mt-3 text-sm font-medium">{{ dirtyStateLabel() }}</p>
          <p class="mt-2 text-sm text-base-content/60">
            Route guards, context-aware fallbacks, and protected context switching are active.
          </p>
        </section>
      </div>
    </ng-template>
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

      .header-popover {
        position: absolute;
        right: 0;
        top: calc(100% + 0.5rem);
        z-index: 35;
        min-width: 18rem;
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
  private readonly contextSelect = viewChild<ElementRef<HTMLSelectElement>>('contextSelect');

  readonly searchQuery = signal('');
  readonly isDrawerOpen = signal(false);
  readonly helpPanelOpen = signal(false);
  readonly quickCreateMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly contextSwitcherValue = signal(this.contextService.activeContext().id);

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

  constructor() {
    effect(() => {
      this.syncContextSwitcher(this.activeContextId());
    });
  }

  async switchContext(nextContextId: string): Promise<void> {
    this.syncContextSwitcher(nextContextId);

    const selectedContext = this.contexts().find((context) => context.id === nextContextId);
    if (!selectedContext) {
      this.syncContextSwitcher(this.activeContextId());
      return;
    }

    const previousContextId = this.contextService.activeContext().id;

    if (
      this.dirtyState.isDirty() &&
      !window.confirm(this.contextSwitchWarning(selectedContext.label))
    ) {
      this.syncContextSwitcher(previousContextId);
      return;
    }
    if (this.dirtyState.isDirty()) {
      this.dirtyState.approveNextNavigation();
    }

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
        this.syncContextSwitcher(previousContextId);
        this.contextService.setActiveContext(previousContextId);
        return;
      }
    } else {
      this.contextService.setActiveContext(selectedContext.id);
    }

    this.closeHeaderPanels();
    this.searchQuery.set('');
    void this.router.navigateByUrl(nextRoute);
  }

  toggleQuickCreateMenu(): void {
    if (this.contextService.activeContext().id === 'system') {
      this.closeHeaderPanels();
      void this.router.navigateByUrl('/admin/setup');
      return;
    }

    const next = !this.quickCreateMenuOpen();
    this.closeHeaderPanels();
    this.quickCreateMenuOpen.set(next);
  }

  toggleHelpPanel(): void {
    const next = !this.helpPanelOpen();
    this.closeHeaderPanels();
    this.helpPanelOpen.set(next);
  }

  toggleUserMenu(): void {
    const next = !this.userMenuOpen();
    this.closeHeaderPanels();
    this.userMenuOpen.set(next);
  }

  openCompose(kind: 'event' | 'task'): void {
    this.closeHeaderPanels();
    this.searchQuery.set('');
    void this.router.navigateByUrl(`/calendar?compose=${kind}`);
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
    this.closeHeaderPanels();
    this.searchQuery.set('');
    void this.router.navigateByUrl(path);
  }

  openSettings(): void {
    this.closeHeaderPanels();
    void this.router.navigateByUrl('/settings');
  }

  async logout(): Promise<void> {
    this.closeHeaderPanels();
    await this.authState.logout();
    await this.router.navigateByUrl('/auth/sign-in');
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

  private closeHeaderPanels() {
    this.helpPanelOpen.set(false);
    this.quickCreateMenuOpen.set(false);
    this.userMenuOpen.set(false);
  }

  private contextSwitchWarning(targetLabel: string) {
    return `You have unsaved changes in ${this.activeContextLabel()}. Leave this screen and switch to ${targetLabel}?`;
  }

  private syncContextSwitcher(contextId: string) {
    this.contextSwitcherValue.set(contextId);
    const applyValue = () => {
      const nativeSelect = this.contextSelect()?.nativeElement;
      if (nativeSelect) {
        nativeSelect.value = contextId;
      }
    };

    applyValue();
    queueMicrotask(applyValue);
  }
}
