create table if not exists public.events_shared (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  event_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_shares (
  id uuid primary key default gen_random_uuid(),
  shared_event_id uuid not null references public.events_shared(id) on delete cascade,
  token text unique not null,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  expires_at timestamptz null
);

alter table public.events_shared enable row level security;
alter table public.event_shares enable row level security;

create policy "Owners can select own shared events"
  on public.events_shared
  for select
  using (auth.uid() = owner_id);

create policy "Owners can insert own shared events"
  on public.events_shared
  for insert
  with check (auth.uid() = owner_id);

create policy "Owners can update own shared events"
  on public.events_shared
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners can delete own shared events"
  on public.events_shared
  for delete
  using (auth.uid() = owner_id);

create policy "Owners can select own share links"
  on public.event_shares
  for select
  using (
    exists (
      select 1
      from public.events_shared shared_event
      where shared_event.id = event_shares.shared_event_id
        and shared_event.owner_id = auth.uid()
    )
  );

create policy "Owners can insert own share links"
  on public.event_shares
  for insert
  with check (
    exists (
      select 1
      from public.events_shared shared_event
      where shared_event.id = event_shares.shared_event_id
        and shared_event.owner_id = auth.uid()
    )
  );

create policy "Owners can update own share links"
  on public.event_shares
  for update
  using (
    exists (
      select 1
      from public.events_shared shared_event
      where shared_event.id = event_shares.shared_event_id
        and shared_event.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events_shared shared_event
      where shared_event.id = event_shares.shared_event_id
        and shared_event.owner_id = auth.uid()
    )
  );

create policy "Owners can delete own share links"
  on public.event_shares
  for delete
  using (
    exists (
      select 1
      from public.events_shared shared_event
      where shared_event.id = event_shares.shared_event_id
        and shared_event.owner_id = auth.uid()
    )
  );

create or replace function public.set_events_shared_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_events_shared_updated_at on public.events_shared;

create trigger set_events_shared_updated_at
before update on public.events_shared
for each row
execute function public.set_events_shared_updated_at();

create or replace function public.get_shared_event_by_token(p_token text)
returns table (
  shared_event_id uuid,
  event_data jsonb,
  permission text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    shared_event.id as shared_event_id,
    shared_event.event_data,
    share.permission,
    share.expires_at
  from public.event_shares share
  join public.events_shared shared_event on shared_event.id = share.shared_event_id
  where share.token = p_token
    and (share.expires_at is null or share.expires_at > now())
  limit 1;
$$;

grant execute on function public.get_shared_event_by_token(text) to anon, authenticated;
