import Sortable from "sortablejs";
import { qs, qsa, delegate } from "../../scripts/dom.js";
import { EVENTS, emit, on } from "../../scripts/events.js";
import {
  cssColorToHex,
  getContrastRatioForHex,
  getLevel,
} from "./contrast.js";
import { getNextLevel, suggestTextColor } from "./suggest.js";
import template from "./contrast_grid.html?raw";

const COPIED_FEEDBACK_MS = 1500;

const MOVE_STEPS = { left: -1, up: -1, right: 1, down: 1 };

class ContrastGridElement extends HTMLElement {
  #grid;
  #gridContent;
  #foregroundKey;
  #status;
  #foregroundKeyCellTemplate;
  #contentRowTemplate;
  #contentCellTemplate;
  #showLabelsOnColumnKeys = false;
  #gridData;

  connectedCallback() {
    this.innerHTML = template;

    this.#grid = qs(".cg-contrast-grid", this);
    this.#gridContent = qs(".cg-contrast-grid__content", this);
    this.#foregroundKey = qs(".cg-contrast-grid__foreground-key", this);
    this.#status = qs(".cg-contrast-grid__status", this);

    this.#takeTemplates();
    this.#bindEvents();
    this.#enableDragUi();
  }

  addAccessibilityToSwatches() {
    const shown = this.#getVisibleLevels();

    qsa(".cg-contrast-grid__swatch", this).forEach((swatch) => {
      const contrast = parseFloat(
        qs(".cg-contrast-grid__contrast-ratio", swatch).textContent,
      );

      const level = getLevel(contrast);

      swatch.style.display = shown[level] ? "" : "none";

      const pill = qs(".cg-contrast-grid__accessibility-label", swatch);
      pill.textContent = level;
      pill.classList.add(
        "cg-contrast-grid__accessibility-label--" + level.toLowerCase(),
      );
    });
  }

  #takeTemplates() {
    const take = (id) => {
      const original = qs("#" + id, this);
      const clone = original.cloneNode(true);
      clone.removeAttribute("id");
      original.remove();
      return clone;
    };

    this.#contentCellTemplate = take("cg-contrast-grid__content-cell-template");
    this.#foregroundKeyCellTemplate = take(
      "cg-contrast-grid__foreground-key-cell-template",
    );
    this.#contentRowTemplate = take("cg-contrast-grid__content-row-template");
  }

  #bindEvents() {
    on(EVENTS.colorFormValuesChanged, (data) => this.#updateGrid(data));
    on(EVENTS.tileSizeChanged, (tileSize) => this.#changeTileSize(tileSize));

    delegate(
      this,
      "click",
      ".cg-contrast-grid__key-swatch-remove",
      (event, action) => {
        event.preventDefault();
        emit(EVENTS.removeColor, action.dataset.hex, action.dataset.colorset);
      },
    );

    delegate(this, "click", ".cg-contrast-grid__key-swatch-copy", (_, action) =>
      this.#copy(action),
    );

    delegate(this, "click", ".cg-contrast-grid__key-swatch-move", (_, action) =>
      this.#move(action),
    );

    delegate(this, "click", ".cg-contrast-grid__suggest", (_, action) =>
      this.#suggest(action.closest(".cg-contrast-grid__swatch")),
    );
  }

  async #copy(action) {
    const { hex } = action.dataset;

    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      this.#status.textContent = `Could not copy ${hex}`;
      return;
    }

    this.#status.textContent = `Copied ${hex}`;
    action.classList.add("cg-contrast-grid__key-swatch-copy--done");
    setTimeout(
      () => action.classList.remove("cg-contrast-grid__key-swatch-copy--done"),
      COPIED_FEEDBACK_MS,
    );
  }

  #suggest(tile) {
    const { foreground, background } = tile.dataset;
    const suggestion = suggestTextColor(foreground, background);
    if (!suggestion) {
      return;
    }

    if (this.#gridData.foregroundColors.some((c) => c.hex === suggestion.hex)) {
      this.#status.textContent = `${suggestion.hex} is already in the list`;
      return;
    }

    this.#status.textContent = `Added ${suggestion.hex} for ${suggestion.level}`;
    emit(EVENTS.suggestColor, foreground, suggestion.hex, suggestion.level);
  }

  #enableDragUi() {
    const shared = {
      animation: 150,
      ghostClass: "cg-drag-placeholder",
      dragClass: "cg-drag-helper",
      fallbackOnBody: true,
    };

    // Sortable only reorders the DOM; the grid is then rebuilt from the color
    // form, which is the single source of truth.
    const broadcast = (event, colorset) =>
      setTimeout(() => emit(event, this.#extractColors(colorset)), 0);

    Sortable.create(this.#gridContent, {
      ...shared,
      direction: "vertical",
      draggable: ".cg-contrast-grid__content-row",
      handle: ".cg-contrast-grid__key-swatch-drag-handle--row",
      onEnd: () => broadcast(EVENTS.rowsSorted, "background"),
    });

    Sortable.create(this.#foregroundKey, {
      ...shared,
      direction: "horizontal",
      draggable: ".cg-contrast-grid__foreground-key-cell",
      handle: ".cg-contrast-grid__key-swatch-drag-handle--column",
      onEnd: () => broadcast(EVENTS.columnsSorted, "foreground"),
    });
  }

  // A keyboard and single-click alternative to dragging (WCAG 2.1.1, 2.5.7).
  #move(action) {
    if (action.getAttribute("aria-disabled") === "true") {
      return;
    }

    const swatch = action.closest(".cg-contrast-grid__key-swatch");
    const colorset = swatch.classList.contains("cg-contrast-grid__key-swatch--foreground")
      ? "foreground"
      : "background";
    const { hex } = swatch.dataset;
    const { direction } = action.dataset;

    const order = this.#extractColors(colorset);
    const from = order.indexOf(hex);
    const to = from + MOVE_STEPS[direction];
    [order[from], order[to]] = [order[to], order[from]];

    // The grid is rebuilt synchronously, so the button has to be found again.
    emit(colorset === "foreground" ? EVENTS.columnsSorted : EVENTS.rowsSorted, order);
    qs(
      `.cg-contrast-grid__key-swatch--${colorset}[data-hex="${hex}"] .cg-contrast-grid__key-swatch-move[data-direction="${direction}"]`,
      this,
    )?.focus();

    this.#status.textContent = `${action.dataset.name} moved to position ${to + 1} of ${order.length}`;
  }

  #fillMoveActions(swatch, color, index, count) {
    const name = color.label ?? color.hex;

    qsa(".cg-contrast-grid__key-swatch-move", swatch).forEach((action) => {
      const { direction } = action.dataset;
      const target = index + MOVE_STEPS[direction];

      action.dataset.name = name;
      action.setAttribute("aria-label", `Move ${name} ${direction}`);
      action.setAttribute("aria-disabled", String(target < 0 || target >= count));
      action.title = `Move ${direction}`;
    });
  }

  #extractColors(colorset) {
    return qsa(`.cg-contrast-grid__key-swatch--${colorset}`, this).map(
      (swatch) => swatch.dataset.hex,
    );
  }

  #getForegroundColors() {
    return this.#gridData.foregroundColors;
  }

  #getBackgroundColors() {
    return this.#gridData.backgroundColors?.length
      ? this.#gridData.backgroundColors
      : this.#gridData.foregroundColors.slice(0);
  }

  #fillKeySwatch(swatch, hex, colorset) {
    swatch.style.backgroundColor = hex;
    swatch.dataset.hex = hex;

    const removeAction = qs(".cg-contrast-grid__key-swatch-remove", swatch);
    removeAction.dataset.hex = hex;
    removeAction.dataset.colorset = colorset;
    removeAction.setAttribute("aria-label", `Remove ${hex}`);

    const copyAction = qs(".cg-contrast-grid__key-swatch-copy", swatch);
    copyAction.dataset.hex = hex;
    copyAction.setAttribute("aria-label", `Copy ${hex}`);
    copyAction.title = `Copy ${hex}`;

    return {
      text: qs(".cg-contrast-grid__key-swatch-label-text", swatch),
      hex: qs(".cg-contrast-grid__key-swatch-label-hex", swatch),
    };
  }

  #generateForegroundKey() {
    const colors = this.#getForegroundColors();

    colors.forEach((color, index) => {
      const cell = this.#foregroundKeyCellTemplate.cloneNode(true);
      const swatch = qs(".cg-contrast-grid__key-swatch", cell);
      const label = color.label ?? color.hex;
      const labels = this.#fillKeySwatch(swatch, color.hex, "foreground");
      this.#fillMoveActions(swatch, color, index, colors.length);

      if (this.#showLabelsOnColumnKeys) {
        labels.text.textContent = label;
        if (color.hex !== label) {
          labels.hex.textContent = color.hex;
        }
      } else {
        labels.text.textContent = color.hex;
      }

      this.#foregroundKey.append(cell);
    });
  }

  #generateContentRows() {
    const foregroundColors = this.#getForegroundColors();
    const backgroundColors = this.#getBackgroundColors();

    backgroundColors.forEach((background, index) => {
      const row = this.#contentRowTemplate.cloneNode(true);
      const swatch = qs(".cg-contrast-grid__key-swatch", row);
      const label = background.label ?? background.hex;
      const labels = this.#fillKeySwatch(swatch, background.hex, "background");
      this.#fillMoveActions(swatch, background, index, backgroundColors.length);

      labels.text.textContent = label;
      if (label !== background.hex) {
        labels.hex.textContent = background.hex;
      }

      for (const foreground of foregroundColors) {
        const cell = this.#contentCellTemplate.cloneNode(true);

        if (background.hex === foreground.hex) {
          const spacer = document.createElement("div");
          spacer.className = "cg-contrast-grid__swatch-spacer";
          cell.replaceChildren(spacer);
        } else {
          const tile = qs(".cg-contrast-grid__swatch", cell);
          tile.style.backgroundColor = background.hex;
          tile.style.color = foreground.hex;
          tile.dataset.foreground = foreground.hex;
          tile.dataset.background = background.hex;
        }

        row.append(cell);
      }

      this.#gridContent.append(row);
    });
  }

  #getVisibleLevels() {
    const group = qs(".cg-color-form__checkbox-group");

    return {
      AAA: !!qs("#cg-color-form__show-contrast--aaa:checked", group),
      AA: !!qs("#cg-color-form__show-contrast--aa:checked", group),
      Large: !!qs("#cg-color-form__show-contrast--large:checked", group),
      Fail: !!qs("#cg-color-form__show-contrast--fail:checked", group),
    };
  }

  #markDarkLabel(element, backgroundColor) {
    const contrastWithWhite = getContrastRatioForHex("#FFFFFF", backgroundColor);

    if (contrastWithWhite === 1) {
      element.classList.add(
        "cg-contrast-grid--white-swatch",
        "cg-contrast-grid--dark-label",
      );
    } else if (contrastWithWhite === 21) {
      element.classList.add("cg-contrast-grid--black-swatch");
    } else if (contrastWithWhite < 4.0) {
      element.classList.add("cg-contrast-grid--dark-label");
    }
  }

  #addContrastToSwatches() {
    qsa(".cg-contrast-grid__swatch", this).forEach((swatch) => {
      const styles = getComputedStyle(swatch);
      const backgroundColor = cssColorToHex(styles.backgroundColor);

      qs(".cg-contrast-grid__contrast-ratio", swatch).textContent =
        getContrastRatioForHex(cssColorToHex(styles.color), backgroundColor);

      this.#markDarkLabel(swatch, backgroundColor);
    });
  }

  // Only whether the next level is reachable; the search itself waits for a click.
  #prepareSuggestions() {
    qsa(".cg-contrast-grid__swatch", this).forEach((tile) => {
      const button = qs(".cg-contrast-grid__suggest", tile);
      const next = getNextLevel(tile.dataset.foreground, tile.dataset.background);

      button.hidden = !next;
      if (!next) {
        return;
      }

      const label = next.reachable
        ? `Add a text color that passes ${next.level}`
        : `${next.level} is out of reach on this background`;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-disabled", String(!next.reachable));
      button.title = label;
    });
  }

  #setKeySwatchLabelColors() {
    qsa(".cg-contrast-grid__key-swatch", this).forEach((swatch) =>
      this.#markDarkLabel(
        swatch,
        cssColorToHex(getComputedStyle(swatch).backgroundColor),
      ),
    );
  }

  #setGridUiStatus() {
    const singleColor =
      this.#gridData.foregroundColors.length <= 1 &&
      this.#gridData.backgroundColors.length <= 1;

    this.#grid.classList.toggle(
      "cg-contrast-grid--row-and-column-removal-disabled",
      singleColor,
    );
  }

  #reset() {
    qsa(".cg-contrast-grid__content-row", this).forEach((row) => row.remove());
    qsa(".cg-contrast-grid__foreground-key-cell", this).forEach((cell) =>
      cell.remove(),
    );
  }

  #generate() {
    this.#generateForegroundKey();
    this.#generateContentRows();
    this.#addContrastToSwatches();
    this.addAccessibilityToSwatches();
    this.#prepareSuggestions();
    this.#setKeySwatchLabelColors();
    this.#setGridUiStatus();
  }

  #updateGrid(data) {
    this.#gridData = data;
    this.#showLabelsOnColumnKeys = data.backgroundColors.length > 0;
    this.#reset();
    this.#generate();
  }

  #changeTileSize(size) {
    this.#grid.style.setProperty("--swatch-size", `${size}px`);
  }
}

customElements.define("cg-contrast-grid", ContrastGridElement);
