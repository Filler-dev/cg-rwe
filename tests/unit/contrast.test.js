import { describe, expect, test } from "vitest";
import {
  getContrastRatioForHex,
  getLevel,
} from "../../src/components/contrast_grid/contrast.js";

// Unrounded reference, so the tests can tell flooring from rounding.
function exactRatio(a, b) {
  const luminance = (hex) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

// Seeded, so a failure can be reproduced.
function randomHexes(count, seed = 1) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  return Array.from({ length: count }, () =>
    "#" + Math.floor(next() * 0x1000000).toString(16).padStart(6, "0"),
  );
}

describe("getContrastRatioForHex", () => {
  test.each([
    ["#000000", "#FFFFFF", 21],
    ["#FFFFFF", "#FFFFFF", 1],
    ["#767676", "#FFFFFF", 4.54],
    ["#767676", "#000000", 4.62],
    ["#595959", "#FFFFFF", 7],
    ["#FF8000", "#000000", 8.33],
  ])("%s on %s is %s", (a, b, expected) => {
    expect(getContrastRatioForHex(a, b)).toBe(expected);
  });

  test("does not depend on the order of the colors", () => {
    expect(getContrastRatioForHex("#FF8000", "#1D4477")).toBe(
      getContrastRatioForHex("#1D4477", "#FF8000"),
    );
  });

  test("floors instead of rounding up to a threshold", () => {
    // Exactly 4.4991, which rounding turned into a passing 4.5.
    expect(getContrastRatioForHex("#14FCBF", "#6D53AD")).toBe(4.49);
  });

  test("never overstates the exact ratio, in 100,000 random pairs", () => {
    const foregrounds = randomHexes(100_000, 1);
    const backgrounds = randomHexes(100_000, 2);

    foregrounds.forEach((foreground, i) => {
      const exact = exactRatio(foreground, backgrounds[i]);
      const shown = getContrastRatioForHex(foreground, backgrounds[i]);

      expect(shown).toBeLessThanOrEqual(exact);
      expect(exact - shown).toBeLessThan(0.01);
      expect(getLevel(shown)).toBe(getLevel(exact));
      expect(String(shown)).toMatch(/^\d+(\.\d{1,2})?$/);
    });
  }, 30_000);
});

describe("getLevel", () => {
  test.each([
    [21, "AAA"],
    [7, "AAA"],
    [6.99, "AA"],
    [4.5, "AA"],
    [4.49, "Large"],
    [3, "Large"],
    [2.99, "Fail"],
    [1, "Fail"],
  ])("%s is %s", (ratio, level) => {
    expect(getLevel(ratio)).toBe(level);
  });
});
