import { getContrastRatioForHex, getLevel } from "./contrast.js";

const NEXT_LEVEL = {
  Fail: { level: "Large", ratio: 3 },
  Large: { level: "AA", ratio: 4.5 },
  AA: { level: "AAA", ratio: 7 },
};

const SCAN_STEP = 0.005;

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// OKLab conversion after Björn Ottosson, https://bottosson.github.io/posts/oklab/
export function hexToOklab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

// Out-of-gamut colors lose chroma rather than being clipped, which would shift the hue.
export function oklabToHex(L, a, b) {
  let rgb = oklabToLinearRgb(L, a, b);

  if (!inGamut(rgb)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 20; i++) {
      const k = (low + high) / 2;
      if (inGamut(oklabToLinearRgb(L, a * k, b * k))) {
        low = k;
      } else {
        high = k;
      }
    }
    rgb = oklabToLinearRgb(L, a * low, b * low);
  }

  return (
    "#" +
    rgb
      .map((c) => Math.round(fromLinear(Math.min(1, Math.max(0, c))) * 255))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

// Black and white are the darkest and lightest colors a text can have.
function isReachable(background, ratio) {
  return (
    getContrastRatioForHex("#000000", background) >= ratio ||
    getContrastRatioForHex("#FFFFFF", background) >= ratio
  );
}

// Null at AAA; otherwise the next level and whether any text lightness reaches it.
export function getNextLevel(foreground, background) {
  const next = NEXT_LEVEL[getLevel(getContrastRatioForHex(foreground, background))];
  return next ? { ...next, reachable: isReachable(background, next.ratio) } : null;
}

// The smallest OKLCH lightness change reaching the next level, with hue and chroma kept.
export function suggestTextColor(foreground, background) {
  const next = getNextLevel(foreground, background);
  if (!next?.reachable) {
    return null;
  }

  const { L: start, a, b } = hexToOklab(foreground);
  const passes = (L) =>
    getContrastRatioForHex(oklabToHex(L, a, b), background) >= next.ratio;

  let best = null;
  for (const direction of [-1, 1]) {
    const distance = direction < 0 ? start : 1 - start;
    let failing = start;

    for (let i = 1; i <= Math.ceil(distance / SCAN_STEP); i++) {
      const L = start + direction * Math.min(i * SCAN_STEP, distance);
      if (!passes(L)) {
        failing = L;
        continue;
      }

      let passing = L;
      for (let j = 0; j < 20; j++) {
        const mid = (failing + passing) / 2;
        if (passes(mid)) {
          passing = mid;
        } else {
          failing = mid;
        }
      }

      if (!best || Math.abs(passing - start) < Math.abs(best - start)) {
        best = passing;
      }
      break;
    }
  }

  const hex = oklabToHex(best, a, b);
  return { hex, level: next.level, ratio: getContrastRatioForHex(hex, background) };
}
