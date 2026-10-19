import "@testing-library/jest-dom";

if (typeof window !== "undefined") {
  // jsdom implements no layout, so scrolling APIs that every browser has are missing.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  window.scrollTo = (() => {}) as typeof window.scrollTo;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
