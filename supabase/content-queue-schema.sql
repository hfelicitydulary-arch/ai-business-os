-- Content queue: auto-generated draft scripts waiting for a video
-- to be attached before publishing. Run in Supabase SQL Editor.

create table if not exists content_queue (
  id uuid primary key default gen_random_uuid(),
  trend_title text not null,
  seo_title text not null,
  description text,
  tags text[],
  script text not null,
  format text not null check (format in ('short', 'long')),
  status text not null default 'awaiting_video' check (status in ('awaiting_video', 'published')),
  video_url text,
  published_url text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table content_queue enable row level security;

create policy "Signed-in users can view queue"
  on content_queue for select
  using (auth.uid() is not null);

create policy "Signed-in users can update queue"
  on content_queue for update
  using (auth.uid() is not null);

-- Inserts come from the cron job using the service role key,
-- which bypasses RLS entirely, so no insert policy needed for users.
