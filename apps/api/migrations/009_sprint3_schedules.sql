create table if not exists schedules (
  id text primary key,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  created_by_user_id text not null references users(id),
  lifecycle_state text not null default 'active' check (lifecycle_state in ('active', 'deleted')),
  operational_state text not null check (operational_state in ('active', 'archived', 'template')),
  name text not null,
  description text null,
  boundary_start_date date null,
  boundary_end_date date null,
  last_materialized_from timestamptz null,
  last_materialized_to timestamptz null,
  last_materialized_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null)
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null)
  )
);

create table if not exists schedule_versions (
  id text primary key,
  schedule_id text not null references schedules(id) on delete cascade,
  effective_from_date date not null,
  timezone text not null,
  timezone_mode text not null check (timezone_mode in ('utc_constant', 'wall_clock')),
  recurrence_rule jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  change_summary text null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  unique (schedule_id, effective_from_date)
);

create table if not exists schedule_exceptions (
  id text primary key,
  schedule_id text not null references schedules(id) on delete cascade,
  occurrence_date date not null,
  target_item_id text null,
  action text not null check (action in ('cancel', 'move', 'replace')),
  detached boolean not null default false,
  override_data jsonb not null default '{}'::jsonb,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null
);

create unique index if not exists schedule_exceptions_occurrence_scope_idx
  on schedule_exceptions (schedule_id, occurrence_date, action)
  where target_item_id is null;

create unique index if not exists schedule_exceptions_item_scope_idx
  on schedule_exceptions (schedule_id, occurrence_date, action, target_item_id)
  where target_item_id is not null;

create table if not exists schedule_occurrence_projections (
  id text primary key,
  schedule_id text not null references schedules(id) on delete cascade,
  schedule_version_id text not null references schedule_versions(id) on delete cascade,
  occurrence_date date not null,
  item_definition_id text not null,
  item_type text not null check (item_type in ('event', 'task')),
  title text not null,
  local_date date not null,
  starts_at timestamptz null,
  ends_at timestamptz null,
  due_at timestamptz null,
  timezone text not null,
  timezone_mode text not null check (timezone_mode in ('utc_constant', 'wall_clock')),
  detached boolean not null default false,
  projection_hash text not null,
  linked_exception_id text null references schedule_exceptions(id) on delete set null,
  materialized_at timestamptz not null,
  unique (schedule_id, occurrence_date, item_definition_id)
);

create index if not exists schedules_ctx_org_state_idx
  on schedules (organization_id, operational_state, updated_at desc)
  where context_type = 'organization';

create index if not exists schedules_ctx_personal_state_idx
  on schedules (personal_owner_user_id, operational_state, updated_at desc)
  where context_type = 'personal';

create index if not exists schedule_versions_schedule_idx
  on schedule_versions (schedule_id, effective_from_date);

create index if not exists schedule_exceptions_schedule_idx
  on schedule_exceptions (schedule_id, occurrence_date);

create index if not exists schedule_occurrence_projections_schedule_idx
  on schedule_occurrence_projections (schedule_id, occurrence_date, local_date);

create index if not exists schedule_occurrence_projections_window_idx
  on schedule_occurrence_projections (starts_at, due_at, local_date);
