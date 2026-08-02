---
title: 文档库
description: 上传、浏览、下载文档（网站直接上传，无需 Token）
---

# 📄 文档库

在网站上直接上传文件，发布后存入仓库 `docs/public/files/`，可通过 `/files/文件名` 打开或下载。

**不需要在网站填写 GitHub Token。** 只需部署一次免费的同步服务（约 3 分钟），见下方说明。

<DocumentManager />

## 首次配置（只需一次）

1. 按仓库 [`services/README.md`](https://github.com/outaidage/outaidage.github.io/blob/main/services/README.md) 部署 Cloudflare Worker
2. 在上方管理器点 **同步设置**，填入 Worker 地址
3. 之后在本页上传 → 点 **发布到仓库** 即可

Token 只保存在 Cloudflare 后台，不会出现在网页里。
