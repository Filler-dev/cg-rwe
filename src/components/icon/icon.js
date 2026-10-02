import arrowDownUp from "bootstrap-icons/icons/arrow-down-up.svg?raw";
import check from "bootstrap-icons/icons/check2.svg?raw";
import chevronDown from "bootstrap-icons/icons/chevron-down.svg?raw";
import chevronLeft from "bootstrap-icons/icons/chevron-left.svg?raw";
import chevronRight from "bootstrap-icons/icons/chevron-right.svg?raw";
import chevronUp from "bootstrap-icons/icons/chevron-up.svg?raw";
import copy from "bootstrap-icons/icons/copy.svg?raw";
import eyedropper from "bootstrap-icons/icons/eyedropper.svg?raw";
import gripHorizontal from "bootstrap-icons/icons/grip-horizontal.svg?raw";
import gripVertical from "bootstrap-icons/icons/grip-vertical.svg?raw";
import magic from "bootstrap-icons/icons/magic.svg?raw";
import xLg from "bootstrap-icons/icons/x-lg.svg?raw";

const SOURCES = {
  check,
  "chevron-down": chevronDown,
  "chevron-left": chevronLeft,
  "chevron-right": chevronRight,
  "chevron-up": chevronUp,
  close: xLg,
  copy,
  eyedropper,
  grip: gripVertical,
  "grip-horizontal": gripHorizontal,
  suggest: magic,
  swap: arrowDownUp,
};

// Drops width/height/fill so the icon takes its size and color from the CSS
// applied to the host element.
function normalize(source) {
  return source
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<svg\b[^>]*>/, (openTag) => {
      const viewBox = openTag.match(/viewBox="[^"]*"/)?.[0] ?? "";
      return `<svg xmlns="http://www.w3.org/2000/svg" ${viewBox} aria-hidden="true" focusable="false">`;
    });
}

class IconElement extends HTMLElement {
  connectedCallback() {
    const name = this.getAttribute("name");
    const source = SOURCES[name];

    if (!source) {
      throw new Error(`Unknown icon "${name}"`);
    }

    this.innerHTML = normalize(source);
  }
}

customElements.define("cg-icon", IconElement);
