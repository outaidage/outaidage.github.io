-- 012: guestbook pinned — 留言板置顶（数字宇宙门户）。
-- 给 guestbook_entries 增加 pinned 列，管理员可在后台置顶留言。
-- 置顶留言在公开列表中排在最前面。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

alter table public.guestbook_entries
  add column if not exists pinned boolean not null default false;

-- 垃圾过滤底线：留言内容长度上限 500 字（前端同样校验）。
alter table public.guestbook_entries
  add constraint guestbook_message_length check (char_length(message) <= 500);

create index if not exists guestbook_entries_pinned_idx
  on public.guestbook_entries (pinned desc, created_at desc);
