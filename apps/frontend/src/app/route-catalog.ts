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

export const routeAreaFromUrl = (url: string): AppArea => {
  if (url.startsWith('/admin')) {
    return 'system-admin';
  }

  if (url.startsWith('/org')) {
    return 'org-admin';
  }

  return 'end-user';
};
