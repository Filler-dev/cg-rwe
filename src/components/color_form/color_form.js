import { qs, qsa, debounce } from "../../scripts/dom.js";
import { EVENTS, emit, on } from "../../scripts/events.js";
import { colorsToText, parseColorInput } from "./color_input.js";
import template from "./color_form.html?raw";

const HIDE_PARAM = "hide";

// Stripped before a new level is appended, so labels never read "Orange (Large) (AA)".
const LEVEL_SUFFIX = /\s*\((Large|AA|AAA)\)$/;

// Keep in sync with the min/max attributes in color_form.html.
const MIN_TILE_SIZE = 45;
const MAX_TILE_SIZE = 300;
const DEFAULT_TILE_SIZE = 80;

function normalizeTileSize(raw) {
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return DEFAULT_TILE_SIZE;
  }

  return Math.min(MAX_TILE_SIZE, Math.max(MIN_TILE_SIZE, Math.round(value)));
}

class ColorFormElement extends HTMLElement {
  #form;
  #foregroundInput;
  #backgroundInput;
  #tileSizeInput;
  #tileSizeNumber;
  #foregroundColors = [];
  #backgroundColors = [];

  connectedCallback() {
    this.innerHTML = template;

    this.#form = qs(".cg-color-form", this);
    this.#foregroundInput = qs("#cg-color-form__foreground-colors", this);
    this.#backgroundInput = qs("#cg-color-form__background-colors", this);
    this.#tileSizeInput = qs("#cg-color-form__tile-size", this);
    this.#tileSizeNumber = qs("#cg-color-form__tile-size-number", this);

    this.#bindEvents();
  }

  // Called once every component is upgraded, so the grid is already listening.
  start() {
    this.#loadFromUrl();
    this.#broadcastValues();
    this.#broadcastTileSize();
  }

  #bindEvents() {
    const onType = debounce(() => this.#broadcastValues(), 500);
    this.#foregroundInput.addEventListener("input", onType);
    this.#backgroundInput.addEventListener("input", onType);

    on(EVENTS.removeColor, (hex, colorset) => this.#removeColor(hex, colorset));
    on(EVENTS.suggestColor, (original, hex, level) =>
      this.#addSuggestion(original, hex, level),
    );
    on(EVENTS.columnsSorted, (order) => this.#sortForeground(order));
    on(EVENTS.rowsSorted, (order) => this.#sortBackground(order));

    qsa(
      ".cg-color-form__show-background-colors, .cg-color-form__hide-background-colors",
      this,
    ).forEach((link) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.#toggleBackgroundInput();
        this.#broadcastValues();
      }),
    );

    qs(".cg-color-form__swap", this).addEventListener("click", () => {
      [this.#foregroundInput.value, this.#backgroundInput.value] = [
        this.#backgroundInput.value,
        this.#foregroundInput.value,
      ];
      this.#broadcastValues();
    });

    // Dragging fires continuously, so keep the history write off the hot path.
    const onTileSizeSettled = debounce(() => this.#updateUrl(), 300);

    this.#tileSizeInput.addEventListener("input", () => {
      this.#applyTileSize(normalizeTileSize(this.#tileSizeInput.value));
      onTileSizeSettled();
    });

    // Clamping while typing would fight the user, so only react to a value
    // that is already in range and tidy up on blur.
    this.#tileSizeNumber.addEventListener("input", () => {
      const value = Number(this.#tileSizeNumber.value);
      if (value >= MIN_TILE_SIZE && value <= MAX_TILE_SIZE) {
        this.#applyTileSize(Math.round(value), { syncNumber: false });
        onTileSizeSettled();
      }
    });

    this.#tileSizeNumber.addEventListener("change", () => {
      this.#applyTileSize(normalizeTileSize(this.#tileSizeNumber.value));
      onTileSizeSettled();
    });

    qsa(".cg-color-form__level-toggle", this).forEach((input) =>
      input.addEventListener("change", () => {
        qs("cg-contrast-grid").addAccessibilityToSwatches();
        this.#updateUrl();
      }),
    );

    // Chromium only, so the buttons stay hidden unless the API is there.
    const supportsEyeDropper = "EyeDropper" in window;
    qsa(".cg-color-form__eyedropper", this).forEach((button) => {
      button.hidden = !supportsEyeDropper;
      button.addEventListener("click", () => this.#pickFromScreen(button));
    });
  }

  async #pickFromScreen(button) {
    let picked;

    try {
      picked = await new window.EyeDropper().open();
    } catch {
      return; // The picker was dismissed.
    }

    const textarea = qs("#" + button.dataset.target, this);
    const hex = picked.sRGBHex.toUpperCase();

    if (parseColorInput(textarea.value).some((color) => color.hex === hex)) {
      return;
    }

    const existing = textarea.value.replace(/\s+$/, "");
    textarea.value = (existing ? existing + "\n" : "") + hex + "\n";
    this.#broadcastValues();
  }

  #getGridData() {
    this.#foregroundColors = parseColorInput(this.#foregroundInput.value);
    this.#backgroundColors = parseColorInput(this.#backgroundInput.value);

    return {
      foregroundColors: this.#foregroundColors,
      backgroundColors: this.#backgroundColors,
    };
  }

  #broadcastValues() {
    emit(EVENTS.colorFormValuesChanged, this.#getGridData());
    this.#updateUrl();
  }

  #applyTileSize(size, { syncNumber = true } = {}) {
    this.#tileSizeInput.value = size;

    if (syncNumber) {
      this.#tileSizeNumber.value = size;
    }

    emit(EVENTS.tileSizeChanged, size);
  }

  #broadcastTileSize() {
    this.#applyTileSize(normalizeTileSize(this.#tileSizeInput.value));
  }

  #updateUrl() {
    const params = new URLSearchParams(new FormData(this.#form));

    const hidden = qsa(".cg-color-form__level-toggle", this)
      .filter((input) => !input.checked)
      .map((input) => input.dataset.level);

    if (hidden.length > 0) {
      params.set(HIDE_PARAM, hidden.join(","));
    }

    window.history.pushState(null, "", "/?" + params.toString());
  }

  #setInputText(inputName, text) {
    qs("#cg-color-form__" + inputName + "-colors", this).value = text;
  }

  #removeColor(hex, colorset) {
    if (colorset === "background" && this.#backgroundColors.length === 0) {
      colorset = "foreground";
    }

    const colors =
      colorset === "background"
        ? this.#backgroundColors
        : this.#foregroundColors;

    this.#setInputText(
      colorset,
      colorsToText(colors.filter((c) => c.hex !== hex)),
    );
    this.#broadcastValues();
  }

  // Text colors are the columns, which always come from the foreground list.
  #addSuggestion(original, hex, level) {
    const colors = [...this.#foregroundColors];
    const index = colors.findIndex((color) => color.hex === original);
    const name = (colors[index].label ?? colors[index].source).replace(LEVEL_SUFFIX, "");

    colors.splice(index + 1, 0, { hex, source: hex, label: `${name} (${level})` });
    this.#setInputText("foreground", colorsToText(colors));
    this.#broadcastValues();
  }

  #sortByHexOrder(colors, order) {
    return order
      .map((hex) => colors.find((c) => c.hex === hex))
      .filter(Boolean);
  }

  #sortForeground(order) {
    this.#setInputText(
      "foreground",
      colorsToText(this.#sortByHexOrder(this.#foregroundColors, order)),
    );
    this.#broadcastValues();
  }

  #sortBackground(order) {
    const usesDistinctRows = this.#backgroundColors.length > 0;
    const source = usesDistinctRows
      ? this.#backgroundColors
      : this.#foregroundColors;

    this.#setInputText(
      usesDistinctRows ? "background" : "foreground",
      colorsToText(this.#sortByHexOrder(source, order)),
    );
    this.#broadcastValues();
  }

  #toggleBackgroundInput() {
    const label = qs("label[for='cg-color-form__foreground-colors']", this);
    const isShowing = this.#form.classList.toggle(
      "cg-color-form--show-background-colors-input",
    );

    if (!isShowing) {
      label.textContent = "Rows & Columns";
      this.#foregroundInput.dataset.persistedText = this.#foregroundInput.value;
      this.#foregroundInput.value = this.#backgroundInput.value;
      this.#backgroundInput.value = "";
      return;
    }

    label.textContent = "Columns";

    // Already populated when the state was restored from the URL.
    if (this.#backgroundInput.value.length === 0) {
      this.#backgroundInput.value = this.#foregroundInput.value;
    }
    if (this.#foregroundInput.dataset.persistedText !== undefined) {
      this.#foregroundInput.value = this.#foregroundInput.dataset.persistedText;
    }
  }

  #restoreFromQuery(params) {
    for (const [name, value] of params) {
      qsa(`[name="${CSS.escape(name)}"]`, this).forEach((field) => {
        field.value = value;
      });
    }
  }

  #loadFromUrl() {
    const params = new URLSearchParams(window.location.search.slice(1));

    this.#restoreFromQuery(params);

    // Showing everything is the default, so the URL only lists what is hidden.
    const hidden = (params.get(HIDE_PARAM) ?? "").split(",");
    qsa(".cg-color-form__level-toggle", this).forEach((input) => {
      input.checked = !hidden.includes(input.dataset.level);
    });

    if (this.#backgroundInput.value.length > 0) {
      this.#toggleBackgroundInput();
    }
  }
}

customElements.define("cg-color-form", ColorFormElement);
