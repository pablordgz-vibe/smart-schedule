create extension if not exists pgcrypto;

create table if not exists setup_state (
  id integer primary key default 1 check (id = 1),
  edition text not null,
  admin_user_id text null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists setup_integrations (
  code text primary key,
  category text not null,
  credentials jsonb not null default '{}'::jsonb,
  enabled boolean not null,
  mode text not null,
  updated_at timestamptz not null default now()
);

create table if not exists identity_config (
  id integer primary key default 1 check (id = 1),
  min_admin_tier_for_account_deactivation integer not null default 0,
  require_email_verification boolean not null default false,
  supported_social_providers text[] not null default array['google', 'github']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  admin_tier integer null,
  created_at timestamptz not null,
  deleted_at timestamptz null,
  email text not null unique,
  email_verified boolean not null,
  name text not null,
  password_hash text null,
  recover_until timestamptz null,
  roles text[] not null,
  state text not null check (state in ('active', 'deactivated', 'deleted')),
  updated_at timestamptz not null
);

create table if not exists social_identities (
  provider text not null,
  provider_subject text not null,
  user_id text not null references users(id) on delete cascade,
  linked_at timestamptz not null,
  primary key (provider, provider_subject),
  unique (user_id, provider)
);

create table if not exists identity_tokens (
  id text primary key,
  consumed_at timestamptz null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  kind text not null check (
    kind in ('account-recovery', 'email-verification', 'password-reset')
  ),
  token_hash text not null unique,
  user_id text not null references users(id) on delete cascade
);

create table if not exists mail_outbox (
  id text primary key,
  body text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  kind text not null check (
    kind in ('account-recovery', 'email-verification', 'password-reset')
  ),
  subject text not null,
  transport text not null default 'outbox',
  recipient_email text not null
);

create table if not exists sessions (
  id text primary key,
  actor_id text not null,
  context_id text null,
  context_tenant_id text null,
  context_type text not null check (
    context_type in ('organization', 'personal', 'public', 'system')
  ),
  created_at timestamptz not null,
  csrf_token text not null,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists users_state_idx on users (state);
create index if not exists sessions_actor_id_idx on sessions (actor_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);
create index if not exists mail_outbox_recipient_email_idx on mail_outbox (recipient_email);
