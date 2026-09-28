const BARE_HEX = /^[0-9a-f]{3}([0-9a-f]{3})?$/i;

// Valid CSS, but the result depends on context or theme rather than the input.
const CONTEXT_DEPENDENT =
  /^(currentcolor|light-dark\(.*|accentcolor|accentcolortext|activetext|buttonborder|buttonface|buttontext|canvas|canvastext|field|fieldtext|graytext|highlight|highlighttext|linktext|mark|marktext|selecteditem|selecteditemtext|visitedtext)$/i;

const pixel = new OffscreenCanvas(1, 1).getContext("2d", {
  willReadFrequently: true,
});

// Painting a pixel converts any CSS color, including oklch() or color-mix(), to sRGB.
export function toHex(input) {
  const color = BARE_HEX.test(input) ? "#" + input : input;
  if (CONTEXT_DEPENDENT.test(color) || !CSS.supports("color", color)) {
    return null;
  }

  // A value the canvas cannot parse is ignored, which leaves the pixel transparent.
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = "transparent";
  pixel.fillStyle = color;
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;

  // The contrast of a translucent color depends on what lies beneath it.
  if (a < 255) {
    return null;
  }

  return (
    "#" +
    [r, g, b]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function parseColorInput(value) {
  const seen = new Set();
  const colors = [];

  for (const line of value.split("\n")) {
    // No CSS color contains a semicolon, so commas stay free for rgb() and labels.
    const [source, label] = line.split(/;(.*)/).map((part) => part?.trim());
    const hex = source && toHex(source);
    if (!hex || seen.has(hex)) {
      continue;
    }
    seen.add(hex);

    colors.push(label ? { hex, source, label } : { hex, source });
  }

  return colors;
}

export function colorsToText(colors) {
  return colors
    .map((color) =>
      color.label
        ? `${color.source}; ${color.label}\n`
        : `${color.source}\n`,
    )
    .join("");
}
