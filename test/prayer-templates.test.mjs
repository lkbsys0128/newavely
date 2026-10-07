import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsModule } from "./load-ts-module.mjs";
const { preparePrayerTemplate, prayerTemplateSchema } = loadTsModule("../src/lib/prayer-templates.ts");

test("template defaults clear songs, URLs and meditation while keeping prayer text and order", () => {
  const entries = [
    { title: "기도", detail: "오프닝 기도: 함께 기도합니다" },
    { title: "찬양", detail: "노래 제목", sourceUrl: "https://example.com/song" },
    { title: "말씀 묵상", detail: "요한복음 1장" },
    { title: "묵상/나눔", detail: "나눔 내용" },
    { title: "기도", detail: "마무리 기도: 담당자 이름" },
    { title: "마무리 기도 - 담당자", detail: "추가 설명" },
  ];
  const snapshot = JSON.stringify(entries);
  assert.deepEqual(JSON.parse(JSON.stringify(preparePrayerTemplate(entries))), [
    entries[0], { title: "찬양", detail: "" }, { title: "말씀 묵상", detail: "" },
    { title: "묵상/나눔", detail: "" }, { title: "기도", detail: "마무리 기도" },
    { title: "마무리 기도", detail: "" },
  ]);
  assert.equal(JSON.stringify(entries), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(preparePrayerTemplate(entries, false))), entries);
});

test("template validation requires name and rows and defaults to clearing content", () => {
  const input = { id: null, version: 0, name: "수요 기도회", entries: [{ title: "기도", detail: "" }] };
  assert.equal(prayerTemplateSchema.parse(input).clearContents, true);
  for (const change of [{ name: " " }, { entries: [] }, { version: -1 }, { entries: [{ title: "", detail: "" }] }]) {
    assert.equal(prayerTemplateSchema.safeParse({ ...input, ...change }).success, false);
  }
});

test("template actions check registration and SQL writes are versioned and audited", () => {
  const actions = readFileSync(new URL("../src/app/prayer/template-actions.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../db/046_prayer_templates.sql", import.meta.url), "utf8");
  assert.equal((actions.match(/await templateClient\(\)/g) ?? []).length, 3);
  assert.match(actions, /!canManagePrayer\(data\)/);
  assert.match(actions, /preparePrayerTemplate\(entries, clearContents\)/);
  assert.equal((sql.match(/if not public.is_registered_member\(\)/g) ?? []).length, 2);
  assert.equal((sql.match(/prior.version <> p_version/g) ?? []).length, 2);
  assert.equal((sql.match(/perform record_audit_log/g) ?? []).length, 2);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public.prayer_templates from anon, authenticated/);
});
