-- Preserve usage and historical reservations; remove only monthly admission control.
drop trigger if exists prayer_monthly_budget on public.prayer_generation_requests;
drop function if exists public.get_prayer_generation_budget(integer);
drop function if exists public.reserve_prayer_monthly_budget();
drop function if exists public.prayer_budget_committed();
