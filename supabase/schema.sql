-- TDLST 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행한다.

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 500),
  notes        text,
  due_at       timestamptz,
  is_all_day   boolean not null default true,
  category     text not null default 'academic' check (category in ('academic','other')),
  repeat       text not null default 'none'     check (repeat in ('none','daily','weekly','monthly')),
  completed_at timestamptz,
  remind_at    timestamptz,                       -- 알림 미구현. 컬럼만 확보.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- 사이드 리스트는 항상 '삭제되지 않은 내 것'을 마감일 순으로 읽는다
create index if not exists tasks_user_due_idx
  on public.tasks (user_id, due_at)
  where deleted_at is null;

create index if not exists tasks_user_updated_idx
  on public.tasks (user_id, updated_at desc);

-- ── updated_at 자동 갱신 ──────────────────────────────────
-- 오프라인 큐가 last-write-wins로 병합하므로 서버 시각이 신뢰 기준이다.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ── 행 수준 보안 ──────────────────────────────────────────
alter table public.tasks enable row level security;

drop policy if exists "own rows: select" on public.tasks;
create policy "own rows: select" on public.tasks
  for select using (auth.uid() = user_id);

drop policy if exists "own rows: insert" on public.tasks;
create policy "own rows: insert" on public.tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "own rows: update" on public.tasks;
create policy "own rows: update" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows: delete" on public.tasks;
create policy "own rows: delete" on public.tasks
  for delete using (auth.uid() = user_id);

-- ── Realtime ──────────────────────────────────────────────
-- PC와 폰이 같은 변경을 즉시 받아보게 한다.
alter table public.tasks replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
