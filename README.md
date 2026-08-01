# Outai Lab

Build · Learn · Collect. 一个不断成长的个人知识库。

基于 [VitePress](https://vitepress.dev) 构建，通过 GitHub Actions 自动部署到 `outaidage.xyz`。

## 本地开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
pnpm preview
```

## 部署

推送到 `main` 分支即可触发 `.github/workflows/deploy.yml` 自动构建并发布到 GitHub Pages。

首次启用需要在仓库 Settings → Pages 中，将 Source 设置为 **GitHub Actions**；
如需使用自定义域名 `outaidage.xyz`，已在 `docs/.vitepress/public/CNAME` 中配置，
并需在你的域名 DNS 处添加相应的 CNAME / A 记录指向 GitHub Pages。

## 书签导入

```bash
pnpm run import-bookmarks -- ./raindrop-export.html
```

将 Raindrop.io 导出的书签 HTML 转换为 `docs/bookmarks/` 下的 Markdown 文件。

## 标签索引

```bash
pnpm run build-tags
```

扫描所有页面 frontmatter 中的 `tags` 字段，重新生成 `docs/tags/index.md`。

## 目录结构

```
docs/
  .vitepress/
    config.ts       # 站点配置：导航、侧边栏、搜索
    theme/           # 自定义主题（首页、卡片、页脚组件、样式）
    public/          # 静态资源（favicon、logo、CNAME）
  featured/ learn/ network/ ai/ software/ media/
  reading/ tools/ downloads/ notes/ bookmarks/ tags/
  index.md          # 首页
  about.md
scripts/             # 书签导入、标签生成等自动化脚本
.github/workflows/   # GitHub Actions 自动部署
```

## License

MIT
