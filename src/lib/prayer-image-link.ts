/** Labels and image-looking query parameters do not establish an image resource. */
export function isPrayerImageLink(value: string, mode?: "image" | "external"): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (mode === "external") return false;
    if (mode === "image") return true;
    if (["blog.naver.com", "m.blog.naver.com"].includes(url.hostname)
      || url.hostname.endsWith(".tistory.com")) return false;
    return /\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.pathname)
      || (url.hostname === "blog.kakaocdn.net" && /\/img$/.test(url.pathname));
  } catch { return false; }
}
