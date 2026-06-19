create table if not exists public.delivery_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('sales', 'expense')),
  date date not null,
  amount integer not null check (amount >= 0),
  platform text not null default 'Uber Eats',
  area text not null default '',
  start_time time,
  end_time time,
  deliveries integer not null default 0 check (deliveries >= 0),
  work_hours numeric not null default 0 check (work_hours >= 0),
  category text not null,
  memo text not null default '',
  tax_category text not null default '未分類',
  deduction_hint text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.delivery_records
add column if not exists work_hours numeric not null default 0 check (work_hours >= 0);

alter table public.delivery_records
add column if not exists platform text not null default 'Uber Eats';

alter table public.delivery_records
add column if not exists area text not null default '';

alter table public.delivery_records
add column if not exists start_time time;

alter table public.delivery_records
add column if not exists end_time time;

alter table public.delivery_records enable row level security;

drop policy if exists "Users can read own delivery records" on public.delivery_records;
create policy "Users can read own delivery records"
on public.delivery_records for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own delivery records" on public.delivery_records;
create policy "Users can insert own delivery records"
on public.delivery_records for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own delivery records" on public.delivery_records;
create policy "Users can update own delivery records"
on public.delivery_records for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own delivery records" on public.delivery_records;
create policy "Users can delete own delivery records"
on public.delivery_records for delete
using (auth.uid() = user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_goal integer not null default 0 check (monthly_goal >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Users can read own settings" on public.user_settings;
create policy "Users can read own settings"
on public.user_settings for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own settings" on public.user_settings;
create policy "Users can insert own settings"
on public.user_settings for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings"
on public.user_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
