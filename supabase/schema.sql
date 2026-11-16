-- Run once in the Supabase SQL editor.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null check (lat between 12.6 and 13.4),
  lng double precision not null check (lng between 77.2 and 78.0),
  severity smallint not null check (severity between 1 and 3),
  note text check (char_length(note) <= 280),
  photo_url text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmations int not null default 0
);

create index reports_expires_at_idx on public.reports (expires_at);

alter table public.reports enable row level security;

-- Auto-expiry: expired rows simply stop being visible.
create policy "read active reports" on public.reports
  for select using (expires_at > now());

create policy "anyone can report" on public.reports
  for insert with check (
    confirmations = 0
    and expires_at <= now() + interval '6 hours 5 minutes'
  );

-- Votes go through functions so anonymous users cannot edit rows directly.
create function public.confirm_report(report_id uuid) returns void
language sql security definer set search_path = public as $$
  update reports
     set confirmations = confirmations + 1,
         expires_at = now() + (case severity when 1 then 2 when 2 then 4 else 6 end) * interval '1 hour'
   where id = report_id and expires_at > now();
$$;

create function public.clear_report(report_id uuid) returns void
language sql security definer set search_path = public as $$
  update reports set expires_at = now() where id = report_id and expires_at > now();
$$;

grant execute on function public.confirm_report(uuid) to anon;
grant execute on function public.clear_report(uuid) to anon;

-- Live markers.
alter publication supabase_realtime add table public.reports;

-- Photo storage.
insert into storage.buckets (id, name, public) values ('report-photos', 'report-photos', true);

create policy "anyone can upload report photos" on storage.objects
  for insert with check (bucket_id = 'report-photos');

-- ---------------------------------------------------------------------------
-- v2: place names and report history (also in migrations/002_history.sql).
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

-- ---------------------------------------------------------------------------
-- v3: sensors, alerts and demo data. Run supabase/migrations/003_sensors_alerts.sql.
