import test from "node:test";
import assert from "node:assert/strict";
import { loadTsModule } from "./load-ts-module.mjs";
const { canonicalizeNewFamilyFields, readNewFamilyField, normalizeNewFamilyDate, normalizeNewFamilyGender, getNewFamilyAge } = loadTsModule("../src/lib/new-family-fields.ts");

test("headers, not column positions, determine form fields", () => {
  const raw = { "성별 (Gender)": "여 (Female)", "연락처": "01012345678", "생년월일 (Date of Birth)": "2000. 9. 21", "첫 방문일 (First Visit)": "9/20/2026" };
  const result = canonicalizeNewFamilyFields(raw);
  assert.equal(result.성별, "여");
  assert.equal(result.생년월일, "2000-09-21");
  assert.equal(result["첫 방문일"], "2026-09-20");
  assert.equal(result["성별 (Gender)"], raw["성별 (Gender)"]);
  assert.equal(canonicalizeNewFamilyFields({ 이름: "Test", 전화: "01012345678" }).생년월일, undefined);
});

test("bad legacy positional fields are ignored in favor of original headers", () => {
  const source = { 생년월일: "여 (Female)", 성별: "2000-09-21", "첫 방문일": "01012345678", "생년월일 (Date of Birth)": "2000-09-21", "성별 (Gender)": "Female", "First visit date": "2026-09-20" };
  assert.equal(readNewFamilyField(source, ["생년월일"]), "2000-09-21");
  assert.equal(readNewFamilyField(source, ["성별"]), "여");
  assert.equal(readNewFamilyField(source, ["첫 방문일"]), "2026-09-20");
  assert.equal(readNewFamilyField({ 생년월일: "Female" }, ["생년월일"]), "");
});

test("female does not match male and invalid dates never appear as dates", () => {
  for (const value of ["Female", "여 (Female)"]) assert.equal(normalizeNewFamilyGender(value), "여");
  assert.equal(normalizeNewFamilyGender("Male"), "남");
  for (const value of ["01012345678", "Female", "2026-02-30", "2026-13-01"]) assert.equal(normalizeNewFamilyDate(value), "");
});

test("age is calculated from validated birthdate at the Seattle birthday boundary", () => {
  const source = { "Date of Birth": "2000-09-21", "만 나이": "99" };
  assert.equal(getNewFamilyAge(source, new Date("2026-09-21T06:59:00Z")), "25");
  assert.equal(getNewFamilyAge(source, new Date("2026-09-21T07:00:00Z")), "26");
  assert.equal(getNewFamilyAge({ age: "25" }), "25");
  assert.equal(getNewFamilyAge({ language: "English" }), "");
});
