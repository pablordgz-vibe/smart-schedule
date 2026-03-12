create table if not exists organizations (
  id text primary key,
  name text not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists organization_memberships (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  can_view_all_calendars boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, user_id)
);

create table if not exists organization_invitations (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  invited_email text not null,
  invited_by_user_id text not null references users(id),
  role text not null check (role in ('admin', 'member')),
  invite_code text not null unique,
  accepted_by_user_id text null references users(id),
  accepted_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

create table if not exists organization_groups (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (organization_id, name)
);

create table if not exists organization_group_members (
  group_id text not null references organization_groups(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  added_at timestamptz not null,
  primary key (group_id, user_id)
);

create table if not exists organization_calendars (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  owner_user_id text null references users(id),
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists organization_calendar_visibility_grants (
  organization_id text not null references organizations(id) on delete cascade,
  calendar_id text not null references organization_calendars(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  granted_by_user_id text not null references users(id),
  granted_at timestamptz not null,
  primary key (calendar_id, user_id)
);

create index if not exists organization_memberships_user_idx
  on organization_memberships (user_id);
create index if not exists organization_memberships_org_idx
  on organization_memberships (organization_id);
create index if not exists organization_invitations_email_idx
  on organization_invitations (invited_email);
create index if not exists organization_calendars_org_idx
  on organization_calendars (organization_id);
create index if not exists organization_calendars_owner_idx
  on organization_calendars (owner_user_id);
