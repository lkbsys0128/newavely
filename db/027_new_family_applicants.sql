create table if not exists new_family_applicants (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_row_number integer not null,
  submitted_at timestamptz,
  name text not null,
  email text,
  phone text,
  group_interest text,
  expected_group text,
  memo text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'week_1', 'week_2', 'week_3', 'completed', 'archived')),
  source_data jsonb not null default '{}'::jsonb,
  converted_member_id uuid references members(id) on delete set null,
  converted_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists new_family_applicants_status_idx
on new_family_applicants(status);

create index if not exists new_family_applicants_submitted_at_idx
on new_family_applicants(submitted_at desc nulls last);

alter table new_family_applicants enable row level security;

drop policy if exists "owners and admins can read new family applicants" on new_family_applicants;
create policy "owners and admins can read new family applicants"
on new_family_applicants for select
using (current_member_role() in ('owner', 'admin'));

drop policy if exists "owners and admins can create new family applicants" on new_family_applicants;
create policy "owners and admins can create new family applicants"
on new_family_applicants for insert
with check (current_member_role() in ('owner', 'admin'));

drop policy if exists "owners and admins can update new family applicants" on new_family_applicants;
create policy "owners and admins can update new family applicants"
on new_family_applicants for update
using (current_member_role() in ('owner', 'admin'))
with check (current_member_role() in ('owner', 'admin'));
