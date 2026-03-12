create table if not exists time_policies (
  id text primary key,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  scope_level text not null check (scope_level in ('organization', 'group', 'user')),
  target_group_id text null references organization_groups(id) on delete cascade,
  target_user_id text null references users(id) on delete cascade,
  policy_type text not null check (
    policy_type in (
      'working_hours',
      'availability',
      'unavailability',
      'holiday',
      'blackout',
      'rest',
      'max_hours'
    )
  ),
  source_type text not null default 'custom' check (source_type in ('custom', 'official')),
  title text not null,
  rule_data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null)
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null)
  ),
  check (
    (scope_level = 'organization' and target_group_id is null and target_user_id is null)
    or (scope_level = 'group' and target_group_id is not null and target_user_id is null)
    or (scope_level = 'user' and target_group_id is null and target_user_id is not null)
  )
);

create table if not exists time_advisory_results (
  id text primary key,
  context_type text not null check (context_type in ('organization', 'personal')),
  organization_id text null references organizations(id) on delete cascade,
  personal_owner_user_id text null references users(id) on delete cascade,
  target_user_id text null references users(id) on delete set null,
  candidate_start_at timestamptz not null,
  candidate_end_at timestamptz not null,
  concerns jsonb not null,
  alternative_slots jsonb not null,
  created_by_user_id text not null references users(id),
  created_at timestamptz not null,
  check (
    (context_type = 'organization' and organization_id is not null and personal_owner_user_id is null)
    or (context_type = 'personal' and organization_id is null and personal_owner_user_id is not null)
  )
);

create index if not exists time_policies_context_org_idx
  on time_policies (organization_id, policy_type)
  where context_type = 'organization';

create index if not exists time_policies_context_personal_idx
  on time_policies (personal_owner_user_id, policy_type)
  where context_type = 'personal';

create index if not exists time_policies_scope_idx
  on time_policies (scope_level, target_group_id, target_user_id);

create index if not exists time_advisory_results_ctx_org_idx
  on time_advisory_results (organization_id, created_at desc)
  where context_type = 'organization';

create index if not exists time_advisory_results_ctx_personal_idx
  on time_advisory_results (personal_owner_user_id, created_at desc)
  where context_type = 'personal';
