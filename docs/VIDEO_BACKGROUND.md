# OUTAI 电影级动态视频背景 — 配置与使用说明

## 一、这是什么

首页的动态视频背景系统：一个常驻全屏的 HTML5 视频层（仅首页显示），
配 6 个可配置场景（深空宇宙 / 漂浮岛屿 / 深海 / 未来城市 / 星云星球 / 极简）。
视频来自你自己的 Cloudflare R2，不进 Git 仓库。

## 二、视频文件：由你上传（R2）

我不替你创建或修改 Cloudflare 资源，也不改 DNS。步骤如下：

### 1. 在 Cloudflare 创建 R2 存储桶
- Cloudflare Dashboard → R2 → Create bucket，名字自定（例如 `outai-media`）。
- 区域任意；建议选离你访客近的区域。

### 2. 上传视频文件
- 每个场景准备两个格式（WebM 优先，MP4 兼容）：
  - 桌面端：建议 1920×1080，H.264/VP9，码率 4–8 Mbps，时长 10–30 秒循环。
  - 移动端：建议 1280×720，码率 1.5–3 Mbps（同内容的小文件）。
- 命名建议：`videos/deep-space.webm`、`videos/deep-space.mp4`、
  `videos/deep-space-mobile.webm`、`videos/deep-space-mobile.mp4`。
- 封面图（可选）：`videos/deep-space.jpg`（1920×1080，视频加载前与失败时显示）。

### 3. 开启公共访问
- 在桶的 Settings → Public access，开启 **Allow public access**
  （或通过自定义域名提供）。确认不需要登录即可打开视频链接。
- 建议在桶的 CORS 设置里允许 `https://outaidage.xyz`（后台“检查地址”
  功能需要 CORS；不配也不影响前台播放）。

### 4.（可选）绑定自定义媒体域名 media.outaidage.xyz
- 在 R2 桶 → Settings → Custom Domains → Connect Domain，
  输入 `media.outaidage.xyz`，按 Cloudflare 提示完成。
  这一步会在你的域名下自动配置 DNS 记录（由 Cloudflare 处理），
  不需要你手动改 DNS。
- 绑定后视频地址形如：`https://media.outaidage.xyz/videos/deep-space.webm`
- 未绑定前也可以直接用 R2 的公共域名（`https://<id>.r2.dev/...` 或
  `https://pub-<id>.r2.dev/...`）。

## 三、在哪里填写视频地址

**后台 → 背景与媒体**（登录后点“背景与媒体”标签）：

1. 点某个场景的 **编辑**。
2. 填入：
   - 桌面端视频 WebM：`https://media.outaidage.xyz/videos/deep-space.webm`
   - 移动端视频 WebM：`https://media.outaidage.xyz/videos/deep-space-mobile.webm`
   - 桌面/移动 MP4：同名 `.mp4`（没有可留空）
   - 封面图 URL：`https://media.outaidage.xyz/videos/deep-space.jpg`（可留空）
3. 点 **播放测试**（直接在卡片里试播）或 **检查地址**（确认链接可访问）。
4. 点 **保存修改**。保存后前台立即生效，无需重新部署。
5. 想换默认背景：点场景卡片上的 **设为默认**。

也可以直接改静态回退文件 `public/config/video-scenes.json`
（Supabase 不可用时的备用配置），改完提交到 main 即可。

## 四、数据存在哪里

- 主数据源：Supabase `video_scenes` 表（迁移文件
  `supabase/migrations/007_video_scenes.sql`）。
  公开只能读已启用的场景；写操作仅限管理员（admin_allowlist）。
- 静态回退：`public/config/video-scenes.json`（随站点部署）。
- 内置保底：`src/config/video-scenes.ts` 里的 `PLACEHOLDER_SCENES`。
- 前台加载顺序：Supabase → 静态 JSON → 内置占位。
- 没有真实视频时，所有视频地址为空，首页显示深空渐变 + 现有 2D 星空，
  不会空白，也不会伪造“播放成功”。

## 五、前台控制

- 页脚有 **背景：播放中 / 已暂停** 开关（点一下切换，刷新后保持）。
- 有 2 个及以上已配置视频的场景时，页脚会出现 **换个背景** 按钮。
- 减动效（系统 prefers-reduced-motion 或页脚“动效：关”）、省流量模式
  （navigator.connection.saveData）下，自动只显示静态背景，不加载视频。
- 切到文章/书签等页面时视频淡出并暂停，回到首页再淡入恢复，
  视频元素不卸载，因此不会重复下载。

## 六、性能说明

- 首页默认只加载当前默认场景的视频（preload="metadata"），不预加载其他场景。
- 场景切换用单视频元素 + 透明度淡入淡出，下方始终有封面/渐变兜底。
- 页面不可见（切到后台标签）时自动暂停；移动端使用更小的视频文件。
- 3D 核心（SpaceCore）与视频背景不同时全功率运行：
  视频激活时 2D 网格与辉光会自动弱化，避免多层特效叠加。
- 视频本身不走 WebGL，不会与 3D 核心争夺 GPU。

## 七、文件清单

| 文件 | 作用 |
| --- | --- |
| `src/config/video-scenes.ts` | 场景类型、6 个占位场景、加载逻辑（Supabase→JSON→内置） |
| `public/config/video-scenes.json` | 静态回退配置 |
| `src/components/background/VideoSceneManager.tsx` | 视频播放器（常驻布局、跨页连续、回退、减动效） |
| `src/components/background/VideoControls.tsx` | 页脚播放/暂停与换背景按钮 |
| `src/styles/video-background.css` | 视频层、遮罩、减动效与移动端样式 |
| `src/components/VideoSceneAdmin.tsx` | 后台「背景与媒体管理」模块 |
| `src/components/AdminApp.tsx` | 增加“背景与媒体”标签 |
| `src/layouts/MainLayout.astro` | 挂载视频层与前台控制 |
| `supabase/migrations/007_video_scenes.sql` | video_scenes 表 + RLS + 6 个占位场景 |
| `docs/VIDEO_BACKGROUND.md` | 本说明 |

## 八、尚未完成 / 需要你提供

- **真实视频文件**：6 个场景的视频地址目前全部为空（占位）。请按第二节
  上传后，在后台填入地址。
- **media.outaidage.xyz 绑定状态**：尚未确认是否已绑定。未绑定时先用
  R2 公共域名同样可用。
- **R2 CORS（可选）**：仅影响后台“检查地址”功能，不影响前台播放。
