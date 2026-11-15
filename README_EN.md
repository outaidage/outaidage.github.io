# OUTAI · Personal Digital Universe

**中文** | [English](./README_EN.md)

> A personal digital space running on Astro + Supabase: write articles, save bookmarks, manage projects, leave messages — and the homepage is a solar system you can click.

🌐 **Live site: <https://outaidage.xyz/>**

---

## ✨ Features

| Module | What it does |
| --- | --- |
| 🏠 Home | A real 3D solar system (Three.js + React Three Fiber): the Sun is the only main light, 8 planets orbit it; click a planet to focus, click again to open its page; also galaxy, Earth, and navigation views |
| 🎬 Cinematic intro | Deep-space flight → past Jupiter and Saturn's rings → the energy core lights up the OUTAI wordmark → seamless push into the main scene; skippable, replayable, can be turned off forever |
| 📝 Articles | Markdown articles (`/blog/`) with covers, categories, tags, table of contents, prev/next, comments; publish visually from the admin, each save commits to GitHub |
| 🔖 Bookmarks | Saved links (`/collection/`) with categories + tags + search, Raindrop import/export; public bookmarks show live on the homepage |
| 🪐 Background Studio | Dynamic homepage backgrounds: Cloudflare R2 uploads, URL imports, GitHub playlist sync, timed rotation, likes & favorites; controlled by the ◐ radial wheel at bottom-right |
| 🧰 Toolbox | JSON formatter, Base64 encoder/decoder, character counter (`/toolbox/`) |
| 💬 Guestbook / Comments | Pinned messages, 500-word limit, spam filter, 60s rate limit; article comments need admin approval |
| 📰 Subscribe | Buttondown email subscribe; RSS / Sitemap / Pagefind full-site search |
| 🔐 Admin | Articles, bookmarks, projects, changelog, page content, toolbox, Hero, 3D universe, background library — all managed visually; permissions are enforced server-side by Supabase RLS + Edge Functions |

---

## 🛠️ Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Astro 5 (static generation + Islands) + React 18 |
| Styling | Tailwind CSS 3 + custom CSS |
| 3D | Three.js + @react-three/fiber + @react-three/drei + GSAP |
| Data | Supabase (Postgres + Auth + Realtime + Edge Functions, Deno) |
| Search | Pagefind (index generated at build time) |
| Background storage | Cloudflare R2 (S3-compatible) |
| Newsletter | Buttondown |
| Deploy | GitHub Actions → GitHub Pages (custom domain) |

---

## 🏗️ Architecture & How It Works

```
Browser ──► GitHub Pages (static site, Astro build output)
   │         ▲ Rebuilt 3× daily at 10:00 / 15:00 / 22:00 JST; push = deploy
   │         │
   ├─ Read ──► Supabase (public reads: article metadata, bookmarks, projects,
   │                      changelog, Hero, universe config…)
   │
   └─ Write ──► Supabase Edge Function (checks JWT + admin_allowlist)
               ├─ github-content: commits Markdown to GitHub (article publishing)
               ├─ trigger-deploy: triggers a GitHub Actions rebuild
               │   (static content goes live ~2 min after saving)
               ├─ r2-upload-sign: issues presigned URLs for R2 uploads
               └─ background-sync / background-url-check: background
                  playlist sync and URL validation
```

**Key design decisions:**

- **Static + runtime mix**: Articles, Hero, and page content are fetched at build time (edits need a deploy, auto-triggered on save); bookmarks, projects, changelog, and universe config are fetched at runtime (edits take effect immediately). Homepage bookmarks use "build-time initial value + refetch on page open" — fast and live.
- **Permissions are not in the frontend**: Hiding an admin button is not security. Real permissions live in Supabase RLS (`is_site_admin()` checks `admin_allowlist`) and Edge Function JWT checks; the frontend only decides what to show.
- **One WebGL scene for all 3D**: The whole solar system is a single scene (`SpaceCore`) — intro flight, planets, galaxy, and nebulae all in one Canvas, the camera flying along a Bézier curve, so there is no "two scenes switching" jolt. Mobile gets automatic quality reduction (fewer stars, DPR capped at 1.5).
- **Motion and background are decoupled**: The in-site "motion" toggle only controls motion (title animation, 3D rotation, intro); the "background" toggle only controls the video background. Neither follows the OS reduced-motion setting — the user's in-site choice wins.
- **No fake data**: Every number (article count, bookmark count, category count) reads real data; if there is none, it shows 0 — nothing is invented.

---

## 📁 Project Structure

```
src/
├── pages/                 # Routes: index (home), blog/[...slug], collection, projects,
│                          #   guestbook, links, changelog, toolbox, about, now, contact…
├── components/            # React islands: SpaceCore (3D), BackgroundControls (radial wheel),
│   ├── background/        #   VideoSceneManager (background player), AdminApp (admin), HeroAdmin…
│   └── *.astro            #   HeroText (char-by-char animation), OutaiLogo,
│                          #   CommandTerminal (⌘K terminal)
├── lib/                   # hero-content, planets, universe-config, background-player…
├── content/blog/          # Markdown articles (managed in Git)
├── styles/                # global.css, video-background.css
└── content.config.ts      # Astro content collection definitions
supabase/
├── schema.sql             # Full schema (use this to build a database from scratch)
├── migrations/001–020     # Incremental migrations (run in order in the SQL Editor
│                          #   to upgrade an existing database)
└── functions/             # Edge Functions (github-content, trigger-deploy, r2-upload-sign…)
.github/workflows/
├── deploy.yml             # Push to main deploys; 3 scheduled rebuilds per day
└── background-sync.yml    # Syncs the background playlist every 6 hours
```

---

## 🚀 Quick Start (for anyone who wants to reference / reuse this project)

### Requirements

- Node.js 22 LTS + npm
- A GitHub account and repository (recommended: `<username>.github.io`)
- A Supabase project (free tier is enough)

### 1. Run locally

```bash
git clone https://github.com/outaidage/outaidage.github.io.git
cd outaidage.github.io
cp .env.example .env   # fill in the two values below
npm install
npm run dev            # http://localhost:4321
```

`.env` needs just two public values (readable in the frontend, no secrets):

```bash
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your anon public key
```

### 2. Create the Supabase tables

In the Supabase Dashboard → SQL Editor, run:

1. `supabase/schema.sql` (full schema with RLS and seed data), or
2. `supabase/migrations/001–020` in order (to upgrade an existing database)

Then in **Authentication → Sign-in providers** turn **public sign-ups OFF**, and in **Table Editor → admin_allowlist** add a row with your own `user_id` (UUID) — only that row can enter the admin.

### 3. Set up Edge Functions (needed for article publishing / auto-deploy / R2 uploads)

In the Supabase Dashboard → Edge Functions, deploy each of `supabase/functions/*` (paste the code via the editor), and set these **Secrets**:

| Secret | What it is |
| --- | --- |
| `GITHUB_TOKEN` | GitHub fine-grained token (this repo only, Contents read/write + Actions read/write) |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` | Repo owner / name / branch (main) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | R2 (for background uploads; skip if you don't use it) |
| `SYNC_TRIGGER_SECRET` | Trigger secret for background playlist sync (random string; set the same value as a GitHub Actions Secret) |

> ⚠️ Secrets go only in Supabase Secrets and GitHub Secrets. **Never put them in code or commit them in `.env`.**

### 4. Set up GitHub Actions

Repo → Settings → Secrets and variables:

- **Variables**: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`
- **Secrets** (for background sync): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SYNC_TRIGGER_SECRET`

Then go to Settings → Pages → Source and pick **GitHub Actions**. Every push to `main` now builds and deploys automatically; scheduled rebuilds at 10:00 / 15:00 / 22:00 JST also pick up scheduled posts and admin edits.

### 5. Custom domain (optional)

Add a `CNAME` DNS record pointing to `<username>.github.io`, put a `public/CNAME` file in the repo with your domain, fill in the domain in Pages, and wait for the certificate. **Don't touch any other DNS records.**

---

## 🔑 Pitfalls we hit (so you don't have to)

- **Astro's build does not type-check**: esbuild only transpiles, so a missing import like `useThree` still builds and only throws `ReferenceError` in production. After adding a new import / Hook, always run `npx tsc --noEmit`.
- **`client:visible` never hydrates a component that renders null**: islands that should appear on first paint (like the 3D core) need `client:load` or `client:idle`.
- **GitHub API can't push large files / binaries / workflows**: the `contents` API caps a single file at ~128KB, can't push binaries, and returns 403 for `.github/workflows/*`. Large, binary, and workflow files go through the web UI upload; only small text files go through the API.
- **A new `@/lib/*` module may not get bundled**: after a React island imports a new module, grep the dist bundle for the module's characteristic strings to confirm it was actually inlined.
- **Test browsers remember login state**: their localStorage / sessionStorage persist across sessions, so testing storage-dependent features (intro, pause) can be polluted by old state — trust a real device (iPhone) over the test browser.
- **Don't fix a coupling only in JS**: a bug where motion affected the background was fixed in JS, but a CSS rule `html[data-motion="reduced"]` hiding the video was still there. For coupling bugs, grep the whole repo for `dataset.motion|data-motion|outai-motion`.
- **Don't render a control only in the "playing" branch**: pausing once made the whole control wheel vanish from the DOM (the paused state persisted in localStorage, so it never came back even after reload). A persistent control must always render, including in the paused state.

---

## 📝 Changelog

See [/changelog/](https://outaidage.xyz/changelog/) on the site. Counting "one version per batch of requested changes", the site reached its 20th version on 2026-11-15; the formal version is shown on the changelog page (currently v2.4.0).

---

## 🙏 Credits

- Textures: NASA Visible Earth / Solar System Scope (CC BY 4.0, see [/colophon/](https://outaidage.xyz/colophon/))
- Motion inspiration: React Bits (MIT + Commons Clause), Aceternity, Magic UI (MIT)
- Hosting & data: GitHub Pages, Supabase, Cloudflare R2, Buttondown

---

## 📄 License

MIT — take it and make it yours; just replace my personal info, articles, and bookmarks with your own.
