alter table mail_outbox
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists processing_started_at timestamptz null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists failed_at timestamptz null,
  add column if not exists failure_reason text null;

create index if not exists mail_outbox_pending_delivery_idx
  on mail_outbox (created_at)
  where delivered_at is null;
