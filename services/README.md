# 上传中转服务（无需在网站填 GitHub Token）

网站 `outaidage.xyz` 是静态页，不能安全保存 GitHub Token。  
用 **Cloudflare Worker**（免费）在服务端保存 Token，浏览器只负责上传。

## 一、创建 GitHub Token（只填到 Cloudflare，永远不要填到网站）

1. 打开 https://github.com/settings/tokens
2. Generate new token (classic) → 勾选 `repo`
3. 复制生成的 `ghp_...`

## 二、部署 Worker（约 3 分钟，只做一次）

1. 打开 https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**
2. 名称例如 `outai-upload` → Deploy
3. **Edit code** → 删除默认代码 → 粘贴仓库里 `services/upload-worker.js` 的全部内容 → **Deploy**
4. **Settings** → **Variables and Secrets**：

| 变量 | 类型 | 值 |
|------|------|-----|
| `GITHUB_TOKEN` | Secret | 刚才的 `ghp_...` |
| `GITHUB_OWNER` | 明文 | `outaidage` |
| `GITHUB_REPO` | 明文 | `outaidage.github.io` |
| `UPLOAD_KEY` | Secret（可选） | 自设站点密码，如 `mypass` |

5. 复制 Worker 地址，形如：
   `https://outai-upload.xxxxx.workers.dev`

## 三、在网站里绑定（只需一次）

1. 打开 https://outaidage.xyz/documents/ 或书签管理器
2. 点 **同步设置**
3. 填入 Worker 地址；若设置了 `UPLOAD_KEY`，再填站点密码
4. 保存后即可直接上传，**不用再填 GitHub Token**

## 四、目录约定

| 类型 | 仓库路径 | 网站访问 |
|------|----------|----------|
| 文档/附件 | `docs/public/files/` | `/files/文件名` |
| 书签 Markdown | `docs/bookmarks/` | `/bookmarks/...` |
