import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const {
  baptismStatusOptions,
  calculateKoreanAge,
  genderOptions,
  getMemberMinistryValues,
  jobOptions,
  ministryOptions,
  normalizeMinistryList,
  normalizeBaptismStatus,
  normalizeJobValue,
  normalizeMinistryValue,
} = loadTsModule("../src/lib/member-field-options.ts");

test("member profile choices are fixed to operator-friendly labels", () => {
  assert.deepEqual(Array.from(genderOptions), ["남", "여"]);
  assert.deepEqual(Array.from(jobOptions), ["학생", "직장인", "기타"]);
  assert.deepEqual(Array.from(baptismStatusOptions), ["세례/입교", "유아세례", "교회 처음"]);
  assert.deepEqual(Array.from(ministryOptions), ["찬양팀", "예배운영팀", "웰컴팀", "순팀", "행정팀"]);
});

test("legacy imported labels normalize to current choices", () => {
  assert.equal(normalizeJobValue("사회인"), "직장인");
  assert.equal(normalizeBaptismStatus("X"), "교회 처음");
  assert.equal(normalizeMinistryValue("예배 진행팀"), "예배운영팀");
});

test("member ministries support multiple labels and legacy fields", () => {
  assert.deepEqual(Array.from(normalizeMinistryList(["찬양팀", "예배 진행팀", "", "찬양팀"])), ["찬양팀", "예배운영팀"]);
  assert.deepEqual(
    Array.from(getMemberMinistryValues({
      ministries: ["찬양팀", "웰컴팀"],
      ministry_1: "예배 진행팀",
      ministry_2: "찬양팀",
    })),
    ["찬양팀", "웰컴팀", "예배운영팀"],
  );
});

test("calculateKoreanAge returns 만 나이 from birthdate", () => {
  const today = new Date(2026, 4, 29);

  assert.equal(calculateKoreanAge("2002-05-29", today), "24");
  assert.equal(calculateKoreanAge("2002-05-30", today), "23");
  assert.equal(calculateKoreanAge("", today), "");
});
