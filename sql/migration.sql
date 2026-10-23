-- Appointments table: scheduled_at holds the exact moment a slot is booked
-- for. The partial unique index (not a table-wide RLS policy, not an
-- application-level check) is what actually prevents a double-booking --
-- Postgres enforces it atomically against every concurrent writer.

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

-- "where scheduled_at is not null" keeps this a PARTIAL index: many rows
-- can share a null scheduled_at (e.g. draft/unscheduled rows), but once a
-- real slot is set, it can never collide with another row's slot.
create unique index if not exists appointments_scheduled_at_uq
  on public.appointments (scheduled_at)
  where scheduled_at is not null;
