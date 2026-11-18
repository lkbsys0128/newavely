/** Keep only a public Naver post identity; discard referral and tracking parameters. */
export function naverScorePageUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !["blog.naver.com", "m.blog.naver.com"].includes(url.hostname)) return null;
    const path = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/(\d+)\/?$/);
    const blogId = path?.[1] ?? (url.pathname === "/PostView.naver" ? url.searchParams.get("blogId") : null);
    const logNo = path?.[2] ?? (url.pathname === "/PostView.naver" ? url.searchParams.get("logNo") : null);
    if (!blogId || !/^[A-Za-z0-9_-]{1,64}$/.test(blogId) || !logNo || !/^\d{1,20}$/.test(logNo)) return null;
    return `https://m.blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${logNo}&view=img_1`;
  } catch { return null; }
}
