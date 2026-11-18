import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
const { isPrayerImageLink } = createPrayerModuleLoader()("src/lib/prayer-image-link.ts");

test("score viewer accepts direct image paths and Kakao image endpoints", () => {
  for (const url of ["https://example.com/score.PNG?token=abc", "https://blog.kakaocdn.net/dn/abc/img?signature=abc", "https://blogfiles.pstatic.net/abc/score.jpg?type=w800"]) {
    assert.equal(isPrayerImageLink(url), true);
  }
});

test("web pages, image-looking query parameters, and unknown endpoints open externally", () => {
  for (const url of ["https://m.blog.naver.com/PostView.naver?blogId=giftedteam&logNo=224179750434&view=img_1", "https://blog.naver.com/giftedteam/224179750434", "https://example.tistory.com/123?image=score.jpg", "https://example.com/post?image=score.png", "https://example.com/score.pdf", "https://example.com/image/123", "invalid"]) {
    assert.equal(isPrayerImageLink(url), false);
  }
});

test("entry rendering classifies URLs independently of the editable score label", () => {
  const source = readFileSync(new URL("../src/components/prayer-entry-links.tsx", import.meta.url), "utf8");
  assert.match(source, /links\.filter\(isPrayerImageLink\)/);
  assert.match(source, /href=\{url\} target="_blank" rel="noopener noreferrer"/);
});
