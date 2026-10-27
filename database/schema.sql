-- Run this file in Supabase SQL Editor for a new project.
create extension if not exists pgcrypto;

create type public.soil_state as enum ('dry', 'normal', 'wet');
create type public.command_kind as enum ('water', 'stop');
create type public.command_status as enum ('queued', 'delivered', 'acknowledged', 'failed', 'expired');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  device_key text not null unique check (device_key ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  bridge_last_seen_at timestamptz,
  serial_connected boolean not null default false,
  firmware_version text,
  bridge_version text,
  last_error text
);

create table public.sensor_readings (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  received_at timestamptz not null default now(),
  sequence_number bigint not null check (sequence_number >= 0),
  device_uptime_ms bigint not null check (device_uptime_ms >= 0),
  moisture_raw smallint not null check (moisture_raw between 0 and 1023),
  moisture_filtered smallint not null check (moisture_filtered between 0 and 1023),
  soil_state public.soil_state not null,
  pump_on boolean not null,
  automation_enabled boolean not null,
  module_verified boolean not null
);

create index sensor_readings_device_time_idx
  on public.sensor_readings (device_id, received_at desc);

create table public.automation_settings (
  device_id uuid primary key references public.devices(id) on delete cascade,
  dry_threshold smallint not null default 950 check (dry_threshold between 21 and 1023),
  wet_threshold smallint not null default 750 check (wet_threshold between 1 and 1002),
  watering_pulse_ms integer not null default 2000 check (watering_pulse_ms between 250 and 10000),
  soaking_interval_seconds integer not null default 300 check (soaking_interval_seconds between 30 and 86400),
  max_runtime_ms integer not null default 10000 check (max_runtime_ms between 250 and 10000),
  dry_confirmations smallint not null default 5 check (dry_confirmations between 2 and 20),
  automation_enabled boolean not null default false,
  pump_active_high boolean not null default true,
  module_verified boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint thresholds_ordered check (wet_threshold + 20 < dry_threshold),
  constraint pulse_within_runtime check (watering_pulse_ms <= max_runtime_ms)
);

create table public.commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  kind public.command_kind not null,
  duration_ms integer check (
    (kind = 'water' and duration_ms between 250 and 10000) or
    (kind = 'stop' and duration_ms is null)
  ),
  status public.command_status not null default 'queued',
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  device_message text,
  unique (device_id, idempotency_key)
);

create index commands_pending_idx on public.commands (device_id, status, created_at);
create index commands_recent_idx on public.commands (device_id, created_at desc);

create table public.watering_events (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.devices(id) on delete cascade,
  command_id uuid references public.commands(id) on delete set null,
  received_at timestamptz not null default now(),
  event text not null check (event in ('watering_started', 'watering_stopped')),
  source text check (source in ('automatic', 'manual')),
  reason text,
  duration_ms integer check (duration_ms between 0 and 10000),
  runtime_ms integer check (runtime_ms between 0 and 11000)
);

create index watering_events_device_time_idx
  on public.watering_events (device_id, received_at desc);

-- Atomically expire stale work and claim at most one queued command.
create or replace function public.claim_next_command(p_device_id uuid)
returns setof public.commands
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commands
  set status = 'expired'
  where device_id = p_device_id and status in ('queued', 'delivered') and expires_at <= now();

  return query
  update public.commands c
  set status = 'delivered', delivered_at = now()
  where c.id = (
    select id from public.commands
    where device_id = p_device_id and status = 'queued' and expires_at > now()
    order by created_at
    for update skip locked
    limit 1
  )
  returning c.*;
end;
$$;

revoke all on function public.claim_next_command(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_command(uuid) to service_role;

alter table public.devices enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.automation_settings enable row level security;
alter table public.commands enable row level security;
alter table public.watering_events enable row level security;

-- No anon/authenticated policies are intentionally created. The browser never talks
-- to Supabase directly. Vercel Functions use the server-only service role and enforce
-- dashboard/bridge authentication. RLS therefore denies direct public access.

insert into public.devices (device_key, display_name)
values ('nano-plant-01', 'Plant Monitor')
on conflict (device_key) do nothing;

insert into public.automation_settings (device_id)
select id from public.devices where device_key = 'nano-plant-01'
on conflict (device_id) do nothing;

