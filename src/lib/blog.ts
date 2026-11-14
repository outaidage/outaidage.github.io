// blog.ts — 文章可见性（3.0 P0 预览与发布工作流）。
// 一篇文章只有在「非草稿」且「发布日期不晚于今天」时才公开显示。
// 发布日期在未来的已发布文章属于「定时发布」：保存后不会立即出现，
// 每天 00:00 UTC 的定时重建会让它在发布日期当天自动上线。
// 所有列表（首页、博客列表、RSS、Sitemap）都用同一个判断，避免各处不一致。

export type BlogPostData = {
  draft?: boolean;
  pubDate: Date | string;
};

export function isVisiblePost(data: BlogPostData, now: Date = new Date()): boolean {
  if (data.draft) return false;
  const pub = data.pubDate instanceof Date ? data.pubDate : new Date(data.pubDate);
  return pub.getTime() <= now.getTime();
}

// 是否为「定时发布」（已发布但发布日期在未来）。
export function isScheduledPost(data: BlogPostData, now: Date = new Date()): boolean {
  if (data.draft) return false;
  const pub = data.pubDate instanceof Date ? data.pubDate : new Date(data.pubDate);
  return pub.getTime() > now.getTime();
}
