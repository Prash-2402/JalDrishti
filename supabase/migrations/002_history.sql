-- Run once in the Supabase SQL editor. Safe to run again.

-- Street or area name for each report, looked up when it is sent.
alter table public.reports add column if not exists place text check (char_length(place) <= 120);

-- Activity feed and spot history: recent reports, including ones that have
-- expired or been cleared. Returns no photos or notes.
create or replace function public.report_history(hours int default 24)
returns table (
  id uuid, lat double precision, lng double precision, severity smallint, place text,
  observed_at timestamptz, created_at timestamptz, expires_at timestamptz, confirmations int
)
language sql stable security definer set search_path = public as $$
  select id, lat, lng, severity, place, observed_at, created_at, expires_at, confirmations
    from reports
   where created_at > now() - make_interval(hours => least(greatest(hours, 1), 720))
   order by created_at desc
   limit 500;
$$;

grant execute on function public.report_history(int) to anon;
