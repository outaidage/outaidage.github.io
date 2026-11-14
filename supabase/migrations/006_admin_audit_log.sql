-- 3.0 P0: admin audit log. Records who did what and when (logins, publishes,
-- deletes, imports, exports). Admin-only read/insert; no public access.
-- Applied live via the Supabase SQL editor 2026-11-14.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text,
  action text not null,
  target_type text,
  target_label text,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create policy "Admins insert audit log"
  on public.admin_audit_log for insert to authenticated
  with check (public.is_site_admin());

create policy "Admins read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.is_site_admin());

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
