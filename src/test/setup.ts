import "@testing-library/jest-dom";

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

// jsdom doesn't implement URL.createObjectURL — stub for components
// that show local previews from File objects (e.g. DualPhotoCaptureSheet).
if (typeof URL.createObjectURL !== "function") {
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
    () => "blob:mock";
}
if (typeof URL.revokeObjectURL !== "function") {
  (URL as unknown as { revokeObjectURL: (s: string) => void }).revokeObjectURL =
    () => {};
}
