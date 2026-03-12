export const ORG_MOD = 'org';

export type OrganizationRole = 'admin' | 'member';

export type Organization = {
  id: string;
  name: string;
};

export type OrganizationMembership = {
  organizationId: string;
  role: OrganizationRole;
  userId: string;
};

export type OrganizationInvitation = {
  id: string;
  invitedEmail: string;
  organizationId: string;
  role: OrganizationRole;
};

export type OrganizationGroup = {
  id: string;
  name: string;
  organizationId: string;
};
