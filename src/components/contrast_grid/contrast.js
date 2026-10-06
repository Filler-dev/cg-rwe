// Contrast math, adapted from Lea Verou's contrast-ratio and Qambar Raza's
// color-contrast-checker. Both MIT licensed.

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function toLinearChannel(value) {
  const srgb = value / 255;
  return srgb <= 0.04045
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  );
}

export function getContrastRatioForHex(foregroundColor, backgroundColor) {
  const a = luminance(foregroundColor);
  const b = luminance(backgroundColor);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  // Floor, not round: WCAG forbids rounding up to a threshold. The epsilon absorbs float error.
  return Math.floor(((lighter + 0.05) / (darker + 0.05)) * 100 + 1e-9) / 100;
}

export function getLevel(ratio) {
  if (ratio >= 7) {
    return "AAA";
  }
  if (ratio >= 4.5) {
    return "AA";
  }
  if (ratio >= 3) {
    return "Large";
  }
  return "Fail";
}
