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
  assert.throws(() => createPrayerGenerationDraft({ ...input, beforeSongs: ["one"] }));
});

test("recovery is an explicit unsaved create through the registered-member editor, never overwrite", () => {
  const page = readFileSync(new URL("../src/components/prayer-meeting-page.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/prayer-generation-panel.tsx", import.meta.url), "utf8");
  assert.match(page, /canEdit && generationMounted/);
  assert.match(page, /id: generationDraft \? null : meeting\?\.id/);
  assert.match(page, /version: generationDraft \? 0 : meeting\?\.version/);
  assert.match(page, /savePrayerMeeting/);
  assert.match(panel, /onEditDraft && \["needs_input", "failed"\]/);
  assert.match(panel, /onEditDraft\(jobDraft\(job\)\)/);
});
