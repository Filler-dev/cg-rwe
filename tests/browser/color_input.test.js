import { describe, expect, test } from "vitest";
import {
  colorsToText,
  parseColorInput,
  toHex,
} from "../../src/components/color_form/color_input.js";

describe("toHex", () => {
  test.each([
    ["#FF8000", "#FF8000"],
    ["#f80", "#FF8800"],
    ["FF8000", "#FF8000"],
    ["F80", "#FF8800"],
    ["orange", "#FFA500"],
    ["rebeccapurple", "#663399"],
    ["rgb(255, 128, 0)", "#FF8000"],
    ["rgb(0 128 255)", "#0080FF"],
    ["rgb(100% 50% 0%)", "#FF8000"],
    ["hsl(120, 100%, 25%)", "#008000"],
    ["hsl(30deg 100% 50%)", "#FF8000"],
    ["hwb(300 0% 0%)", "#FF00FF"],
    ["lab(50 0 0)", "#777777"],
    ["oklch(1 0 0)", "#FFFFFF"],
    ["color(srgb 0.2 0.4 0.6)", "#336699"],
    ["color-mix(in srgb, rgb(255 0 0) 75%, yellow)", "#FF4000"],
  ])("%s → %s", (input, hex) => {
    expect(toHex(input)).toBe(hex);
  });

  test("clips wide-gamut colors to sRGB", () => {
    expect(toHex("color(display-p3 1 0 0)")).toBe("#FF0000");
  });

  test.each([
    ["translucent rgb()", "rgb(0 0 0 / 0.5)"],
    ["translucent hex", "#00000080"],
    ["transparent", "transparent"],
    ["currentcolor", "currentcolor"],
    ["system color", "Canvas"],
    ["light-dark()", "light-dark(red, blue)"],
    ["var()", "var(--brand)"],
    ["CSS-wide keyword", "inherit"],
    ["unknown name", "notacolor"],
    ["invalid hex", "#GGG"],
  ])("rejects %s", (_, input) => {
    expect(toHex(input)).toBeNull();
  });

  // CSS.supports accepts these, but the canvas keeps its previous color for them.
  test.each(["var(--brand)", "inherit", "revert-layer", "env(brand)"])(
    "does not reuse the previous color for %s",
    (input) => {
      expect(toHex("red")).toBe("#FF0000");
      expect(toHex(input)).toBeNull();
    },
  );
});

describe("parseColorInput", () => {
  test("reads the label after a semicolon, commas included", () => {
    expect(parseColorInput("rgb(0, 0, 0); Black, deep")).toEqual([
      { hex: "#000000", source: "rgb(0, 0, 0)", label: "Black, deep" },
    ]);
  });

  test("keeps the notation as entered", () => {
    expect(parseColorInput("hsl(30 100% 50%)")).toEqual([
      { hex: "#FF8000", source: "hsl(30 100% 50%)" },
    ]);
  });

  test("trims whitespace and skips empty lines", () => {
    expect(parseColorInput("\n  #123456 ;  Navy  \n\n")).toEqual([
      { hex: "#123456", source: "#123456", label: "Navy" },
    ]);
  });

  test("drops a color that converts to one already listed", () => {
    const colors = parseColorInput("red; First\n#F00\nrgb(255 0 0)");
    expect(colors).toEqual([{ hex: "#FF0000", source: "red", label: "First" }]);
  });

  test("ignores a label separated by a comma", () => {
    expect(parseColorInput("rgb(255, 0, 0), Red")).toEqual([]);
  });

  test("survives a round trip through colorsToText", () => {
    const text = "hsl(30 100% 50%); Orange\norange\nrgb(0, 0, 0); Black, deep\n";
    expect(colorsToText(parseColorInput(text))).toBe(text);
  });
});
