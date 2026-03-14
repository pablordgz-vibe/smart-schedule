create table if not exists user_settings (
  user_id text primary key references users(id) on delete cascade,
  locale text not null default 'en',
  time_format text not null default '24h' check (
    time_format in ('12h', '24h')
  ),
  timezone text not null default 'UTC',
  week_starts_on text not null default 'monday' check (
    week_starts_on in ('monday', 'sunday')
  ),
  updated_at timestamptz not null default now()
);
