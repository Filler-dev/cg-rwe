import { beforeAll, describe, expect, test, vi } from "vitest";
import "../../src/styles/project.css";
import "../../src/components/icon/icon.js";
import "../../src/components/contrast_grid/contrast_grid.js";
import "../../src/components/color_form/color_form.js";

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const textarea = () => qs("#cg-color-form__foreground-colors");

function enterColors(text) {
  textarea().value = text;
  textarea().dispatchEvent(new Event("input"));
}

function rowHexes() {
  return qsa(".cg-contrast-grid__key-swatch--background").map((s) => s.dataset.hex);
}

function tile(background, foreground) {
  const swatch = tileElement(background, foreground);
  return {
    ratio: qs(".cg-contrast-grid__contrast-ratio", swatch).textContent,
    level: qs(".cg-contrast-grid__accessibility-label", swatch).textContent,
    visible: swatch.style.display !== "none",
  };
}

function tileElement(background, foreground) {
  return qs(
    `.cg-contrast-grid__swatch[data-background="${background}"][data-foreground="${foreground}"]`,
  );
}

beforeAll(() => {
  // The form mirrors its state into the URL, which would navigate the test frame.
  vi.spyOn(history, "pushState").mockImplementation(() => {});

  // Mounted once: each element registers document-wide listeners on connect.
  document.body.innerHTML =
    "<cg-color-form></cg-color-form><cg-contrast-grid></cg-contrast-grid>";
  qs("cg-color-form").start();
});

describe("contrast grid", () => {
  test("renders the default palette", () => {
    expect(rowHexes()).toHaveLength(8);
    expect(tile("#FFFFFF", "#767676")).toEqual({ ratio: "4.54", level: "AA", visible: true });
    expect(tile("#000000", "#FFFFFF")).toEqual({ ratio: "21", level: "AAA", visible: true });
  });

  test("accepts any CSS format and shows the label", async () => {
    enterColors("hsl(30 100% 50%); Orange\nrgb(0, 0, 0); Black, deep\n#FFF\n");

    await expect.poll(rowHexes).toEqual(["#FF8000", "#000000", "#FFFFFF"]);
    expect(
      qs(".cg-contrast-grid__key-swatch--background .cg-contrast-grid__key-swatch-label-text").textContent,
    ).toBe("Orange");
    expect(tile("#FFFFFF", "#FF8000")).toMatchObject({ ratio: "2.51", level: "Fail" });
  });

  test("keeps the notation when a color is removed", async () => {
    enterColors("hsl(30 100% 50%); Orange\nrgb(0, 0, 0); Black, deep\n#FFF\n");
    await expect.poll(rowHexes).toHaveLength(3);

    qs('.cg-contrast-grid__key-swatch--background[data-hex="#FFFFFF"] .cg-contrast-grid__key-swatch-remove').click();

    expect(textarea().value).toBe("hsl(30 100% 50%); Orange\nrgb(0, 0, 0); Black, deep\n");
    expect(rowHexes()).toEqual(["#FF8000", "#000000"]);
  });

  test("hides a level when its filter is unchecked", async () => {
    enterColors("#FFFFFF\n#FF8000\n#000000\n");
    await expect.poll(rowHexes).toHaveLength(3);

    const failFilter = qs("#cg-color-form__show-contrast--fail");
    failFilter.click();
    expect(tile("#FFFFFF", "#FF8000")).toMatchObject({ level: "Fail", visible: false });
    expect(tile("#000000", "#FF8000")).toMatchObject({ level: "AAA", visible: true });

    failFilter.click();
    expect(tile("#FFFFFF", "#FF8000").visible).toBe(true);
  });
});

describe("copy button", () => {
  test("copies the hex value of a color", async () => {
    enterColors("hsl(30 100% 50%); Orange\n#FFFFFF\n");
    await expect.poll(rowHexes).toEqual(["#FF8000", "#FFFFFF"]);
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    const button = qs('.cg-contrast-grid__key-swatch--foreground[data-hex="#FF8000"] .cg-contrast-grid__key-swatch-copy');
    button.click();

    expect(writeText).toHaveBeenCalledWith("#FF8000");
    await expect.poll(() => button.classList.contains("cg-contrast-grid__key-swatch-copy--done")).toBe(true);
    expect(qs(".cg-contrast-grid__status").textContent).toBe("Copied #FF8000");
  });
});

describe("suggestion button", () => {
  const suggestButton = (background, foreground) =>
    qs(".cg-contrast-grid__suggest", tileElement(background, foreground));

  test("adds a text color for the next level after the original", async () => {
    enterColors("#FFFFFF; White\n#FF8000; Orange\n#000000; Black\n");
    await expect.poll(rowHexes).toHaveLength(3);

    suggestButton("#FFFFFF", "#FF8000").click();
    await expect.poll(() => textarea().value).toBe(
      "#FFFFFF; White\n#FF8000; Orange\n#E97400; Orange (Large)\n#000000; Black\n",
    );
    expect(tile("#FFFFFF", "#E97400").level).toBe("Large");
  });

  test("steps on from Large without stacking the labels", async () => {
    suggestButton("#FFFFFF", "#E97400").click();

    await expect.poll(() => textarea().value).toMatch(/^#FFFFFF; White\n#FF8000; Orange\n#E97400; Orange \(Large\)\n#[0-9A-F]{6}; Orange \(AA\)\n#000000; Black\n$/);
    const aa = textarea().value.split("\n")[3].slice(0, 7);
    expect(tile("#FFFFFF", aa).level).toBe("AA");
  });

  test("is absent at AAA", () => {
    expect(suggestButton("#FFFFFF", "#000000").hidden).toBe(true);
  });

  test("is disabled when the next level is out of reach", async () => {
    enterColors("#767676\n#000000\n");
    await expect.poll(rowHexes).toEqual(["#767676", "#000000"]);

    const button = suggestButton("#767676", "#000000");
    expect(tile("#767676", "#000000").level).toBe("AA");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("AAA is out of reach on this background");

    button.click();
    expect(textarea().value).toBe("#767676\n#000000\n");
  });
});

describe("move buttons", () => {
  const moveButton = (colorset, hex, direction) =>
    qs(
      `.cg-contrast-grid__key-swatch--${colorset}[data-hex="${hex}"] .cg-contrast-grid__key-swatch-move[data-direction="${direction}"]`,
    );

  test("move a column and keep the focus on it", async () => {
    enterColors("#FFFFFF; White\n#FF8000; Orange\n#000000; Black\n");
    await expect.poll(rowHexes).toHaveLength(3);

    moveButton("foreground", "#FF8000", "right").click();

    expect(textarea().value).toBe("#FFFFFF; White\n#000000; Black\n#FF8000; Orange\n");
    expect(document.activeElement).toBe(moveButton("foreground", "#FF8000", "right"));
    expect(document.activeElement.getAttribute("aria-disabled")).toBe("true");
    expect(qs(".cg-contrast-grid__status").textContent).toBe("Orange moved to position 3 of 3");
  });

  test("move a row", () => {
    moveButton("background", "#FFFFFF", "down").click();

    expect(rowHexes()).toEqual(["#000000", "#FFFFFF", "#FF8000"]);
    expect(document.activeElement).toBe(moveButton("background", "#FFFFFF", "down"));
  });

  test("do nothing at the edge", () => {
    const up = moveButton("background", "#000000", "up");
    expect(up.getAttribute("aria-disabled")).toBe("true");

    up.click();
    expect(rowHexes()).toEqual(["#000000", "#FFFFFF", "#FF8000"]);
  });
});

describe("dragging", () => {
  const handle = (colorset, hex) =>
    qs(`.cg-contrast-grid__key-swatch--${colorset}[data-hex="${hex}"] .cg-contrast-grid__key-swatch-drag-handle`);
  const key = (colorset, hex) => qs(`.cg-contrast-grid__key-swatch--${colorset}[data-hex="${hex}"]`);

  function drag(from, to) {
    const start = from.getBoundingClientRect();
    from.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: start.x + 5, clientY: start.y + 5 }),
    );
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: to.x, clientY: to.y }));
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: to.x, clientY: to.y }));
  }

  test("moves a column past the one it is dropped on", async () => {
    enterColors("#FFFFFF; White\n#FF8000; Orange\n#000000; Black\n");
    await expect.poll(rowHexes).toEqual(["#FFFFFF", "#FF8000", "#000000"]);

    const target = key("foreground", "#000000").getBoundingClientRect();
    drag(handle("foreground", "#FFFFFF"), { x: target.right - 2, y: target.top + 10 });

    expect(textarea().value).toBe("#FF8000; Orange\n#000000; Black\n#FFFFFF; White\n");
  });

  test("moves a row", () => {
    const target = key("background", "#FF8000").getBoundingClientRect();
    drag(handle("background", "#FFFFFF"), { x: target.left + 10, y: target.top + 2 });

    expect(rowHexes()).toEqual(["#FFFFFF", "#FF8000", "#000000"]);
  });

  test("leaves the order alone when dropped in place", () => {
    const before = textarea().value;
    const own = key("background", "#FFFFFF").getBoundingClientRect();
    drag(handle("background", "#FFFFFF"), { x: own.left + 10, y: own.top + own.height / 2 });

    expect(textarea().value).toBe(before);
  });
});

describe("keyboard access", () => {
  test("reaches the hidden controls and shows them on focus", async () => {
    enterColors("#FFFFFF\n#FF8000\n");
    await expect.poll(rowHexes).toHaveLength(2);

    const controls = qs(".cg-contrast-grid__key-swatch--foreground .cg-contrast-grid__key-swatch-controls");
    expect(getComputedStyle(controls).opacity).toBe("0");

    qs(".cg-contrast-grid__key-swatch-copy", controls).focus();
    expect(document.activeElement.classList).toContain("cg-contrast-grid__key-swatch-copy");
    expect(getComputedStyle(controls).opacity).toBe("1");
  });

  test("offers targets of at least 24 by 24 pixels", () => {
    for (const target of qsa(".cg-contrast-grid__key-swatch-action, .cg-contrast-grid__suggest:not([hidden])")) {
      const { width, height } = target.getBoundingClientRect();
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(24);
    }
  });
});

describe("swap button", () => {
  const swap = () => qs(".cg-color-form__swap");
  const columnHexes = () => qsa(".cg-contrast-grid__key-swatch--foreground").map((s) => s.dataset.hex);
  const rows = () => qs("#cg-color-form__background-colors");

  test("is hidden while rows and columns share one list", () => {
    expect(swap().offsetParent).toBeNull();
  });

  test("swaps rows and columns", async () => {
    qs(".cg-color-form__show-background-colors").click();
    expect(swap().offsetParent).not.toBeNull();

    rows().value = "#000000; Black\n";
    enterColors("#FFFFFF; White\n#FF8000; Orange\n");
    await expect.poll(rowHexes).toEqual(["#000000"]);
    expect(columnHexes()).toEqual(["#FFFFFF", "#FF8000"]);

    swap().click();

    expect(rows().value).toBe("#FFFFFF; White\n#FF8000; Orange\n");
    expect(textarea().value).toBe("#000000; Black\n");
    expect(columnHexes()).toEqual(["#000000"]);
    expect(rowHexes()).toEqual(["#FFFFFF", "#FF8000"]);

    qs(".cg-color-form__hide-background-colors").click();
  });
});
