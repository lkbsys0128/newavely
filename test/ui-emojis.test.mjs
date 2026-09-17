import test from "node:test";
import assert from "node:assert/strict";
import { loadTsModule } from "./load-ts-module.mjs";

const { getPageEmoji, getSectionEmoji } = loadTsModule("../src/lib/ui-emojis.ts");

test("prayer page and navigation use the folded-hands emoji", () => {
  const title = "\uC624\uB298\uC758 \uAE30\uB3C4\uD68C";
  assert.equal(getPageEmoji(title), "\u{1F64F}");
  assert.equal(getSectionEmoji(title), "\u{1F64F}");
});
