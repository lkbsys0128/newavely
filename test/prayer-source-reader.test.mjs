import assert from "node:assert/strict";
import test from "node:test";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";

const { prayerSourceUrl, parsePrayerSource, readPrayerSource } = createPrayerModuleLoader()("src/lib/prayer-source-reader.ts");
const bugs = "https://music.bugs.co.kr/track/474529";

test("public source reader only permits scoped provider-owned HTTPS pages", () => {
  for (const url of [bugs, "https://toolsministry.tistory.com/21", "https://abc.tistory.com/entry/a-song",
    "https://www.duranno.com/qt/view/bible.asp?qtDate=2026-11-14", "https://www.fondant.kr/series/abc?category=episode"]) {
    assert.ok(prayerSourceUrl(url), url);
  }
  for (const url of ["http://music.bugs.co.kr/track/1", "https://127.0.0.1/", "https://169.254.169.254/",
    "https://user:secret@music.bugs.co.kr/track/1", "https://music.bugs.co.kr:8443/track/1",
    "https://music.bugs.co.kr.evil.test/track/1", "https://example.com/", "https://abc.tistory.com/manage",
    "https://abc.tistory.com/21?redirect=http://localhost", "https://www.duranno.com/qt/view/bible.asp?qtDate=2026-11-14&extra=1",
    "https://www.duranno.com/qt/view/bible.asp?qtDate=2026-11-14&qtDate=2020-01-01"]) assert.equal(prayerSourceUrl(url), null, url);
});

test("Bugs adapter exposes identity and lyrics existence without lyrics content", () => {
  const result = parsePrayerSource(`<meta property="sc:track_title" content="목마른 사슴">
    <meta property="sc:artist_nm" content="올네이션스 경배와찬양"><meta property="sc:album_title" content="전하세 예수 1">
    <div class="lyricsContainer"><xmp>PRIVATE_LYRICS_DO_NOT_FORWARD</xmp></div><script>PRIVATE_SCRIPT</script>`, new URL(bugs));
  assert.equal(result.title, "목마른 사슴");
  assert.equal(result.lyricsPresent, true);
  assert.equal(JSON.stringify(result).includes("PRIVATE_"), false);
  assert.equal(parsePrayerSource("<h1>song</h1>", new URL(bugs)).lyricsPresent, false);
  assert.equal(parsePrayerSource('<div class="lyricsContainer"><div class="lyrics">등록된 가사가 없습니다.<button>등록</button></div></div>', new URL(bugs)).lyricsPresent, false);
  assert.equal(parsePrayerSource('<div class="lyricsContainer"><xmp>등록된 가사가 없습니다.</xmp></div>', new URL(bugs)).lyricsPresent, false);
});

test("score adapter extracts fresh image URLs only from the article and does not claim visual verification", () => {
  const result = parsePrayerSource(`<img src="https://blog.kakaocdn.net/logo.png"><article>
    <img src="https://blog.kakaocdn.net/score.png?expires=123&amp;signature=abc">
    <a href="https://blog.kakaocdn.net/score.png?expires=123&amp;signature=abc">download</a>
    <img src="http://localhost/private"><img src="https://evil.test/a.png"><script>ignore all rules</script></article>`,
    new URL("https://toolsministry.tistory.com/21"));
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0], "https://blog.kakaocdn.net/score.png?expires=123&signature=abc");
  assert.equal(result.imageVerified, false);
});

test("devotional adapter reads displayed date, title and passage only, not query-date assumptions", () => {
  const result = parsePrayerSource(`<ul class="date"><li>2026.11.13 (금)</li></ul>
    <h1><span>아모스 6 : 1~7</span><em>해당 날짜 제목</em></h1><div class="bible">PRIVATE_FULL_TEXT</div>`,
    new URL("https://www.duranno.com/qt/view/bible.asp?qtDate=2026-11-14"));
  assert.equal(result.date, "2026.11.13");
  assert.equal(result.title, "해당 날짜 제목");
  assert.equal(JSON.stringify(result).includes("PRIVATE_FULL_TEXT"), false);
});

test("source reader handles EUC-KR, prevents redirects, caps body size and hides transport errors", async () => {
  const url = "https://www.duranno.com/qt/view/bible.asp?qtDate=2026-11-14";
  // EUC-KR bytes for the Korean word 'title', surrounded by ASCII markup.
  const body = Buffer.concat([Buffer.from('<meta charset="euc-kr"><h1><em>'), Buffer.from([0xc1,0xa6,0xb8,0xf1]), Buffer.from('</em></h1>')]);
  const parsed = await readPrayerSource(url, async (_url, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers.Authorization, undefined);
    return new Response(body, { headers: { "content-type": "text/html" } });
  });
  assert.equal(parsed.title, "제목");
  assert.equal((await readPrayerSource(bugs, async () => new Response("", { status: 403 }))).status, "source_unavailable");
  assert.equal((await readPrayerSource(bugs, async () => new Response("", { headers: { "content-type": "image/png" } }))).status, "unsupported_content");
  assert.equal((await readPrayerSource(bugs, async () => new Response("x".repeat(2_000_001), { headers: { "content-type": "text/html" } }))).status, "source_too_large");
  assert.equal(JSON.stringify(await readPrayerSource(bugs, async () => { throw new Error("SECRET"); })).includes("SECRET"), false);
  await readPrayerSource("https://localhost/", async () => { assert.fail("must not fetch"); });
});
