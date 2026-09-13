import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const palettes = [...css.matchAll(/:root(?:\[data-theme="dark"\])? \{([^}]+)\}/g)]
  .slice(0, 2)
  .map(([, block]) => Object.fromEntries([...block.matchAll(/--([\w-]+): (#[\da-f]{6});/g)]
    .map(([, name, value]) => [name, value])));

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test("autumn theme keeps text and seasonal navigation readable in both modes", () => {
  assert.equal(palettes.length, 2);
  for (const palette of palettes) {
    for (const [foreground, background] of [
      ["ink", "bg"], ["muted", "surface"],
      ["season-berry", "season-soft"], ["season-evergreen", "surface"],
    ]) {
      const values = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground} on ${background}`);
    }
  }
  assert.ok(!css.includes("--summer-"));
});
