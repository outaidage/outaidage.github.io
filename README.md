# OUTAI · 个人数字宇宙

[English](./README_EN.md) | **中文**

> 一个跑在 Astro + Supabase 上的个人数字空间：写文章、收藏书签、管项目、留言板，首页是一颗可以点的太阳系。

🌐 **在线地址：<https://outaidage.xyz/>**

---

## ✨ 功能

| 模块 | 说明 |
| --- | --- |
| 🏠 首页 | 真实 3D 太阳系（Three.js + React Three Fiber）：太阳是唯一主光源，8 颗行星按轨道运行；点行星聚焦，再点进入对应页面；另有星系、地球、导航三种视角 |
| 🎬 电影开场 | 深空飞行 → 掠过木星、土星环 → 能量核心亮起 OUTAI 字标 → 无缝推进主场景；可跳过、可重播、可永久关闭 |
| 📝 文章中心 | Markdown 写文章（`/blog/`），支持封面、分类、标签、目录、上下篇、评论；后台可视化发布，保存即提交到 GitHub |
| 🔖 书签收藏 | 收藏链接（`/collection/`），分类 + 标签 + 搜索，支持 Raindrop 导入导出；公开书签实时显示在首页 |
| 🪐 背景工作室 | 首页动态背景：Cloudflare R2 上传、URL 导入、GitHub 歌单同步、定时轮换、点赞收藏；右下角 ◐ 散花轮子控制 |
| 🧰 在线工具箱 | JSON 格式化、Base64 编解码、字数统计（`/toolbox/`） |
| 💬 留言板 / 评论 | 留言置顶、500 字限制、垃圾过滤、60 秒限流；文章评论需后台审核 |
| 📰 订阅 | Buttondown 邮件订阅；RSS / Sitemap / Pagefind 全站搜索 |
| 🔐 后台管理 | 文章、书签、项目、更新日志、页面内容、工具箱、Hero、3D 宇宙、背景库，全部后台可视化管理；权限由 Supabase RLS + Edge Function 在服务端校验 |

---

## 🛠️ 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Astro 5（静态生成 + Islands）+ React 18 |
| 样式 | Tailwind CSS 3 + 自定义 CSS |
| 3D | Three.js + @react-three/fiber + @react-three/drei + GSAP |
| 数据 | Supabase（Postgres + Auth + Realtime + Edge Functions，Deno） |
| 搜索 | Pagefind（构建时生成索引） |
| 背景存储 | Cloudflare R2（S3 兼容） |
| 订阅 | Buttondown |
| 部署 | GitHub Actions → GitHub Pages（自定义域名） |

---

## 🏗️ 架构与实现原理

```
浏览器 ──► GitHub Pages（静态站，Astro build 产物）
   │         ▲ 每天 10:00 / 15:00 / 22:00 自动重建，推送即部署
   │         │
   ├─ 读 ──► Supabase（公开读：文章元数据、书签、项目、日志、Hero、宇宙配置…）
   │
   └─ 写 ──► Supabase Edge Function（验 JWT + 查 admin_allowlist）
               ├─ github-content：把 Markdown 提交到 GitHub（文章发布）
               ├─ trigger-deploy：触发 GitHub Actions 重新部署（静态内容保存后自动上线）
               ├─ r2-upload-sign：给 R2 上传签发预签名 URL
               └─ background-sync / background-url-check：背景歌单同步与 URL 校验
```

**几个关键设计：**

- **静态 + 运行时混合**：文章、Hero、页面内容是构建时拉取（改完需部署，保存后自动触发）；书签、项目、更新日志、宇宙配置是运行时拉取（改完即生效）。首页书签用“构建时初值 + 打开页面再拉一次”的办法，既快又实时。
- **权限不在前端**：后台按钮藏起来不算数。真正的权限在 Supabase RLS（`is_site_admin()` 查 `admin_allowlist`）和 Edge Function 的 JWT 校验里；前端只负责展示。
- **3D 只渲染一处**：整个太阳系是一个 WebGL 场景（`SpaceCore`），开场飞行、行星、星系、星云都在同一个 Canvas 里，相机沿贝塞尔曲线飞，避免“两个场景切换”的割裂感。移动端自动降质（星点减半、DPR 上限 1.5）。
- **动效与背景解耦**：站内“动效”开关只管动效（标题动画、3D 旋转、开场），“背景”开关只管视频背景；两者互不影响，也不认操作系统的减弱动效设置——以用户在站内的选择为准。
- **不伪造数据**：所有数字（文章数、书签数、分类数）都读真实数据；没有就是 0，不编。

---

## 📁 目录结构

```
src/
├── pages/                 # 路由：index（首页）、blog/[...slug]、collection、projects、
│                          #   guestbook、links、changelog、toolbox、about、now、contact…
├── components/            # React 岛：SpaceCore（3D）、BackgroundControls（散花轮子）、
│   ├── background/        #   VideoSceneManager（背景播放器）、AdminApp（后台）、HeroAdmin…
│   └── *.astro            #   HeroText（逐字动画）、OutaiLogo、CommandTerminal（⌘K 终端）
├── lib/                   # hero-content、planets、universe-config、background-player…
├── content/blog/          # Markdown 文章（Git 管理）
├── styles/                # global.css、video-background.css
└── content.config.ts      # Astro 内容集合定义
supabase/
├── schema.sql             # 全量建表（从 0 建库用这个）
├── migrations/001–020     # 增量迁移（线上库用 SQL Editor 逐个执行）
└── functions/             # Edge Functions（github-content、trigger-deploy、r2-upload-sign…）
.github/workflows/
├── deploy.yml             # 推送 main 即部署；每天 3 次定时重建
└── background-sync.yml    # 每 6 小时同步一次背景歌单
```

---

## 🚀 快速开始（想参考 / 复用这个项目的人）

### 前置要求

- Node.js 22 LTS + npm
- 一个 GitHub 账号与仓库（推荐 `<用户名>.github.io`）
- 一个 Supabase 项目（免费版即可）

### 1. 本地运行

```bash
git clone https://github.com/outaidage/outaidage.github.io.git
cd outaidage.github.io
cp .env.example .env   # 填入下面两个值
npm install
npm run dev            # http://localhost:4321
```

`.env` 只需要两个公开值（前台可读，不含密钥）：

```bash
PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
PUBLIC_SUPABASE_ANON_KEY=你的 anon 公钥
```

### 2. 建 Supabase 库表

在 Supabase Dashboard → SQL Editor 里执行：

1. `supabase/schema.sql`（全量建表，含 RLS 与种子数据），或
2. 按顺序执行 `supabase/migrations/001–020`（已有库做增量升级）

然后在 **Authentication → Sign-in providers** 里**关闭公开注册**（Public sign-ups OFF），再去 **Table Editor → admin_allowlist** 里加一行自己的 `user_id`（UUID），只有这一行能进后台。

### 3. 配 Edge Function（文章发布 / 自动部署 / R2 上传要用）

在 Supabase Dashboard → Edge Functions 里逐个部署 `supabase/functions/*`（用 Via Editor 粘贴代码），并在 **Secrets** 里配好：

| Secret | 说明 |
| --- | --- |
| `GITHUB_TOKEN` | GitHub 细粒度 Token（仅限本仓库，Contents 读写 + Actions 读写） |
| `GITHUB_OWNER` / `GITHUB_REPO` / `GITHUB_BRANCH` | 仓库 owner / 名 / 分支（main） |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | R2（背景上传用，没有可不配） |
| `SYNC_TRIGGER_SECRET` | 背景歌单同步的触发密钥（随机字符串；GitHub Actions Secret 里也要配一份同名） |

> ⚠️ 密钥只放 Supabase Secrets 与 GitHub Secrets，**永远不要写进代码或 `.env` 提交**。

### 4. 配 GitHub Actions

仓库 → Settings → Secrets and variables：

- **Variables**：`PUBLIC_SUPABASE_URL`、`PUBLIC_SUPABASE_ANON_KEY`
- **Secrets**（背景同步用）：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SYNC_TRIGGER_SECRET`

再去 Settings → Pages → Source 选 **GitHub Actions**。之后每次推送 `main` 都会自动构建部署；每天 10:00 / 15:00 / 22:00（JST）还会定时重建，把到期的定时发布与后台改动带上线。

### 5. 配自定义域名（可选）

域名 DNS 加一条 `CNAME` 指向 `<用户名>.github.io`，仓库根目录放 `public/CNAME` 写域名，Pages 里填域名并等证书签发。**不要动别的 DNS 记录。**

---

## 🔑 踩过的坑（照着做能省很多时间）

- **Astro 构建不做类型检查**：esbuild 只转译不校验，`useThree` 之类缺 import 也能构建通过，上线才报 `ReferenceError`。加了新 import / Hook 后一定跑 `npx tsc --noEmit`。
- **`client:visible` 不会水合渲染 null 的组件**：3D 核心这类首屏就该出现的岛用 `client:load` 或 `client:idle`。
- **GitHub API 推不了大文件 / 二进制 / workflow**：`contents` 接口单个文件约 128KB 上限、推不了二进制、`.github/workflows/*` 会 403。大的、二进制的、workflow 文件走网页端上传覆盖；小文本文件才走 API。
- **新加的 `@/lib/*` 模块可能没打进包**：被 React 岛 import 的新模块，构建后要 grep 一下 dist 包里有没有它的特征字符串，确认真的内联了。
- **测试浏览器会“记住”登录态**：它的 localStorage / sessionStorage 跨会话保留，测开场、暂停这类依赖存储的功能时要先清掉，否则结果会被旧状态污染——以真机（iPhone）为准。
- **不要只在 JS 里修耦合**：一次动效影响背景的 bug，JS 修好了，CSS 里还藏着一条 `html[data-motion="reduced"]` 隐藏视频的规则。改这类耦合要把 `dataset.motion|data-motion|outai-motion` 全仓 grep 一遍。
- **轮子菜单别只在“播放中”渲染**：之前暂停后整个控制轮子从 DOM 消失（暂停状态已存 localStorage，刷新也回不来）。控制入口必须始终渲染，暂停态也要能点恢复。

---

## 📝 更新日志

见站内 [/changelog/](https://outaidage.xyz/changelog/)。大版本按“每次提需求算一版”数，到 2026-11-15 已是第 20 版；正式版本号见更新日志页（当前 v2.4.0）。

---

## 🙏 致谢

- 纹理：NASA 可见地球 / Solar System Scope（CC BY 4.0，见 [/colophon/](https://outaidage.xyz/colophon/)）
- 动效灵感：React Bits（MIT + Commons Clause）、Aceternity、Magic UI（MIT）
- 部署与数据：GitHub Pages、Supabase、Cloudflare R2、Buttondown

---

## 📄 License

MIT —— 随便拿去改，改完记得把里面我的个人信息、文章、书签换成你自己的。
