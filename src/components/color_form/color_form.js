import { qs, qsa, debounce } from "../../scripts/dom.js";
import { EVENTS, emit, on } from "../../scripts/events.js";
import { findDuplicateLines, findInvalidLines, insertLineAfterColor, parseColorInput, removeColorLines, reorderColorLines} from "./color_input.js";
import template from "./color_form.html?raw";

const HIDE_PARAM = "hide";

const MAX_QUOTED_LENGTH = 40;

function quote(text) {
  const code = document.createElement("code");
  code.textContent =
    text.length > MAX_QUOTED_LENGTH ? text.slice(0, MAX_QUOTED_LENGTH - 1) + "…" : text;
  return code;
}

const listLines = (lines) => `${lines.slice(0, -1).join(", ")} and ${lines.at(-1)}`;

// Nodes rather than HTML, as the quoted lines are user input.
function describeLineProblems(invalid, duplicates) {
  const parts = [];

  if (invalid.length === 1) {
    parts.push(`Line ${invalid[0].line} is not a valid color: `, quote(invalid[0].text), ".");
  } else if (invalid.length > 1) {
    parts.push(`Lines ${listLines(invalid.map((entry) => entry.line))} are not valid colors.`);
  }

  const fix = invalid.find((entry) => entry.fix)?.fix;
  if (fix) {
    parts.push(" Separate the label with a semicolon: ", quote(fix), ".");
  }

  const gap = parts.length > 0 ? " " : "";
  if (duplicates.length === 1) {
    parts.push(`${gap}Line ${duplicates[0].line} repeats line ${duplicates[0].first}.`);
  } else if (duplicates.length > 1) {
    parts.push(`${gap}Lines ${listLines(duplicates.map((entry) => entry.line))} repeat earlier colors.`);
  }

  return parts;
}

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

    // Reads the form directly, so an edit still waiting for its debounce is not lost.
    window.addEventListener("pagehide", () => this.#updateUrl());

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
    this.#showInvalidLines(this.#foregroundInput);
    this.#showInvalidLines(this.#backgroundInput);

    return {
      foregroundColors: this.#foregroundColors,
      backgroundColors: this.#backgroundColors,
    };
  }

  #broadcastValues() {
    emit(EVENTS.colorFormValuesChanged, this.#getGridData());
    this.#updateUrl();
  }

  #showInvalidLines(textarea) {
    const invalid = findInvalidLines(textarea.value);

    textarea.setAttribute("aria-invalid", String(invalid.length > 0));
    qs(`#${textarea.id}-error`, this).replaceChildren(
      ...describeLineProblems(invalid, findDuplicateLines(textarea.value)),
    );
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

    // Replaced rather than pushed: Back leaves the page, and Forward returns to the latest state.
    window.history.replaceState(null, "", "/?" + params.toString());
  }

  // In the shared-list mode rows come from the foreground field too.
  #rowsInput() {
    return this.#backgroundColors.length > 0
      ? this.#backgroundInput
      : this.#foregroundInput;
  }

  #removeColor(hex, colorset) {
    const input =
      colorset === "background" ? this.#rowsInput() : this.#foregroundInput;

    input.value = removeColorLines(input.value, hex);
    this.#broadcastValues();
  }

  // Text colors are the columns, which always come from the foreground list.
  #addSuggestion(original, hex, level) {
    const color = this.#foregroundColors.find((c) => c.hex === original);
    const name = (color.label ?? color.source).replace(LEVEL_SUFFIX, "");

    this.#foregroundInput.value = insertLineAfterColor(
      this.#foregroundInput.value,
      original,
      `${hex}; ${name} (${level})`,
    );
    this.#broadcastValues();
  }

  #sortForeground(order) {
    this.#foregroundInput.value = reorderColorLines(this.#foregroundInput.value, order);
    this.#broadcastValues();
  }

  #sortBackground(order) {
    const input = this.#rowsInput();
    input.value = reorderColorLines(input.value, order);
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
