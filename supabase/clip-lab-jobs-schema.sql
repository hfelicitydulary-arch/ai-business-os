-- Run this once in Supabase SQL Editor
create table if not exists clip_lab_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  url text not null,
  transcript text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  source_title text,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists clip_lab_jobs_status_idx on clip_lab_jobs(status);
create index if not exists clip_lab_jobs_user_idx on clip_lab_jobs(user_id);

alter table clip_lab_jobs enable row level security;

create policy "Users read own clip jobs"
  on clip_lab_jobs for select
  using (auth.uid() = user_id);

create policy "Users insert own clip jobs"
  on clip_lab_jobs for insert
  with check (auth.uid() = user_id);
