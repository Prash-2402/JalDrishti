-- Run once in the Supabase SQL editor. Safe to run again.
-- Sensors, their readings, and alerts (water rising, electricity in the
-- water, and logged votes), plus the demo-data flag on reports.

-- Sensors ---------------------------------------------------------------------
create table if not exists public.sensors (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  is_simulated boolean not null default true,
  device_key_hash text, -- sha256 of the device's key (hex); null for simulated sensors
  installed_at timestamptz not null default now()
);

insert into public.sensors (id, name, lat, lng) values
  ('s-bellandur', 'Bellandur, Outer Ring Road', 12.9279, 77.681),
  ('s-sarjapur', 'Rainbow Drive, Sarjapur Road', 12.908, 77.687),
  ('s-kadubeesanahalli', 'Kadubeesanahalli, Outer Ring Road', 12.9395, 77.6955),
  ('s-munnekolala', 'Munnekolala, Marathahalli', 12.955, 77.701),
  ('s-koramangala', 'Koramangala 4th Block', 12.934, 77.63),
  ('s-silkboard', 'Silk Board Junction', 12.9177, 77.6233)
on conflict (id) do nothing;

create table if not exists public.sensor_readings (
  id bigint generated always as identity primary key,
  sensor_id text not null references public.sensors on delete cascade,
  water_cm real check (water_cm between 0 and 500),
  volts real check (volts between 0 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists sensor_readings_sensor_idx on public.sensor_readings (sensor_id, created_at desc);

-- Alerts ----------------------------------------------------------------------
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('water', 'wire', 'still', 'cleared')),
  lat double precision not null,
  lng double precision not null,
  cm real,
  severity smallint,
  place text check (char_length(place) <= 120),
  sensor_id text references public.sensors on delete set null,
  report_id uuid references public.reports on delete set null,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  cleared_at timestamptz
);
create index if not exists alerts_created_idx on public.alerts (created_at desc);

-- Everyone can read; only the functions below write.
alter table public.sensors enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.alerts enable row level security;
drop policy if exists "read sensors" on public.sensors;
drop policy if exists "read readings" on public.sensor_readings;
drop policy if exists "read alerts" on public.alerts;
create policy "read sensors" on public.sensors for select using (true);
create policy "read readings" on public.sensor_readings for select using (true);
create policy "read alerts" on public.alerts for select using (true);

-- A reading turns into an alert: electricity (10 V or more) in floodwater
-- (10 cm or more) is a danger zone for 2 hours; water 30 cm or deeper is "water rising" for 1 hour, kept fresh
-- while readings stay high. Normal readings clear the sensor's alerts.
create or replace function public.on_reading() returns trigger
language plpgsql security definer set search_path = public as $$
declare s sensors;
begin
  select * into s from sensors where id = new.sensor_id;

  if coalesce(new.volts, 0) >= 10 and coalesce(new.water_cm, 0) >= 10 then
    if not exists (select 1 from alerts where sensor_id = s.id and kind = 'wire' and cleared_at is null and expires_at > now()) then
      insert into alerts (kind, lat, lng, cm, place, sensor_id, is_simulated, expires_at)
      values ('wire', s.lat, s.lng, new.water_cm, s.name, s.id, s.is_simulated, now() + interval '2 hours');
    end if;
  else
    update alerts set cleared_at = now() where sensor_id = s.id and kind = 'wire' and cleared_at is null;
  end if;

  if coalesce(new.water_cm, 0) >= 30 then
    update alerts set cm = new.water_cm, expires_at = now() + interval '1 hour'
     where sensor_id = s.id and kind = 'water' and cleared_at is null and expires_at > now();
    if not found then
      insert into alerts (kind, lat, lng, cm, place, sensor_id, is_simulated, expires_at)
      values ('water', s.lat, s.lng, new.water_cm, s.name, s.id, s.is_simulated, now() + interval '1 hour');
    end if;
  else
    update alerts set cleared_at = now() where sensor_id = s.id and kind = 'water' and cleared_at is null;
  end if;
  return new;
end $$;

drop trigger if exists reading_alerts on public.sensor_readings;
create trigger reading_alerts after insert on public.sensor_readings
  for each row execute function public.on_reading();

-- Demo: a reading from a simulated sensor, through the same trigger a real one uses.
create or replace function public.simulate_reading(sensor text, water_cm real, volts real) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sensors where id = sensor and is_simulated) then
    raise exception 'Only simulated sensors can be triggered from the app';
  end if;
  insert into sensor_readings (sensor_id, water_cm, volts) values (sensor, water_cm, volts);
end $$;

-- Demo: water rising or electricity at any point (no sensor). At most 30 demo
-- alerts in 10 minutes; each clears itself after 30 minutes.
create or replace function public.simulate_alert(kind text, lat double precision, lng double precision, cm real, place text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if kind not in ('water', 'wire') or lat not between 12.6 and 13.4 or lng not between 77.2 and 78.0 then
    raise exception 'Invalid demo alert';
  end if;
  if (select count(*) from alerts where is_simulated and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Too many demo alerts. Try again in a few minutes.';
  end if;
  insert into alerts (kind, lat, lng, cm, place, is_simulated, expires_at)
  values (kind, lat, lng, least(greatest(cm, 0), 150), left(place, 120), true, now() + interval '30 minutes');
end $$;

create or replace function public.clear_alert(alert_id uuid) returns void
language sql security definer set search_path = public as $$
  update alerts set cleared_at = now() where id = alert_id and is_simulated and cleared_at is null;
$$;

create or replace function public.clear_demo_alerts() returns void
language sql security definer set search_path = public as $$
  update alerts set cleared_at = now() where is_simulated and cleared_at is null and kind in ('water', 'wire');
$$;

-- Activity log: alerts from the last `hours`, including cleared ones.
create or replace function public.alert_history(hours int default 168)
returns setof public.alerts
language sql stable security definer set search_path = public as $$
  select * from alerts
   where created_at > now() - make_interval(hours => least(greatest(hours, 1), 720))
   order by created_at desc
   limit 300;
$$;

-- Votes now also write a line in the activity log.
create or replace function public.confirm_report(report_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  update reports
     set confirmations = confirmations + 1,
         expires_at = now() + (case severity when 1 then 2 when 2 then 4 else 6 end) * interval '1 hour'
   where id = report_id and expires_at > now()
  returning * into r;
  if found then
    insert into alerts (kind, lat, lng, severity, place, report_id, expires_at)
    values ('still', r.lat, r.lng, r.severity, r.place, r.id, now());
  end if;
end $$;

create or replace function public.clear_report(report_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  update reports set expires_at = now() where id = report_id and expires_at > now() returning * into r;
  if found then
    insert into alerts (kind, lat, lng, severity, place, report_id, expires_at)
    values ('cleared', r.lat, r.lng, r.severity, r.place, r.id, now());
  end if;
end $$;

grant execute on function public.simulate_reading(text, real, real) to anon;
grant execute on function public.simulate_alert(text, double precision, double precision, real, text) to anon;
grant execute on function public.clear_alert(uuid) to anon;
grant execute on function public.clear_demo_alerts() to anon;
grant execute on function public.alert_history(int) to anon;
grant execute on function public.confirm_report(uuid) to anon;
grant execute on function public.clear_report(uuid) to anon;

-- Readings older than 30 days are not needed for alerts. Delete them now and
-- then (or schedule this with pg_cron): delete from sensor_readings where created_at < now() - interval '30 days';

do $$ begin
  alter publication supabase_realtime add table public.alerts;
exception when duplicate_object then null;
end $$;

-- Demo data -------------------------------------------------------------------
-- Rows made by scripts/seed-demo.mjs. Remove them all with:
--   delete from reports where is_demo;
alter table public.reports add column if not exists is_demo boolean not null default false;

drop function if exists public.report_history(int);
create function public.report_history(hours int default 24)
returns table (
  id uuid, lat double precision, lng double precision, severity smallint, place text,
  observed_at timestamptz, created_at timestamptz, expires_at timestamptz, confirmations int, is_demo boolean
)
language sql stable security definer set search_path = public as $$
  select id, lat, lng, severity, place, observed_at, created_at, expires_at, confirmations, is_demo
    from reports
   where created_at > now() - make_interval(hours => least(greatest(hours, 1), 720))
   order by created_at desc
   limit 1000;
$$;
grant execute on function public.report_history(int) to anon;
