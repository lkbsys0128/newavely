import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { formatMemberDisplayName, getMemberEnglishName, splitCompositeMemberName } = loadTsModule("../src/lib/member-names.ts");

test("member names keep Korean and English values separate for display", () => {
  const daniel = splitCompositeMemberName("김연준(Daniel)");
  assert.equal(daniel.koreanName, "김연준");
  assert.equal(daniel.englishName, "Daniel");
  const williams = splitCompositeMemberName("현세준 (Williams)");
  assert.equal(williams.koreanName, "현세준");
  assert.equal(williams.englishName, "Williams");
  const koreanParenthetical = splitCompositeMemberName("이에녹 (이중현)");
  assert.equal(koreanParenthetical.koreanName, "이에녹 (이중현)");
  assert.equal(koreanParenthetical.englishName, "");
  assert.equal(getMemberEnglishName({ customFields: { english_name: "Robin Kim" } }), "Robin Kim");
  assert.equal(formatMemberDisplayName({ name: "김현우", customFields: { english_name: "Robin Kim" } }), "김현우 (Robin Kim)");
});
