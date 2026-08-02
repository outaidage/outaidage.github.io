# Outai Lab

> Build · Learn · Collect  
> 一个不断成长的个人知识库。

**Live**: [outaidage.xyz](https://outaidage.xyz)

## Features

- 🚀 VitePress
- 🎨 Custom modern homepage (Hero + Feature cards)
- 🌙 Dark / Light mode with precise design tokens
- 🔍 Local full-text search (⌘K)
- 📱 Fully responsive
- 📑 Sidebar navigation
- 📚 Markdown knowledge base
- 🔖 浏览器内书签管理器（导入 / 分类 / 增删 / 导出）
- ⚙ GitHub Actions auto-deploy

## Development

```bash
npm install
npm run dev
```

## Bookmarks

### 浏览器管理（推荐日常使用）

打开站点 **/bookmarks/manage**：

1. 从 Raindrop 导出 CSV 并导入
2. 增删改、移动文件夹分类
3. 导出 Markdown → 放入 `docs/bookmarks/` → push

### 命令行导入

```bash
npm run import-bookmarks -- ./Raindrop.io-Export.csv --clean
npm run build-tags   # 可选：生成标签索引
```

## Build & Deploy

1. 仓库 **Settings → Pages → Source** 设为 **GitHub Actions**（不是 Deploy from a branch）
2. Push to `main` → Actions 自动构建部署到 outaidage.xyz

```bash
git add .
git commit -m "update"
git push
```

## Project Structure

```
docs/
├── .vitepress/
│   ├── config.ts
│   ├── theme/
│   │   ├── index.ts
│   │   ├── style.css
│   │   └── components/
│   │       ├── Hero.vue
│   │       ├── FeatureCard.vue
│   │       ├── Footer.vue
│   │       └── BookmarkManager.vue
│   └── public/
├── bookmarks/
│   ├── index.md
│   └── manage.md          # 交互式管理器
├── index.md
└── ...
scripts/
├── import-bookmarks.ts    # CLI：CSV/HTML → Markdown
└── build-tags.ts
```
