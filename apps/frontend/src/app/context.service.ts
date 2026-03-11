import { Injectable, computed, signal } from '@angular/core';
import { appContexts, AppContext, AppContextId, AppArea, routeAreaFromUrl } from './route-catalog';

@Injectable({ providedIn: 'root' })
export class ContextService {
  private readonly availableContexts = signal(appContexts);
  private readonly activeContextId = signal<AppContextId>('personal');

  readonly contexts = this.availableContexts.asReadonly();
  readonly activeContext = computed(
    () =>
      this.availableContexts().find((context) => context.id === this.activeContextId()) ??
      this.availableContexts()[0],
  );

  setActiveContext(contextId: AppContextId): void {
    this.activeContextId.set(contextId);
  }

  syncToSessionContext(contextType: 'organization' | 'personal' | 'public' | 'system'): void {
    if (contextType === 'system') {
      this.activeContextId.set('system');
      return;
    }

    if (contextType === 'organization') {
      this.activeContextId.set('organization');
      return;
    }

    this.activeContextId.set('personal');
  }

  isAreaAllowed(area: AppArea): boolean {
    return this.activeContext().allowedAreas.includes(area);
  }

  fallbackRoute(): string {
    return this.activeContext().landingRoute;
  }

  visibleSections(): AppArea[] {
    return this.activeContext().allowedAreas;
  }

  resolveRouteForContext(contextId: AppContextId, currentUrl: string): string {
    const targetContext = this.availableContexts().find((context) => context.id === contextId);
    if (!targetContext) {
      return currentUrl;
    }

    const targetArea = routeAreaFromUrl(currentUrl);
    if (targetContext.allowedAreas.includes(targetArea)) {
      return currentUrl;
    }

    if (contextId === 'organization' && targetArea === 'end-user') {
      return currentUrl;
    }

    return targetContext.landingRoute;
  }

  getContextLabel(context: AppContext = this.activeContext()): string {
    return context.label;
  }
}
