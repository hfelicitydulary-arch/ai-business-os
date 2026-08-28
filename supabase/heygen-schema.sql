-- Adds HeyGen video generation tracking to the content queue.
-- Run in Supabase SQL Editor.

alter table content_queue add column if not exists heygen_video_id text;
alter table content_queue add column if not exists video_status text default 'idle' check (video_status in ('idle', 'rendering', 'completed', 'failed'));
