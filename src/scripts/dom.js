export const qs = (selector, scope = document) => scope.querySelector(selector);

export const qsa = (selector, scope = document) => [
  ...scope.querySelectorAll(selector),
];

export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) {
      handler(event, match);
    }
  });
}

export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
