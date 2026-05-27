create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);

comment on table audit_logs is
  'Append-only application audit log. Default operational retention policy: keep searchable logs for 12 months; archive or delete older logs after a reviewed retention process is implemented.';

comment on column audit_logs.created_at is
  'Used for recent audit views, date-range filtering, and future retention/archive jobs.';
