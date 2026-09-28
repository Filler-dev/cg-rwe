export const EVENTS = {
  colorFormValuesChanged: "cg.colorFormValuesChanged",
  tileSizeChanged: "cg.tileSizeChanged",
  removeColor: "cg.removeColor",
  suggestColor: "cg.suggestColor",
  columnsSorted: "cg.columnsSorted",
  rowsSorted: "cg.rowsSorted",
};

export function emit(name, ...args) {
  document.dispatchEvent(new CustomEvent(name, { detail: args }));
}

export function on(name, handler) {
  document.addEventListener(name, (event) => handler(...(event.detail ?? [])));
}
