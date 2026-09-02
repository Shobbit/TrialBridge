import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom implements no layout, so it has no `scrollIntoView`.
 *
 * Stubbed rather than guarded in the component: the real browsers this ships to
 * all have it, and wrapping the call in a `typeof` check would be defensive
 * code written for the test environment rather than for any user. Without this
 * the call throws inside `requestAnimationFrame`, where it surfaces as an
 * unhandled error that can mask genuine failures.
 */
Element.prototype.scrollIntoView = vi.fn();

/** Each test starts from a clean DOM, clean mocks and empty local storage. */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});
