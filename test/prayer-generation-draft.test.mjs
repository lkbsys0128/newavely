import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPrayerModuleLoader } from "./helpers/load-prayer-module.mjs";
import { input } from "./helpers/prayer-generation-fixture.mjs";
const { createPrayerGenerationDraft } = createPrayerModuleLoader()("src/lib/prayer-generation-draft.ts");

test("manual recovery preserves date and song order without claiming verified sources", () => {
  const before = JSON.stringify(input);
  const draft = createPrayerGenerationDraft(input);
  assert.equal(draft.eventDate, input.eventDate);
  assert.equal(draft.entries.length, 8);
  assert.deepEqual(Array.from(draft.entries.filter((row) => row.title === "찬양"), (row) => row.detail), [...input.beforeSongs, ...input.afterSongs]);
  assert.equal(draft.entries[4].detail, "");
  assert.ok(draft.entries.every((row) => !row.sourceUrl && !row.additionalSourceUrls));
  assert.equal(JSON.stringify(input), before);
  const shorter = createPrayerGenerationDraft({ ...input, beforeSongs: [], afterSongs: ["one"] });
  assert.equal(shorter.entries.length, 5);
  assert.equal(shorter.entries[2].title, "묵상/나눔");
  assert.equal(shorter.entries[3].detail, "one");
  assert.throws(() => createPrayerGenerationDraft({ ...input, beforeSongs: [], afterSongs: [] }));
});

test("creation has one mode switch and saved AI meetings use the existing editor", () => {
  const page = readFileSync(new URL("../src/components/prayer-meeting-page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/prayer/page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/prayer-generation-panel.tsx", import.meta.url), "utf8");
  assert.match(page, /aria-label="기도회 생성 방식"/);
  assert.match(page, /open=\{creationMode === "ai"\}/);
  assert.match(page, /editing && \(!creating \|\| creationMode === "manual"\)/);
  assert.doesNotMatch(page, /generationMounted|generationOpen|찬양으로 만들기/);
  assert.match(route, /editingRequested = canEdit && params.edit === "1"/);
  assert.match(panel, /encodeURIComponent\(job.meetingId\)\}&edit=1/);
  assert.match(panel, /<details className="prayer-generation-history"/);
  assert.match(panel, /pollNotice \|\| notice\?\.error \?/);
  assert.match(panel, /generationEnabled && !activeJob\(job\)/);
  assert.doesNotMatch(panel, /진행 상태 확인|목록 새로고침/);
});

test("recovery is an explicit unsaved create through the registered-member editor, never overwrite", () => {
  const page = readFileSync(new URL("../src/components/prayer-meeting-page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/prayer-generation-panel.tsx", import.meta.url), "utf8");
  assert.match(page, /canEdit && creating/);
  assert.match(page, /id: generationDraft \? null : meeting\?\.id/);
  assert.match(page, /version: generationDraft \? 0 : meeting\?\.version/);
  assert.match(page, /savePrayerMeeting/);
  assert.match(panel, /onEditDraft && \["needs_input", "failed"\]/);
  assert.match(panel, /onEditDraft\(\{ \.\.\.jobDraft\(job\), savedDraft: job.draft \}\)/);
});
