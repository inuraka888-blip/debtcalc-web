create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_event_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, local_event_id)
);

create table if not exists public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.participants (
  id text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.participant_groups (
  id text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.participant_group_members (
  participant_group_id text not null references public.participant_groups(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  primary key (participant_group_id, participant_id)
);

create table if not exists public.expenses (
  id text primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  amount_cents integer not null check (amount_cents > 0),
  category_id text null,
  note text null,
  split_mode text not null check (split_mode in ('equal', 'custom')),
  date text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_paid_by_splits (
  expense_id text not null references public.expenses(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  event_id uuid not null references public.events(id) on delete cascade,
  primary key (expense_id, participant_id)
);

create table if not exists public.expense_splits (
  expense_id text not null references public.expenses(id) on delete cascade,
  participant_id text not null references public.participants(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  event_id uuid not null references public.events(id) on delete cascade,
  primary key (expense_id, participant_id)
);

alter table public.events_shared
  add column if not exists remote_event_id uuid references public.events(id) on delete set null;

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.participants enable row level security;
alter table public.participant_groups enable row level security;
alter table public.participant_group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_paid_by_splits enable row level security;
alter table public.expense_splits enable row level security;

create or replace function public.current_event_permission(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.events event
      where event.id = p_event_id and event.owner_id = auth.uid()
    ) then 'owner'
    else (
      select member.permission
      from public.event_members member
      where member.event_id = p_event_id and member.user_id = auth.uid()
      limit 1
    )
  end;
$$;

create or replace function public.can_read_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_event_permission(p_event_id) in ('owner', 'editor', 'viewer');
$$;

create or replace function public.can_edit_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_event_permission(p_event_id) in ('owner', 'editor');
$$;

create policy "Members can select events"
  on public.events
  for select
  using (public.can_read_event(id));

create policy "Authenticated users can create events"
  on public.events
  for insert
  with check (auth.uid() = owner_id);

create policy "Owners and editors can update events"
  on public.events
  for update
  using (public.can_edit_event(id))
  with check (public.can_edit_event(id));

create policy "Owners can delete events"
  on public.events
  for delete
  using (auth.uid() = owner_id);

create policy "Members can select event members"
  on public.event_members
  for select
  using (public.can_read_event(event_id));

create policy "Owners can insert event members"
  on public.event_members
  for insert
  with check (public.current_event_permission(event_id) = 'owner');

create policy "Owners can update event members"
  on public.event_members
  for update
  using (public.current_event_permission(event_id) = 'owner')
  with check (public.current_event_permission(event_id) = 'owner');

create policy "Owners can delete event members"
  on public.event_members
  for delete
  using (public.current_event_permission(event_id) = 'owner');

create policy "Members can select participants"
  on public.participants
  for select
  using (public.can_read_event(event_id));

create policy "Editors can insert participants"
  on public.participants
  for insert
  with check (public.can_edit_event(event_id));

create policy "Editors can update participants"
  on public.participants
  for update
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

create policy "Editors can delete participants"
  on public.participants
  for delete
  using (public.can_edit_event(event_id));

create policy "Members can select participant groups"
  on public.participant_groups
  for select
  using (public.can_read_event(event_id));

create policy "Editors can insert participant groups"
  on public.participant_groups
  for insert
  with check (public.can_edit_event(event_id));

create policy "Editors can update participant groups"
  on public.participant_groups
  for update
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

create policy "Editors can delete participant groups"
  on public.participant_groups
  for delete
  using (public.can_edit_event(event_id));

create policy "Members can select participant group members"
  on public.participant_group_members
  for select
  using (public.can_read_event(event_id));

create policy "Editors can insert participant group members"
  on public.participant_group_members
  for insert
  with check (public.can_edit_event(event_id));

create policy "Editors can delete participant group members"
  on public.participant_group_members
  for delete
  using (public.can_edit_event(event_id));

create policy "Members can select expenses"
  on public.expenses
  for select
  using (public.can_read_event(event_id));

create policy "Editors can insert expenses"
  on public.expenses
  for insert
  with check (public.can_edit_event(event_id));

create policy "Editors can update expenses"
  on public.expenses
  for update
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

create policy "Editors can delete expenses"
  on public.expenses
  for delete
  using (public.can_edit_event(event_id));

create policy "Members can select paid by splits"
  on public.expense_paid_by_splits
  for select
  using (public.can_read_event(event_id));

create policy "Editors can insert paid by splits"
  on public.expense_paid_by_splits
  for insert
  with check (public.can_edit_event(event_id));

create policy "Editors can update paid by splits"
  on public.expense_paid_by_splits
  for update
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

create policy "Editors can delete paid by splits"
  on public.expense_paid_by_splits
  for delete
  using (public.can_edit_event(event_id));

create policy "Members can select expense splits"
  on public.expense_splits
  for select
  using (public.can_read_event(event_id));

create policy "Editors can insert expense splits"
  on public.expense_splits
  for insert
  with check (public.can_edit_event(event_id));

create policy "Editors can update expense splits"
  on public.expense_splits
  for update
  using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));

create policy "Editors can delete expense splits"
  on public.expense_splits
  for delete
  using (public.can_edit_event(event_id));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row
execute function public.set_updated_at();

drop trigger if exists set_participants_updated_at on public.participants;
create trigger set_participants_updated_at
before update on public.participants
for each row
execute function public.set_updated_at();

drop trigger if exists set_participant_groups_updated_at on public.participant_groups;
create trigger set_participant_groups_updated_at
before update on public.participant_groups
for each row
execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

drop function if exists public.get_shared_event_by_token(text);

create or replace function public.get_shared_event_by_token(p_token text)
returns table (
  shared_event_id uuid,
  remote_event_id uuid,
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
    shared_event.remote_event_id,
    shared_event.event_data,
    share.permission,
    share.expires_at
  from public.event_shares share
  join public.events_shared shared_event on shared_event.id = share.shared_event_id
  where share.token = p_token
    and (share.expires_at is null or share.expires_at > now())
  limit 1;
$$;

create or replace function public.accept_event_share(p_token text)
returns table (
  remote_event_id uuid,
  permission text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remote_event_id uuid;
  v_permission text;
begin
  if auth.uid() is null then
    raise exception 'User is not authenticated.';
  end if;

  select shared_event.remote_event_id, share.permission
    into v_remote_event_id, v_permission
  from public.event_shares share
  join public.events_shared shared_event on shared_event.id = share.shared_event_id
  where share.token = p_token
    and shared_event.remote_event_id is not null
    and (share.expires_at is null or share.expires_at > now())
  limit 1;

  if v_remote_event_id is null then
    raise exception 'Share link is invalid or expired.';
  end if;

  insert into public.event_members (event_id, user_id, permission)
  values (
    v_remote_event_id,
    auth.uid(),
    case when v_permission = 'edit' then 'editor' else 'viewer' end
  )
  on conflict (event_id, user_id)
  do update set permission = excluded.permission;

  return query select
    v_remote_event_id,
    case when v_permission = 'edit' then 'editor' else 'viewer' end;
end;
$$;

grant execute on function public.accept_event_share(text) to authenticated;

alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.participant_groups;
alter publication supabase_realtime add table public.participant_group_members;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.expense_paid_by_splits;
alter publication supabase_realtime add table public.expense_splits;
