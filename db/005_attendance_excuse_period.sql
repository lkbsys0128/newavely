alter table attendance_records
  add column if not exists excuse_start_date date,
  add column if not exists excuse_end_date date;

create index if not exists attendance_records_excuse_period_idx
on attendance_records(excuse_start_date, excuse_end_date)
where status = 'excused';
