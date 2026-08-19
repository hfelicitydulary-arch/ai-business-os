-- Tracks which trend topics have already had scripts generated,
-- so the same topic doesn't get repeatedly re-scripted across
-- sessions/days — reduces "repetitious content" ban risk and
-- avoids wasted Claude API calls on duplicates.
-- Run in Supabase SQL Editor.

create table if not exists used_trends (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text,
  generated_at timestamptz not null default now()
);

alter table used_trends enable row level security;

create policy "Signed-in users can view used trends"
  on used_trends for select
  using (auth.uid() is not null);

create policy "Signed-in users can log used trends"
  on used_trends for insert
  with check (auth.uid() is not null);

create index if not exists idx_used_trends_title on used_trends (title);
