alter table new_family_applicants
drop constraint if exists new_family_applicants_status_check;

update new_family_applicants
set status = 'week_1'
where status = 'in_progress';

alter table new_family_applicants
add constraint new_family_applicants_status_check
check (status in ('new', 'contacted', 'week_1', 'week_2', 'week_3', 'completed', 'archived'));
