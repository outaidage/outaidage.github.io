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
- ⚙ GitHub Actions auto-deploy

## Development

```bash
npm install
npm run dev
```

## Build & Deploy

Push to `main` → GitHub Actions builds and deploys to GitHub Pages (outaidage.xyz).

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
│   │       └── Footer.vue
│   └── public/
├── index.md
├── featured/ learn/ network/ ai/ ...
└── about.md
```

## License

MIT
