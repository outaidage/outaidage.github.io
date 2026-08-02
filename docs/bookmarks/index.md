---
title: Bookmarks
description: 书签集合与本地管理器
---

# 🔖 Bookmarks

个人书签知识库。支持从 **Raindrop** 一键导入，并在浏览器内分类管理。

<div class="ol-bm-actions">
  <a class="ol-bm-btn primary" href="/bookmarks/manage">打开书签管理器</a>
  <a class="ol-bm-btn" href="/tags/">浏览标签</a>
</div>

## 功能

| 功能 | 说明 |
|------|------|
| 导入 | Raindrop CSV / 浏览器 HTML |
| 分类 | 文件夹树、移动、重命名 |
| 增删改 | 添加、编辑、删除书签 |
| 搜索 | 按标题 / URL / 标签过滤 |
| 导出 | CSV、JSON、Markdown（用于发布到站点） |

## 发布到网站

管理器里的数据在**本机浏览器**。要让 [outaidage.xyz](https://outaidage.xyz) 展示最新书签：

1. 在管理器中整理好 → **导出 MD**
2. 或使用命令行：`npm run import-bookmarks -- ./export.csv --clean`
3. 提交 `docs/bookmarks/` 并 push，GitHub Actions 会自动部署

> 导入后的 Markdown 会出现在本目录的子文件夹中。

<style>
.ol-bm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin: 1.25rem 0 2rem;
}
.ol-bm-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 1.1rem;
  border-radius: 10px;
  border: 1px solid var(--ol-border, #e5e7eb);
  text-decoration: none !important;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--ol-text, #111) !important;
  background: var(--ol-card, #fff);
  transition: box-shadow 0.2s, border-color 0.2s;
}
.ol-bm-btn:hover {
  border-color: var(--ol-primary, #2563eb);
  box-shadow: var(--ol-shadow-hover);
}
.ol-bm-btn.primary {
  background: var(--ol-primary, #2563eb);
  border-color: transparent;
  color: #fff !important;
}
</style>
