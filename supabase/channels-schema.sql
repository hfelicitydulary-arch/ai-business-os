-- ============================================
-- Multi-channel YouTube support for AI-BOS.
-- Run this in Supabase SQL Editor.
-- ============================================

create table if not exists youtube_channels (
  id uuid primary key default gen_random_uuid(),
  channel_name text not null,
  refresh_token text not null,
  connected_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table youtube_channels enable row level security;

-- Shared household model: any signed-in user can see and manage
-- all connected channels, not just their own.
create policy "Signed-in users can view all channels"
  on youtube_channels for select
  using (auth.uid() is not null);

create policy "Signed-in users can add channels"
  on youtube_channels for insert
  with check (auth.uid() is not null);

create policy "Signed-in users can remove channels"
  on youtube_channels for delete
  using (auth.uid() is not null);
