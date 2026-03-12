create table if not exists personal_calendars (
  id text primary key,
  owner_user_id text not null references users(id) on delete cascade,
  name text not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (owner_user_id, name)
);

create table if not exists calendar_events (
  id text primary key,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  created_by_user_id text not null references users(id),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'deleted')),
  title text not null,
  all_day boolean not null default false,
  start_at timestamptz null,
  end_at timestamptz null,
  all_day_start_date date null,
  all_day_end_date date null,
  duration_minutes integer null check (duration_minutes is null or duration_minutes > 0),
  timezone text not null default 'UTC',
  location text null,
  notes text null,
  work_related boolean not null default false,
  linked_task_id text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null)
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null)
  ),
  check (
    (all_day = true and all_day_start_date is not null and all_day_end_date is not null and start_at is null and end_at is null)
    or (all_day = false and start_at is not null and end_at is not null and all_day_start_date is null and all_day_end_date is null)
  )
);

create table if not exists calendar_tasks (
  id text primary key,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  created_by_user_id text not null references users(id),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'deleted')),
  title text not null,
  due_at timestamptz null,
  timezone text not null default 'UTC',
  location text null,
  notes text null,
  work_related boolean not null default false,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'completed')),
  completed boolean not null default false,
  estimated_duration_minutes integer null check (estimated_duration_minutes is null or estimated_duration_minutes >= 0),
  auto_complete_from_subtasks boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null)
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null)
  )
);

create table if not exists calendar_item_calendar_memberships (
  id text primary key,
  item_type text not null check (item_type in ('event', 'task')),
  item_id text not null,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  calendar_type text not null check (calendar_type in ('organization', 'personal')),
  calendar_id text not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null and calendar_type = 'organization')
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null and calendar_type = 'personal')
  ),
  unique (item_type, item_id, calendar_id)
);

create table if not exists calendar_task_dependencies (
  id text primary key,
  task_id text not null references calendar_tasks(id) on delete cascade,
  depends_on_task_id text not null references calendar_tasks(id) on delete cascade,
  created_at timestamptz not null,
  unique (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

create table if not exists calendar_task_subtasks (
  id text primary key,
  task_id text not null references calendar_tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists imported_contacts (
  id text primary key,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  provider_code text not null,
  provider_contact_id text not null,
  display_name text not null,
  email text null,
  phone text null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null)
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null)
  )
);

create unique index if not exists imported_contacts_personal_provider_idx
  on imported_contacts (personal_owner_user_id, provider_code, provider_contact_id)
  where context_type = 'personal';

create unique index if not exists imported_contacts_org_provider_idx
  on imported_contacts (organization_id, provider_code, provider_contact_id)
  where context_type = 'organization';

create table if not exists calendar_event_contacts (
  event_id text not null references calendar_events(id) on delete cascade,
  contact_id text not null references imported_contacts(id) on delete cascade,
  created_at timestamptz not null,
  primary key (event_id, contact_id)
);

create table if not exists calendar_task_contacts (
  task_id text not null references calendar_tasks(id) on delete cascade,
  contact_id text not null references imported_contacts(id) on delete cascade,
  created_at timestamptz not null,
  primary key (task_id, contact_id)
);

create table if not exists calendar_item_copy_provenance (
  id text primary key,
  item_type text not null check (item_type in ('event', 'task')),
  item_id text not null,
  source_context_type text not null check (source_context_type in ('organization', 'personal')),
  source_organization_id text null references organizations(id) on delete set null,
  source_personal_owner_user_id text null references users(id) on delete set null,
  source_item_id text not null,
  source_item_type text not null check (source_item_type in ('event', 'task')),
  copied_at timestamptz not null,
  copied_by_user_id text not null references users(id),
  check (
    (source_context_type = 'organization' and source_organization_id is not null and source_personal_owner_user_id is null)
    or (source_context_type = 'personal' and source_organization_id is null and source_personal_owner_user_id is not null)
  )
);

create table if not exists calendar_item_attachments (
  id text primary key,
  item_type text not null check (item_type in ('event', 'task', 'schedule')),
  item_id text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  storage_key text not null,
  state text not null check (state in ('created', 'quarantined', 'ready', 'rejected')),
  created_by_user_id text not null references users(id),
  created_at timestamptz not null
);

create index if not exists personal_calendars_owner_idx
  on personal_calendars (owner_user_id);
create index if not exists calendar_events_ctx_org_idx
  on calendar_events (organization_id)
  where context_type = 'organization';
create index if not exists calendar_events_ctx_personal_idx
  on calendar_events (personal_owner_user_id)
  where context_type = 'personal';
create index if not exists calendar_tasks_ctx_org_idx
  on calendar_tasks (organization_id)
  where context_type = 'organization';
create index if not exists calendar_tasks_ctx_personal_idx
  on calendar_tasks (personal_owner_user_id)
  where context_type = 'personal';
create index if not exists calendar_tasks_due_idx
  on calendar_tasks (due_at)
  where due_at is not null;
create index if not exists calendar_memberships_item_idx
  on calendar_item_calendar_memberships (item_type, item_id);
create index if not exists calendar_memberships_calendar_idx
  on calendar_item_calendar_memberships (calendar_type, calendar_id);
create index if not exists calendar_event_contacts_event_idx
  on calendar_event_contacts (event_id);
create index if not exists calendar_task_contacts_task_idx
  on calendar_task_contacts (task_id);
create index if not exists calendar_item_copy_item_idx
  on calendar_item_copy_provenance (item_type, item_id);
create index if not exists calendar_item_attachments_item_idx
  on calendar_item_attachments (item_type, item_id);
