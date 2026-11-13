-- P0-4: prevent duplicate bookmark URLs at the database layer.
-- Run in Supabase SQL Editor. Safe to re-run (if not exists).
-- The bookmarks table is empty at the time of this migration, so no
-- existing duplicates can block the index.
create unique index if not exists bookmarks_url_unique on public.bookmarks (url);
