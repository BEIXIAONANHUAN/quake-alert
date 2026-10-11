-- ============================================
-- 地震预警 · Supabase 建表脚本（单用户模式）
-- 固定 user_id: 00000000-0000-0000-0000-000000000001
-- 可直接在 Supabase Dashboard → SQL Editor 全量执行
-- ============================================

-- 1) 用户设置表
create table if not exists public.settings (
  user_id uuid primary key,
  min_shindo numeric not null default 2 check (min_shindo >= 0 and min_shindo <= 7),
  is_hibernating boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) 推送/提醒记录表
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quake_id text not null,
  type text not null check (type in ('eew', 'quake', 'nightly', 'test')),
  title text not null,
  content text not null,
  shindo numeric,
  created_at timestamptz not null default now(),
  constraint alerts_user_quake_type unique (user_id, quake_id, type)
);

create index if not exists alerts_user_created_idx
  on public.alerts (user_id, created_at desc);

-- ============================================
-- RLS：允许 anon / authenticated 读写固定用户的行
-- Edge Function 使用 service_role，不受 RLS 限制
-- ============================================

alter table public.settings enable row level security;
alter table public.alerts enable row level security;

drop policy if exists "settings_anon_all" on public.settings;
create policy "settings_anon_all"
  on public.settings for all
  to anon, authenticated
  using (user_id = '00000000-0000-0000-0000-000000000001')
  with check (user_id = '00000000-0000-0000-0000-000000000001');

drop policy if exists "alerts_anon_all" on public.alerts;
create policy "alerts_anon_all"
  on public.alerts for all
  to anon, authenticated
  using (user_id = '00000000-0000-0000-0000-000000000001')
  with check (user_id = '00000000-0000-0000-0000-000000000001');

-- 3) 默认设置
insert into public.settings (user_id, min_shindo, is_hibernating)
values ('00000000-0000-0000-0000-000000000001', 2, false)
on conflict (user_id) do nothing;
