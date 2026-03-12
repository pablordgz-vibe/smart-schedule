import { Injectable, computed, signal } from '@angular/core';
import { AuthSessionSnapshot } from './auth.types';
import { AppArea, AppContext, routeAreaFromUrl } from './route-catalog';

const personalFallbackContext: AppContext = {
  id: 'personal',
  contextType: 'personal',
  label: 'Personal',
  description: 'Personal schedules and tasks',
  landingRoute: '/home',
  allowedAreas: ['end-user'],
  organizationId: null,
};

@Injectable({ providedIn: 'root' })
export class ContextService {
  private readonly availableContexts = signal<AppContext[]>([personalFallbackContext]);
  private readonly activeContextId = signal<string>(personalFallbackContext.id);

  readonly contexts = this.availableContexts.asReadonly();
  readonly activeContext = computed(
    () =>
      this.availableContexts().find((context) => context.id === this.activeContextId()) ??
      this.availableContexts()[0],
  );

  applySessionSnapshot(snapshot: AuthSessionSnapshot | null): void {
    if (!snapshot?.authenticated || !snapshot.user) {
      this.availableContexts.set([personalFallbackContext]);
      this.activeContextId.set(personalFallbackContext.id);
      return;
    }

    const resolvedContexts: AppContext[] = snapshot.availableContexts
      .filter((entry) => entry.context.type !== 'public')
      .map((entry) => {
        const contextType = entry.context.type;
        const isOrgAdmin = contextType === 'organization' && entry.membershipRole === 'admin';
        const allowedAreas: AppArea[] =
          contextType === 'system'
            ? ['system-admin']
            : isOrgAdmin
              ? ['end-user', 'org-admin']
              : ['end-user'];

        const landingRoute =
          contextType === 'system' ? '/admin/setup' : isOrgAdmin ? '/org/overview' : '/home';

        return {
          id: entry.key,
          contextType,
          label: entry.label,
          description:
            contextType === 'organization'
              ? 'Organization workspace and administration'
              : contextType === 'system'
                ? 'Deployment and platform governance'
                : 'Personal schedules and tasks',
          landingRoute,
          allowedAreas,
          organizationId: contextType === 'organization' ? entry.context.id : null,
        } satisfies AppContext;
      });

    const withFallback = resolvedContexts.length > 0 ? resolvedContexts : [personalFallbackContext];
    const activeKey = this.findContextKeyForSession(snapshot, withFallback);
    this.availableContexts.set(withFallback);
    this.activeContextId.set(activeKey);
  }

  setActiveContext(contextId: string): void {
    this.activeContextId.set(contextId);
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

  resolveRouteForContext(contextId: string, currentUrl: string): string {
    const targetContext = this.availableContexts().find((context) => context.id === contextId);
    if (!targetContext) {
      return currentUrl;
    }

    const targetArea = routeAreaFromUrl(currentUrl);
    if (targetContext.allowedAreas.includes(targetArea)) {
      return currentUrl;
    }

    if (targetContext.contextType === 'organization' && targetArea === 'end-user') {
      return currentUrl;
    }

    return targetContext.landingRoute;
  }

  getContextLabel(context: AppContext = this.activeContext()): string {
    return context.label;
  }

  private findContextKeyForSession(snapshot: AuthSessionSnapshot, contexts: AppContext[]) {
    const active = snapshot.activeContext;

    if (active.type === 'system') {
      return contexts.find((context) => context.contextType === 'system')?.id ?? contexts[0].id;
    }

    if (active.type === 'organization' && active.id) {
      return (
        contexts.find(
          (context) =>
            context.contextType === 'organization' && context.organizationId === active.id,
        )?.id ?? contexts[0].id
      );
    }

    return contexts.find((context) => context.contextType === 'personal')?.id ?? contexts[0].id;
  }
}
