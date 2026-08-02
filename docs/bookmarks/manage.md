---
title: 书签管理
description: 导入、分类、增删、一键发布到 GitHub
---

# 书签管理

在浏览器中管理书签：支持 Raindrop CSV / HTML 导入、手动添加、删除、移动分类，以及 **一键发布到 GitHub**。

<BookmarkManager />

## 一键发布（推荐）

1. 打开 [GitHub Tokens](https://github.com/settings/tokens)
2. 生成 Token：
   - **Classic**：勾选 `repo`
   - 或 **Fine-grained**：只授权 `outaidage/outaidage.github.io`，Permissions → Contents: **Read and write**
3. 在上方点 **Token**，粘贴并保存（仅存本机浏览器）
4. 导入 / 整理书签后，点 **发布到 GitHub**
5. 等待 Actions 构建约 1–2 分钟，站点与侧边栏会自动更新

## Raindrop 导入

1. Raindrop → Settings → Backups → 下载 **CSV**
2. 点 **导入 CSV / HTML**
3. 用左侧文件夹分类、增删改

## 命令行（可选）

```bash
npm run import-bookmarks -- ./Raindrop.io-Export.csv --clean
git add docs/bookmarks && git commit -m "update bookmarks" && git push
```
