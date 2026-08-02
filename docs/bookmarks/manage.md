---
title: 书签管理
description: 导入、分类、增删书签（本地浏览器）
---

# 书签管理

在浏览器中管理书签：支持 Raindrop CSV / HTML 导入、手动添加、删除、移动分类、导出。

数据保存在你的浏览器本地，不会自动上传。整理完成后可导出 Markdown，再提交到仓库发布。

<BookmarkManager />

## 推荐流程（Raindrop）

1. Raindrop → Settings → Backups → 下载 **CSV**
2. 在上方点 **导入 CSV / HTML**
3. 用左侧文件夹分类，增删改、移动
4. 点 **导出 MD**，按文件说明放到 `docs/bookmarks/`
5. `git add docs/bookmarks && git commit -m "update bookmarks" && git push`

命令行同样可用：

```bash
npm run import-bookmarks -- ./Raindrop.io-Export.csv --clean
```
