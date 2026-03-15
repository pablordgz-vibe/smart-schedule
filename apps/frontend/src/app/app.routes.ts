import { Routes } from '@angular/router';
import { anonymousOnlyGuard } from './anonymous-only.guard';
import { authenticatedGuard } from './authenticated.guard';
import { routeAreaGuard } from './route-area.guard';
import { ShellComponent } from './shell/shell.component';
import { setupCompletionChildGuard, setupCompletionGuard } from './setup/setup-completion.guard';
import { setupRouteGuard } from './setup/setup-route.guard';
import { unsavedChangesGuard } from './unsaved-changes.guard';

const loadPlaceholderPage = () =>
  import('./placeholder-page.component').then((module) => module.PlaceholderPageComponent);

export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [anonymousOnlyGuard],
    children: [
      {
        path: 'sign-in',
        loadComponent: () =>
          import('./auth-page.component').then((module) => module.AuthPageComponent),
        data: { mode: 'sign-in' },
      },
      {
        path: 'sign-up',
        loadComponent: () =>
          import('./auth-page.component').then((module) => module.AuthPageComponent),
        data: { mode: 'sign-up' },
      },
      {
        path: 'verify-email',
        loadComponent: () =>
          import('./auth-page.component').then((module) => module.AuthPageComponent),
        data: { mode: 'verify-email' },
      },
      {
        path: 'reset-password',
        loadComponent: () =>
          import('./auth-page.component').then((module) => module.AuthPageComponent),
        data: { mode: 'reset-password' },
      },
      {
        path: 'recover-account',
        loadComponent: () =>
          import('./auth-page.component').then((module) => module.AuthPageComponent),
        data: { mode: 'recover-account' },
      },
      {
        path: 'deactivated',
        loadComponent: () =>
          import('./auth-page.component').then((module) => module.AuthPageComponent),
        data: { mode: 'deactivated' },
      },
      {
        path: '',
        redirectTo: 'sign-in',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [setupCompletionGuard, authenticatedGuard],
    canActivateChild: [setupCompletionChildGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () => import('./home').then((module) => module.HomeComponent),
        data: {
          title: 'Home',
          description: 'Daily summary and active work across the current context.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-home',
          area: 'end-user',
        },
      },
      {
        path: 'calendar',
        loadComponent: () => import('./calendar').then((module) => module.CalendarComponent),
        data: {
          title: 'Calendar',
          description: 'Schedule-first aggregate calendar with context-safe edits.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-calendar',
          area: 'end-user',
        },
      },
      {
        path: 'tasks',
        loadComponent: () => import('./tasks').then((module) => module.TasksComponent),
        data: {
          title: 'Tasks',
          description: 'Task overview and detail workspace for the current context.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-tasks',
          area: 'end-user',
        },
      },
      {
        path: 'organizations',
        loadComponent: () =>
          import('./org-overview.component').then((module) => module.OrgOverviewComponent),
        data: {
          title: 'Organizations',
          description:
            'Create organizations, review invitations, and enter organization workspaces.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-organizations',
          area: 'end-user',
        },
      },
      {
        path: 'schedules',
        loadComponent: loadPlaceholderPage,
        data: {
          title: 'Schedules',
          description: 'Schedule library shell with explicit context labeling.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-schedules',
          area: 'end-user',
          showBuilderLink: true,
        },
      },
      {
        path: 'schedules/builder',
        loadComponent: loadPlaceholderPage,
        canDeactivate: [unsavedChangesGuard],
        data: {
          title: 'Schedule Builder',
          description: 'Dedicated builder route used by quick create and schedule-first flows.',
          sectionLabel: 'Mutation Surface',
          testId: 'page-schedule-builder',
          area: 'end-user',
          mutationSurface: true,
        },
      },
      {
        path: 'requests',
        loadComponent: loadPlaceholderPage,
        data: {
          title: 'Requests',
          description: 'Request inbox and approval-aware route scaffold.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-requests',
          area: 'end-user',
        },
      },
      {
        path: 'history',
        loadComponent: loadPlaceholderPage,
        data: {
          title: 'History',
          description: 'Friendly audit and history surface scaffold.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-history',
          area: 'end-user',
        },
      },
      {
        path: 'notifications',
        loadComponent: loadPlaceholderPage,
        data: {
          title: 'Notifications',
          description: 'Notification center scaffold with explicit deep-link targets.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-notifications',
          area: 'end-user',
        },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./account-settings.component').then((module) => module.AccountSettingsComponent),
        data: {
          title: 'Settings',
          description: 'User settings for identity, preferences, and personal time policies.',
          sectionLabel: 'End-User Workspace',
          testId: 'page-settings',
          area: 'end-user',
        },
      },
      {
        path: 'org/overview',
        loadComponent: () =>
          import('./org-overview.component').then((module) => module.OrgOverviewComponent),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Organization Overview',
          description: 'Organization administration overview, memberships, and invitations.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-overview',
          area: 'org-admin',
        },
      },
      {
        path: 'org/calendars',
        loadComponent: () =>
          import('./org-calendars.component').then((module) => module.OrgCalendarsComponent),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Organization Calendars',
          description: 'Calendar administration for the active organization.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-calendars',
          area: 'org-admin',
        },
      },
      {
        path: 'org/groups',
        loadComponent: () =>
          import('./org-groups.component').then((module) => module.OrgGroupsComponent),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Groups',
          description: 'Membership and grouping workspace for the active organization.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-groups',
          area: 'org-admin',
        },
      },
      {
        path: 'org/assignments',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        canDeactivate: [unsavedChangesGuard],
        data: {
          title: 'Assignments',
          description: 'Assignment workspace scaffold with unsaved-change protection.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-assignments',
          area: 'org-admin',
          mutationSurface: true,
        },
      },
      {
        path: 'org/time-policies',
        loadComponent: () =>
          import('./org-time-policies.component').then((module) => module.OrgTimePoliciesComponent),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Time Policies',
          description: 'Policy preview and precedence workspace.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-time-policies',
          area: 'org-admin',
        },
      },
      {
        path: 'org/integrations',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'Organization Integrations',
          description: 'Organization-scoped provider configuration scaffold.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-integrations',
          area: 'org-admin',
        },
      },
      {
        path: 'org/request-rules',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'Request Rules',
          description: 'Reviewer and approval settings scaffold.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-request-rules',
          area: 'org-admin',
        },
      },
      {
        path: 'org/logs',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'Organization Logs',
          description: 'Authorized organization audit surface scaffold.',
          sectionLabel: 'Organization Administration',
          testId: 'page-org-logs',
          area: 'org-admin',
        },
      },
      {
        path: 'admin/setup',
        loadComponent: () =>
          import('./admin-setup.component').then((module) => module.AdminSetupComponent),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Setup / Deployment',
          description: 'Deployment summary and post-bootstrap administration workspace.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-setup',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/users',
        loadComponent: () =>
          import('./admin-users.component').then((module) => module.AdminUsersComponent),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Users',
          description: 'System user lifecycle and authentication policy controls.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-users',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/governance',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'Admin Governance',
          description: 'Tier and approval governance scaffold.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-governance',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/global-integrations',
        loadComponent: () =>
          import('./admin-global-integrations.component').then(
            (module) => module.AdminGlobalIntegrationsComponent,
          ),
        canActivate: [routeAreaGuard],
        data: {
          title: 'Global Integrations',
          description: 'Platform-wide provider configuration scaffold.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-global-integrations',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/entitlements',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'Editions / Entitlements',
          description: 'Entitlement management scaffold.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-entitlements',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/subscription-tiers',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'Subscription Tiers',
          description: 'Commercial tier scaffold.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-subscription-tiers',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/logs',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        data: {
          title: 'System Logs',
          description: 'System-wide audit and log scaffold.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-logs',
          area: 'system-admin',
        },
      },
      {
        path: 'admin/platform-settings',
        loadComponent: loadPlaceholderPage,
        canActivate: [routeAreaGuard],
        canDeactivate: [unsavedChangesGuard],
        data: {
          title: 'Platform Settings',
          description: 'Platform settings scaffold with unsaved-change protection.',
          sectionLabel: 'System Administration',
          testId: 'page-admin-platform-settings',
          area: 'system-admin',
          mutationSurface: true,
        },
      },
    ],
  },
  {
    path: 'setup',
    canActivate: [setupRouteGuard],
    loadComponent: () => import('./setup/setup.component').then((m) => m.SetupComponent),
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
