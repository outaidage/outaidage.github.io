-- 008: article_versions — 文章版本历史（3.0 P0）。
-- 每次在后台保存文章（新建或编辑）成功后，写入一条版本快照
-- （完整 Markdown 内容 + 标题 + 版本号 + 保存人 + 时间）。
-- 仅管理员可读写；不公开。恢复版本 = 把旧版本内容载入编辑器再保存，
-- 保存时会产生一条新版本，旧版本永不被覆盖。
-- 执行方式：Supabase Dashboard → SQL Editor → 粘贴本文件 → Run。

create table if not exists public.article_versions (
  id uuid primary key default gen_random_uuid(),
  article_slug text not null,
  title text not null,
  content text not null,
  version_number integer not null,
  created_at timestamptz not null default now(),
  created_by text,
  change_note text,
  constraint article_versions_slug_version_unique unique (article_slug, version_number)
);

alter table public.article_versions enable row level security;

-- 仅管理员可插入与读取版本（通过 admin_allowlist 判定）。
create policy "Admins insert article versions"
  on public.article_versions for insert to authenticated
  with check (public.is_site_admin());

create policy "Admins read article versions"
  on public.article_versions for select to authenticated
  using (public.is_site_admin());

-- 仅管理员可删除版本（一般不删；保留以备清理）。
create policy "Admins delete article versions"
  on public.article_versions for delete to authenticated
  using (public.is_site_admin());

create index if not exists article_versions_slug_idx
  on public.article_versions (article_slug, version_number desc);
