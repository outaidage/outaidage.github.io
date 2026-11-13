# OUTAI Personal Space

Dark minimalist personal website: Astro + GitHub Pages + Supabase.

## Features in this starter

- Responsive dark personal homepage
- Markdown/MDX-style blog content stored in Git
- Blog listing and article pages
- Public bookmark listing with search and category filter
- Admin login via Supabase Auth
- Admin bookmark create/delete with public/private visibility
- Secure Edge Function scaffold for publishing Markdown to GitHub
- GitHub Actions deployment to GitHub Pages
- SQL schema with Row Level Security (RLS)
- Basic project/about/now pages

> This is a runnable starter project, not a fully provisioned hosted service. You must create the GitHub repository and Supabase project, apply the SQL, configure secrets, and deploy the Edge Function before remote admin publishing works.

## 1. Create the GitHub repository

Recommended repository name: `YOUR_GITHUB_USERNAME.github.io`.

For a user/organization site, the URL is:
`https://YOUR_GITHUB_USERNAME.github.io/`

If you use a normal repository instead, configure `BASE_PATH` to `/<repository-name>` in the GitHub Actions variables/environment and verify the deployed asset paths.

Enable GitHub Pages:
- Repository → Settings → Pages
- Build and deployment → Source: GitHub Actions

## 2. Run locally

Requirements: Node.js 22 LTS or newer and npm.

```bash
cp .env.example .env
npm install
npm run dev
```

Edit `.env` and set:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SITE_URL`
- `BASE_PATH=/`

For Windows PowerShell, copy the file with:
```powershell
Copy-Item .env.example .env
```

## 3. Configure Supabase

1. Create a Supabase project.
2. Open SQL Editor and run all of `supabase/schema.sql`.
3. Authentication → Providers: keep Email enabled.
4. Disable public sign-ups. Create your own admin user manually in Authentication → Users.
5. Copy that user's UUID.
6. Run:
```sql
insert into public.admin_allowlist(user_id)
values ('YOUR_AUTH_USER_UUID');
```
7. In project settings/API, copy Project URL and anon/publishable key into `.env`.
8. In GitHub repository → Settings → Secrets and variables → Actions → Variables, add:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`

Do not use the Supabase service-role key in browser code.

## 4. Deploy the GitHub content Edge Function

Install Supabase CLI, log in, link the project, then deploy:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy github-content
```

Set function secrets (use a fine-grained GitHub token restricted to this one repository, with Contents: Read and write):

```bash
supabase secrets set GITHUB_TOKEN=YOUR_FINE_GRAINED_TOKEN
supabase secrets set GITHUB_OWNER=YOUR_GITHUB_USERNAME
supabase secrets set GITHUB_REPO=YOUR_GITHUB_USERNAME.github.io
supabase secrets set GITHUB_BRANCH=main
```

The function verifies the Supabase user and checks `admin_allowlist` before writing. The token stays in Supabase, never in the browser.

For production hardening:
- Replace `Access-Control-Allow-Origin: *` with your exact Pages origin.
- Consider adding rate limiting and audit logging.
- Keep the token fine-grained and rotate it if exposed.
- Restrict GitHub token permissions to Contents: Read and write for this repository only.

## 5. Deploy

Push the project to `main`. GitHub Actions installs dependencies, builds Astro and deploys `dist/` to Pages.

```bash
git init
git add .
git commit -m "Initial OUTAI website"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_GITHUB_USERNAME.github.io.git
git push -u origin main
```

If `npm ci` reports that `package-lock.json` is missing, run `npm install` locally and commit the generated `package-lock.json`.

## 6. Write articles locally

Create a Markdown file in `src/content/blog/`, for example `my-note.md`:

```md
---
title: "文章标题"
description: "文章简介"
pubDate: 2026-11-14
category: "AI & Technology"
tags: ["AI", "工具"]
draft: false
---

## 正文

这里写 Markdown。
```

Commit and push to publish. Set `draft: true` to hide an article from the public site.

## 7. Manage bookmarks

Open `/admin/`, sign in with the admin user, then add bookmarks. Set “公开书签” off for private entries. Public users can only read rows where `is_public = true` and `status = active`; admin-only writes are controlled by RLS and the allowlist.

The first release currently supports bookmark title, URL, description, note, category, visibility, favorite flag and deletion. Tag assignment, bulk import/export and bookmarklet are planned extensions.

## 8. Import Raindrop exports

Use the Raindrop export feature to download HTML or CSV. Before importing into production:
- Keep an untouched backup of the export.
- Normalize URLs (remove tracking parameters only when safe).
- Deduplicate by normalized URL.
- Map original collections to `category`.
- Preserve tags and descriptions.
- Review a preview before inserting.

The import UI is intentionally not enabled in this starter yet; do not assume the schema has imported your old collection.

## 9. Known first-version limitations

- Search page is a placeholder; bookmark search is active. Add Pagefind for full-text article search.
- The admin article editor writes Markdown to GitHub through the Edge Function. After commit, GitHub Actions builds and publishes it.
- Markdown local editing remains supported and is the simplest fallback.
- The bookmark UI currently reads from the public view; admin sees all bookmarks through the protected table.
- Favicon auto-fetch, bookmark tags editor, import/export UI, preview, image upload and analytics are not yet implemented.
- GitHub Pages is static hosting; never attempt to store GitHub write credentials in frontend environment variables.

## 10. Suggested next milestones

1. Verify deployment and Supabase login.
2. Add Raindrop HTML/CSV import preview and deduplication.
3. Add tag management and bookmark editing.
4. Add Pagefind search and RSS.
5. Add article preview and safe slug collision handling.
6. Add automated metadata/favicon retrieval via a server-side function.
