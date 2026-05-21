-- Production alignment for normalized shared events.
-- Existing projects from earlier DebtCalc stages may already have these tables
-- with legacy-compatible text IDs. This migration adds production columns and
-- policies without dropping data.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events add column if not exists name text;
alter table public.events add column if not exists title text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'title'
  ) then
    execute 'update public.events set name = coalesce(name, title) where name is null';
  end if;
end $$;
alter table public.events alter column name set not null;
update public.events set title = name where title is null;
alter table public.events alter column title set not null;

create table if not exists public.event_members (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_members add column if not exists role text not null default 'viewer';
alter table public.event_members add column if not exists permission text not null default 'viewer';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_members' and column_name = 'permission'
  ) then
    execute 'update public.event_members set role = permission where role = ''viewer'' and permission in (''owner'', ''editor'', ''viewer'')';
  end if;
end $$;
alter table public.event_members drop constraint if exists event_members_role_check;
alter table public.event_members add constraint event_members_role_check check (role in ('owner', 'editor', 'viewer'));
update public.event_members set permission = role where permission is null or permission not in ('owner', 'editor', 'viewer');

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.participants add column if not exists created_at timestamptz not null default now();

create table if not exists public.participant_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.participant_groups add column if not exists created_at timestamptz not null default now();

create table if not exists public.participant_group_members (
  participant_group_id uuid references public.participant_groups(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  primary key (participant_group_id, participant_id)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  title text not null,
  amount_cents integer not null,
  category_id uuid null,
  note text null,
  split_mode text not null,
  expense_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses add column if not exists expense_date date;
alter table public.expenses add column if not exists date text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'date'
  ) then
    execute 'update public.expenses set expense_date = date::date where expense_date is null and date is not null';
  end if;
end $$;
alter table public.expenses alter column expense_date set not null;
update public.expenses set date = expense_date::text where date is null;
alter table public.expenses alter column date set not null;
alter table public.expenses add column if not exists created_at timestamptz not null default now();

create table if not exists public.expense_paid_by_splits (
  expense_id uuid references public.expenses(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  amount_cents integer not null,
  primary key (expense_id, participant_id)
);

create table if not exists public.expense_splits (
  expense_id uuid references public.expenses(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  amount_cents integer not null,
  primary key (expense_id, participant_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.participants enable row level security;
alter table public.participant_groups enable row level security;
alter table public.participant_group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_paid_by_splits enable row level security;
alter table public.expense_splits enable row level security;
alter table public.categories enable row level security;

create or replace function public.current_event_role(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.events event where event.id = p_event_id and event.owner_id = auth.uid()) then 'owner'
    else (
      select member.role
      from public.event_members member
      where member.event_id = p_event_id and member.user_id = auth.uid()
      limit 1
    )
  end;
$$;

create or replace function public.current_event_permission(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.current_event_role(p_event_id);
$$;

create or replace function public.can_read_cloud_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_event_role(p_event_id) in ('owner', 'editor', 'viewer');
$$;

create or replace function public.can_edit_cloud_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_event_role(p_event_id) in ('owner', 'editor');
$$;

drop policy if exists "Cloud members can select categories" on public.categories;
create policy "Cloud owners can select categories"
on public.categories for select
using (auth.uid() = owner_id);

drop policy if exists "Cloud owners can insert categories" on public.categories;
create policy "Cloud owners can insert categories"
on public.categories for insert
with check (auth.uid() = owner_id);

drop policy if exists "Cloud owners can update categories" on public.categories;
create policy "Cloud owners can update categories"
on public.categories for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Cloud owners can delete categories" on public.categories;
create policy "Cloud owners can delete categories"
on public.categories for delete
using (auth.uid() = owner_id);

drop policy if exists "Cloud members can select events" on public.events;
create policy "Cloud members can select events"
on public.events for select
using (public.can_read_cloud_event(id));

drop policy if exists "Cloud users can create events" on public.events;
create policy "Cloud users can create events"
on public.events for insert
with check (auth.uid() = owner_id);

drop policy if exists "Cloud editors can update events" on public.events;
create policy "Cloud editors can update events"
on public.events for update
using (public.can_edit_cloud_event(id))
with check (public.can_edit_cloud_event(id));

drop policy if exists "Cloud owners can delete events" on public.events;
create policy "Cloud owners can delete events"
on public.events for delete
using (auth.uid() = owner_id);

drop policy if exists "Cloud members can select event members" on public.event_members;
create policy "Cloud members can select event members"
on public.event_members for select
using (public.can_read_cloud_event(event_id));

drop policy if exists "Cloud owners can insert event members" on public.event_members;
create policy "Cloud owners can insert event members"
on public.event_members for insert
with check (public.current_event_role(event_id) = 'owner');

drop policy if exists "Cloud owners can update event members" on public.event_members;
create policy "Cloud owners can update event members"
on public.event_members for update
using (public.current_event_role(event_id) = 'owner')
with check (public.current_event_role(event_id) = 'owner');

drop policy if exists "Cloud owners can delete event members" on public.event_members;
create policy "Cloud owners can delete event members"
on public.event_members for delete
using (public.current_event_role(event_id) = 'owner');

drop policy if exists "Cloud members can select participants" on public.participants;
create policy "Cloud members can select participants"
on public.participants for select
using (public.can_read_cloud_event(event_id));

drop policy if exists "Cloud editors can write participants" on public.participants;
create policy "Cloud editors can write participants"
on public.participants for all
using (public.can_edit_cloud_event(event_id))
with check (public.can_edit_cloud_event(event_id));

drop policy if exists "Cloud members can select participant groups" on public.participant_groups;
create policy "Cloud members can select participant groups"
on public.participant_groups for select
using (public.can_read_cloud_event(event_id));

drop policy if exists "Cloud editors can write participant groups" on public.participant_groups;
create policy "Cloud editors can write participant groups"
on public.participant_groups for all
using (public.can_edit_cloud_event(event_id))
with check (public.can_edit_cloud_event(event_id));

drop policy if exists "Cloud members can select participant group members" on public.participant_group_members;
create policy "Cloud members can select participant group members"
on public.participant_group_members for select
using (
  exists (
    select 1 from public.participant_groups group_row
    where group_row.id = participant_group_id
      and public.can_read_cloud_event(group_row.event_id)
  )
);

drop policy if exists "Cloud editors can write participant group members" on public.participant_group_members;
create policy "Cloud editors can write participant group members"
on public.participant_group_members for all
using (
  exists (
    select 1 from public.participant_groups group_row
    where group_row.id = participant_group_id
      and public.can_edit_cloud_event(group_row.event_id)
  )
)
with check (
  exists (
    select 1 from public.participant_groups group_row
    where group_row.id = participant_group_id
      and public.can_edit_cloud_event(group_row.event_id)
  )
);

drop policy if exists "Cloud members can select expenses" on public.expenses;
create policy "Cloud members can select expenses"
on public.expenses for select
using (public.can_read_cloud_event(event_id));

drop policy if exists "Cloud editors can write expenses" on public.expenses;
create policy "Cloud editors can write expenses"
on public.expenses for all
using (public.can_edit_cloud_event(event_id))
with check (public.can_edit_cloud_event(event_id));

drop policy if exists "Cloud members can select paid by splits" on public.expense_paid_by_splits;
create policy "Cloud members can select paid by splits"
on public.expense_paid_by_splits for select
using (
  exists (
    select 1 from public.expenses expense
    where expense.id = expense_id
      and public.can_read_cloud_event(expense.event_id)
  )
);

drop policy if exists "Cloud editors can write paid by splits" on public.expense_paid_by_splits;
create policy "Cloud editors can write paid by splits"
on public.expense_paid_by_splits for all
using (
  exists (
    select 1 from public.expenses expense
    where expense.id = expense_id
      and public.can_edit_cloud_event(expense.event_id)
  )
)
with check (
  exists (
    select 1 from public.expenses expense
    where expense.id = expense_id
      and public.can_edit_cloud_event(expense.event_id)
  )
);

drop policy if exists "Cloud members can select expense splits" on public.expense_splits;
create policy "Cloud members can select expense splits"
on public.expense_splits for select
using (
  exists (
    select 1 from public.expenses expense
    where expense.id = expense_id
      and public.can_read_cloud_event(expense.event_id)
  )
);

drop policy if exists "Cloud editors can write expense splits" on public.expense_splits;
create policy "Cloud editors can write expense splits"
on public.expense_splits for all
using (
  exists (
    select 1 from public.expenses expense
    where expense.id = expense_id
      and public.can_edit_cloud_event(expense.event_id)
  )
)
with check (
  exists (
    select 1 from public.expenses expense
    where expense.id = expense_id
      and public.can_edit_cloud_event(expense.event_id)
  )
);

do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.participants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.participant_groups;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.participant_group_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.expenses;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.expense_paid_by_splits;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.expense_splits;
exception when duplicate_object then null;
end $$;
