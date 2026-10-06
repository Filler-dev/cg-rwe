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

// `fix` is set when only the separator is wrong, the likeliest mistake since labels used to follow a comma.
export function findInvalidLines(value) {
  return value.split("\n").flatMap((text, index) => {
    const [source] = text.split(";").map((part) => part.trim());
    if (!text.trim() || toHex(source)) {
      return [];
    }

    const comma = text.lastIndexOf(",");
    const color = text.slice(0, comma).trim();
    const label = text.slice(comma + 1).trim();
    const fix =
      !text.includes(";") && comma > 0 && label && toHex(color)
        ? `${color}; ${label}`
        : undefined;

    return [{ line: index + 1, text: text.trim(), ...(fix && { fix }) }];
  });
}

// The grid shows each color once, so later lines with the same color are left out.
export function findDuplicateLines(value) {
  const firstLine = new Map();

  return value.split("\n").flatMap((text, index) => {
    const hex = lineHex(text);
    if (!hex) {
      return [];
    }
    if (firstLine.has(hex)) {
      return [{ line: index + 1, first: firstLine.get(hex) }];
    }
    firstLine.set(hex, index + 1);
    return [];
  });
}

// The edits below work on lines, so invalid ones stay where the user put them.
function lineHex(line) {
  const source = line.split(";")[0].trim();
  return source ? toHex(source) : null;
}

export function removeColorLines(value, hex) {
  return value
    .split("\n")
    .filter((line) => lineHex(line) !== hex)
    .join("\n");
}

export function insertLineAfterColor(value, hex, line) {
  const lines = value.split("\n");
  const index = lines.findIndex((existing) => lineHex(existing) === hex);
  lines.splice(index + 1, 0, line);
  return lines.join("\n");
}

// Colors trade places among the lines they occupy; every other line keeps its position.
export function reorderColorLines(value, order) {
  const lines = value.split("\n");
  const seen = new Set();
  const slots = [];
  const lineOf = new Map();

  lines.forEach((line, index) => {
    const hex = lineHex(line);
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      slots.push(index);
      lineOf.set(hex, line);
    }
  });

  const reordered = order.map((hex) => lineOf.get(hex)).filter(Boolean);
  if (reordered.length !== slots.length) {
    return value;
  }

  slots.forEach((slot, i) => {
    lines[slot] = reordered[i];
  });
  return lines.join("\n");
}
