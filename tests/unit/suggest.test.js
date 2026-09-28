import { describe, expect, test } from "vitest";
import { getContrastRatioForHex, getLevel } from "../../src/components/contrast_grid/contrast.js";
import {
  getNextLevel,
  hexToOklab,
  oklabToHex,
  suggestTextColor,
} from "../../src/components/contrast_grid/suggest.js";

// Seeded, so a failure can be reproduced.
function randomHexes(count, seed) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  return Array.from({ length: count }, () =>
    "#" + Math.floor(next() * 0x1000000).toString(16).padStart(6, "0").toUpperCase(),
  );
}

const hue = (hex) => {
  const { a, b } = hexToOklab(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

describe("OKLab conversion", () => {
  test.each(["#000000", "#FFFFFF", "#FF8000", "#1D4477", "#767676"])(
    "%s survives a round trip",
    (hex) => {
      const { L, a, b } = hexToOklab(hex);
      expect(oklabToHex(L, a, b)).toBe(hex);
    },
  );

  test("reaches black and white at the ends of the lightness range", () => {
    const { a, b } = hexToOklab("#FF8000");
    expect(oklabToHex(0, a, b)).toBe("#000000");
    expect(oklabToHex(1, a, b)).toBe("#FFFFFF");
  });
});

describe("getNextLevel", () => {
  test.each([
    ["#FF8000", "#FFFFFF", "Large"],
    ["#FF4000", "#FFFFFF", "AA"],
    ["#767676", "#FFFFFF", "AAA"],
  ])("%s on %s aims for %s", (foreground, background, level) => {
    expect(getNextLevel(foreground, background)).toMatchObject({ level, reachable: true });
  });

  test("stops at AAA", () => {
    expect(getNextLevel("#000000", "#FFFFFF")).toBeNull();
  });

  test("reports AAA as out of reach on mid gray", () => {
    // Even black only reaches 4.62 on #767676.
    expect(getNextLevel("#000000", "#767676")).toMatchObject({ level: "AAA", reachable: false });
    expect(suggestTextColor("#000000", "#767676")).toBeNull();
  });
});

describe("suggestTextColor", () => {
  test("darkens orange on white just enough for Large", () => {
    const suggestion = suggestTextColor("#FF8000", "#FFFFFF");

    expect(suggestion.level).toBe("Large");
    expect(suggestion.ratio).toBeGreaterThanOrEqual(3);
    expect(suggestion.ratio).toBeLessThan(3.1);
    expect(Math.abs(hue(suggestion.hex) - hue("#FF8000"))).toBeLessThan(3);
  });

  test("takes the step from Large to AA", () => {
    const large = suggestTextColor("#FF8000", "#FFFFFF");
    const aa = suggestTextColor(large.hex, "#FFFFFF");

    expect(aa.level).toBe("AA");
    expect(aa.ratio).toBeGreaterThanOrEqual(4.5);
  });

  test("picks the closer direction", () => {
    // Mid gray on black: lighter is a short way, darker is impossible.
    const suggestion = suggestTextColor("#404040", "#000000");
    expect(hexToOklab(suggestion.hex).L).toBeGreaterThan(hexToOklab("#404040").L);
  });

  test("reaches the next level and no smaller change would, in 2,000 random pairs", () => {
    const foregrounds = randomHexes(2000, 3);
    const backgrounds = randomHexes(2000, 4);

    foregrounds.forEach((foreground, i) => {
      const background = backgrounds[i];
      const next = getNextLevel(foreground, background);
      const suggestion = suggestTextColor(foreground, background);

      if (!next?.reachable) {
        expect(suggestion).toBeNull();
        return;
      }

      expect(getContrastRatioForHex(suggestion.hex, background)).toBeGreaterThanOrEqual(next.ratio);
      expect(getLevel(suggestion.ratio)).not.toBe(getLevel(getContrastRatioForHex(foreground, background)));

      const { L, a, b } = hexToOklab(foreground);
      const shift = Math.abs(hexToOklab(suggestion.hex).L - L);
      const shorter = shift - 0.01;
      if (shorter > 0) {
        for (const candidate of [L - shorter, L + shorter]) {
          if (candidate >= 0 && candidate <= 1) {
            expect(getContrastRatioForHex(oklabToHex(candidate, a, b), background)).toBeLessThan(next.ratio);
          }
        }
      }
    });
  });
});
