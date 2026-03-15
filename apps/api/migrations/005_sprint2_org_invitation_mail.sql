alter table mail_outbox
  drop constraint if exists mail_outbox_kind_check;

alter table mail_outbox
  add constraint mail_outbox_kind_check
  check (
    kind in (
      'account-recovery',
      'email-verification',
      'password-reset',
      'organization-invitation'
    )
  );
