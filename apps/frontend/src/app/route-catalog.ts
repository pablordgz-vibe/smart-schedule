export type AppArea = 'end-user' | 'org-admin' | 'system-admin';
export type AppContextId = 'personal' | 'organization' | 'system';

export type AppContext = {
  id: AppContextId;
  label: string;
  description: string;
  landingRoute: string;
  allowedAreas: AppArea[];
};

export type NavItem = {
  label: string;
  path: string;
  icon: string;
  area: AppArea;
  testId: string;
  mobile?: boolean;
};

export type SearchRouteEntry = {
  area: AppArea;
  description: string;
  keywords: string[];
  label: string;
  path: string;
};

export const appContexts: AppContext[] = [
  {
    id: 'personal',
    label: 'Personal',
    description: 'Personal schedules and tasks',
    landingRoute: '/home',
    allowedAreas: ['end-user'],
  },
  {
    id: 'organization',
    label: 'Organization: Atlas Ops',
    description: 'Organization workspace and admin views',
    landingRoute: '/org/overview',
    allowedAreas: ['end-user', 'org-admin'],
  },
  {
    id: 'system',
    label: 'System Administration',
    description: 'Deployment and platform governance',
    landingRoute: '/admin/setup',
    allowedAreas: ['system-admin'],
  },
];

export const endUserNavItems: NavItem[] = [
  {
    label: 'Home',
    path: '/home',
    icon: 'Home',
    area: 'end-user',
    testId: 'nav-home',
    mobile: true,
  },
  {
    label: 'Calendar',
    path: '/calendar',
    icon: 'Calendar',
    area: 'end-user',
    testId: 'nav-calendar',
    mobile: true,
  },
  {
    label: 'Tasks',
    path: '/tasks',
    icon: 'Tasks',
    area: 'end-user',
    testId: 'nav-tasks',
    mobile: true,
  },
  {
    label: 'Schedules',
    path: '/schedules',
    icon: 'Schedules',
    area: 'end-user',
    testId: 'nav-schedules',
    mobile: true,
  },
  {
    label: 'Requests',
    path: '/requests',
    icon: 'Requests',
    area: 'end-user',
    testId: 'nav-requests',
  },
  { label: 'History', path: '/history', icon: 'History', area: 'end-user', testId: 'nav-history' },
  {
    label: 'Notifications',
    path: '/notifications',
    icon: 'Notifications',
    area: 'end-user',
    testId: 'nav-notifications',
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: 'Settings',
    area: 'end-user',
    testId: 'nav-settings',
  },
];

export const orgAdminNavItems: NavItem[] = [
  {
    label: 'Organization Overview',
    path: '/org/overview',
    icon: 'Overview',
    area: 'org-admin',
    testId: 'nav-org-overview',
  },
  {
    label: 'Calendars',
    path: '/org/calendars',
    icon: 'Calendars',
    area: 'org-admin',
    testId: 'nav-org-calendars',
  },
  {
    label: 'Groups',
    path: '/org/groups',
    icon: 'Groups',
    area: 'org-admin',
    testId: 'nav-org-groups',
  },
  {
    label: 'Assignments',
    path: '/org/assignments',
    icon: 'Assignments',
    area: 'org-admin',
    testId: 'nav-org-assignments',
  },
  {
    label: 'Time Policies',
    path: '/org/time-policies',
    icon: 'Policies',
    area: 'org-admin',
    testId: 'nav-org-time-policies',
  },
  {
    label: 'Integrations',
    path: '/org/integrations',
    icon: 'Integrations',
    area: 'org-admin',
    testId: 'nav-org-integrations',
  },
  {
    label: 'Request Rules',
    path: '/org/request-rules',
    icon: 'Rules',
    area: 'org-admin',
    testId: 'nav-org-request-rules',
  },
  { label: 'Logs', path: '/org/logs', icon: 'Logs', area: 'org-admin', testId: 'nav-org-logs' },
];

export const systemAdminNavItems: NavItem[] = [
  {
    label: 'Setup / Deployment',
    path: '/admin/setup',
    icon: 'Setup',
    area: 'system-admin',
    testId: 'nav-admin-setup',
  },
  {
    label: 'Users',
    path: '/admin/users',
    icon: 'Users',
    area: 'system-admin',
    testId: 'nav-admin-users',
  },
  {
    label: 'Admin Governance',
    path: '/admin/governance',
    icon: 'Governance',
    area: 'system-admin',
    testId: 'nav-admin-governance',
  },
  {
    label: 'Global Integrations',
    path: '/admin/global-integrations',
    icon: 'Global Integrations',
    area: 'system-admin',
    testId: 'nav-admin-integrations',
  },
  {
    label: 'Editions / Entitlements',
    path: '/admin/entitlements',
    icon: 'Entitlements',
    area: 'system-admin',
    testId: 'nav-admin-entitlements',
  },
  {
    label: 'Subscription Tiers',
    path: '/admin/subscription-tiers',
    icon: 'Tiers',
    area: 'system-admin',
    testId: 'nav-admin-subscriptions',
  },
  {
    label: 'System Logs',
    path: '/admin/logs',
    icon: 'Logs',
    area: 'system-admin',
    testId: 'nav-admin-logs',
  },
  {
    label: 'Platform Settings',
    path: '/admin/platform-settings',
    icon: 'Platform Settings',
    area: 'system-admin',
    testId: 'nav-admin-platform-settings',
  },
];

export const quickCreateRoute = '/schedules/builder';

export const searchableRoutes: SearchRouteEntry[] = [
  {
    area: 'end-user',
    description: 'Daily summary and active work across the current context.',
    keywords: ['dashboard', 'overview', 'today'],
    label: 'Home',
    path: '/home',
  },
  {
    area: 'end-user',
    description: 'Schedule-first aggregate calendar for the active context.',
    keywords: ['agenda', 'dates', 'events'],
    label: 'Calendar',
    path: '/calendar',
  },
  {
    area: 'end-user',
    description: 'Task overview, filters, and task detail workspace.',
    keywords: ['work', 'todos', 'checklist'],
    label: 'Tasks',
    path: '/tasks',
  },
  {
    area: 'end-user',
    description: 'Schedule library with explicit context labeling.',
    keywords: ['templates', 'assignments', 'plans'],
    label: 'Schedules',
    path: '/schedules',
  },
  {
    area: 'end-user',
    description: 'Dedicated schedule builder used by quick create.',
    keywords: ['builder', 'create', 'quick create', 'new schedule'],
    label: 'Schedule Builder',
    path: '/schedules/builder',
  },
  {
    area: 'end-user',
    description: 'Request inbox and approval-aware workflow shell.',
    keywords: ['approvals', 'review', 'changes'],
    label: 'Requests',
    path: '/requests',
  },
  {
    area: 'end-user',
    description: 'User-facing history and audit summaries.',
    keywords: ['audit', 'activity', 'changes'],
    label: 'History',
    path: '/history',
  },
  {
    area: 'end-user',
    description: 'Notification center and deep-link targets.',
    keywords: ['alerts', 'inbox', 'reminders'],
    label: 'Notifications',
    path: '/notifications',
  },
  {
    area: 'end-user',
    description: 'Identity, preferences, lifecycle, and billing settings.',
    keywords: ['account', 'preferences', 'profile'],
    label: 'Settings',
    path: '/settings',
  },
  {
    area: 'org-admin',
    description: 'Organization administration landing view.',
    keywords: ['organization', 'overview', 'admin'],
    label: 'Organization Overview',
    path: '/org/overview',
  },
  {
    area: 'org-admin',
    description: 'Organization calendar administration workspace.',
    keywords: ['organization', 'calendars'],
    label: 'Organization Calendars',
    path: '/org/calendars',
  },
  {
    area: 'org-admin',
    description: 'Groups, memberships, and access grouping workspace.',
    keywords: ['memberships', 'teams', 'groups'],
    label: 'Groups',
    path: '/org/groups',
  },
  {
    area: 'org-admin',
    description: 'Assignment workspace with protected mutation flows.',
    keywords: ['assignments', 'staffing', 'coverage'],
    label: 'Assignments',
    path: '/org/assignments',
  },
  {
    area: 'org-admin',
    description: 'Time policy preview and precedence workspace.',
    keywords: ['availability', 'blackouts', 'working hours'],
    label: 'Time Policies',
    path: '/org/time-policies',
  },
  {
    area: 'org-admin',
    description: 'Organization-scoped provider configuration.',
    keywords: ['integrations', 'providers', 'credentials'],
    label: 'Organization Integrations',
    path: '/org/integrations',
  },
  {
    area: 'org-admin',
    description: 'Reviewer assignment and approval settings.',
    keywords: ['reviewers', 'rules', 'approvals'],
    label: 'Request Rules',
    path: '/org/request-rules',
  },
  {
    area: 'org-admin',
    description: 'Organization audit and operational logs.',
    keywords: ['logs', 'audit', 'history'],
    label: 'Organization Logs',
    path: '/org/logs',
  },
  {
    area: 'system-admin',
    description: 'Deployment setup and runtime management surface.',
    keywords: ['deployment', 'setup', 'platform'],
    label: 'Setup / Deployment',
    path: '/admin/setup',
  },
  {
    area: 'system-admin',
    description: 'System-wide account lifecycle and auth policy controls.',
    keywords: ['users', 'accounts', 'lifecycle'],
    label: 'Users',
    path: '/admin/users',
  },
  {
    area: 'system-admin',
    description: 'System admin governance, tiers, and approvals.',
    keywords: ['governance', 'tiers', 'approvals'],
    label: 'Admin Governance',
    path: '/admin/governance',
  },
  {
    area: 'system-admin',
    description: 'Platform-wide integration configuration.',
    keywords: ['global integrations', 'providers', 'credentials'],
    label: 'Global Integrations',
    path: '/admin/global-integrations',
  },
  {
    area: 'system-admin',
    description: 'Edition-level entitlements and limits.',
    keywords: ['entitlements', 'limits', 'edition'],
    label: 'Editions / Entitlements',
    path: '/admin/entitlements',
  },
  {
    area: 'system-admin',
    description: 'Commercial subscription tier management.',
    keywords: ['subscription', 'tiers', 'billing'],
    label: 'Subscription Tiers',
    path: '/admin/subscription-tiers',
  },
  {
    area: 'system-admin',
    description: 'System-wide logs and audit feed.',
    keywords: ['system logs', 'audit', 'history'],
    label: 'System Logs',
    path: '/admin/logs',
  },
  {
    area: 'system-admin',
    description: 'Mutable platform-wide settings.',
    keywords: ['platform settings', 'configuration'],
    label: 'Platform Settings',
    path: '/admin/platform-settings',
  },
];

export const routeAreaFromUrl = (url: string): AppArea => {
  if (url.startsWith('/admin')) {
    return 'system-admin';
  }

  if (url.startsWith('/org')) {
    return 'org-admin';
  }

  return 'end-user';
};
