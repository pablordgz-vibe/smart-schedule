export type AppArea = 'end-user' | 'org-admin' | 'system-admin';
export type AppContextType = 'organization' | 'personal' | 'public' | 'system';

export type AppContext = {
  id: string;
  contextType: AppContextType;
  label: string;
  description: string;
  landingRoute: string;
  allowedAreas: AppArea[];
  organizationId: string | null;
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
    label: 'Organizations',
    path: '/organizations',
    icon: 'Organizations',
    area: 'end-user',
    testId: 'nav-organizations',
    mobile: true,
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
    label: 'Time Policies',
    path: '/org/time-policies',
    icon: 'Policies',
    area: 'org-admin',
    testId: 'nav-org-time-policies',
  },
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
    label: 'Global Integrations',
    path: '/admin/global-integrations',
    icon: 'Global Integrations',
    area: 'system-admin',
    testId: 'nav-admin-integrations',
  },
];

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
    description: 'Create organizations, review invitations, and enter organization workspaces.',
    keywords: ['organization', 'invite', 'membership', 'join'],
    label: 'Organizations',
    path: '/organizations',
  },
  {
    area: 'end-user',
    description: 'Identity, preferences, lifecycle, and personal time policies.',
    keywords: ['account', 'preferences', 'profile'],
    label: 'Settings',
    path: '/settings',
  },
  {
    area: 'org-admin',
    description: 'Organization administration overview, memberships, and invitations.',
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
    description: 'Time policy preview and precedence workspace.',
    keywords: ['availability', 'blackouts', 'working hours'],
    label: 'Time Policies',
    path: '/org/time-policies',
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
    description: 'Platform-wide integration configuration.',
    keywords: ['global integrations', 'providers', 'credentials'],
    label: 'Global Integrations',
    path: '/admin/global-integrations',
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
