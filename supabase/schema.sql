-- ============================================
-- 地震预警 · Supabase 建表脚本
-- 可直接在 Supabase Dashboard → SQL Editor 全量执行
-- ============================================

-- 1) 用户设置表
create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  min_shindo numeric not null default 2 check (min_shindo >= 0 and min_shindo <= 7),
  is_hibernating boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) 推送/提醒记录表
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  quake_id text not null,
  type text not null check (type in ('eew', 'quake', 'nightly')),
  title text not null,
  content text not null,
  shindo numeric,
  created_at timestamptz not null default now(),
  -- 防重复：同一用户、同一地震、同一类型只推一次
  constraint alerts_user_quake_type unique (user_id, quake_id, type)
);

create index if not exists alerts_user_created_idx
  on public.alerts (user_id, created_at desc);

-- ============================================
-- 行级安全（RLS）：只允许用户读写自己的数据
-- Edge Function 使用 service_role，不受 RLS 限制
-- ============================================

alter table public.settings enable row level security;
alter table public.alerts enable row level security;

drop policy if exists "settings_select_own" on public.settings;
create policy "settings_select_own"
  on public.settings for select
  using (auth.uid() = user_id);

drop policy if exists "settings_insert_own" on public.settings;
create policy "settings_insert_own"
  on public.settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "settings_update_own" on public.settings;
create policy "settings_update_own"
  on public.settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "settings_delete_own" on public.settings;
create policy "settings_delete_own"
  on public.settings for delete
  using (auth.uid() = user_id);

drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own"
  on public.alerts for select
  using (auth.uid() = user_id);

drop policy if exists "alerts_insert_own" on public.alerts;
create policy "alerts_insert_own"
  on public.alerts for insert
  with check (auth.uid() = user_id);

drop policy if exists "alerts_update_own" on public.alerts;
create policy "alerts_update_own"
  on public.alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "alerts_delete_own" on public.alerts;
create policy "alerts_delete_own"
  on public.alerts for delete
  using (auth.uid() = user_id);

-- 3) 新用户自动创建默认设置（可选，但推荐）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.settings (user_id, min_shindo, is_hibernating)
  values (new.id, 2, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
