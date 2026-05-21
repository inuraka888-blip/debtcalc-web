alter table if exists public.events_shared
add column if not exists version integer not null default 1;

alter table if exists public.events_shared
add column if not exists updated_at timestamptz not null default now();

alter table if exists public.events_shared replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.events_shared;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;

-- If a newer Supabase project uses the `shared_events` name, keep the same
-- realtime blob contract there as well.
alter table if exists public.shared_events
add column if not exists version integer not null default 1;

alter table if exists public.shared_events
add column if not exists updated_at timestamptz not null default now();

alter table if exists public.shared_events replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.shared_events;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;
