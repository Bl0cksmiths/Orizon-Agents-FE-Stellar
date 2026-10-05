import { describe, expect, it } from "vitest";
import { classifyError } from "./error-recovery";

/** An Error with a given name, as browsers and webpack construct them. */
const named = (name: string, message: string) =>
  Object.assign(new Error(message), { name });

describe("classifyError", () => {
  describe("chunk: code from another deployment, or a script that never arrived", () => {
    it.each([
      [
        "webpack's ChunkLoadError",
        named(
          "ChunkLoadError",
          "Loading chunk 6137 failed.\n(error: https://orizons.xyz/_next/static/chunks/6137-de267f975f27b52e.js)",
        ),
      ],
      ["a ChunkLoadError by name alone", named("ChunkLoadError", "")],
      [
        "a CSS chunk",
        new Error("Loading CSS chunk 2117 failed.\n(/_next/static/css/a.css)"),
      ],
      [
        "Chrome's dynamic import",
        new TypeError(
          "Failed to fetch dynamically imported module: https://orizons.xyz/_next/static/chunks/x.js",
        ),
      ],
      [
        "Firefox's dynamic import",
        new TypeError(
          "error loading dynamically imported module: https://orizons.xyz/x.js",
        ),
      ],
      [
        "Safari's dynamic import",
        new TypeError("Importing a module script failed."),
      ],
      [
        "webpack's missing module factory (Chrome)",
        new TypeError("Cannot read properties of undefined (reading 'call')"),
      ],
      [
        "webpack's missing module factory (Safari)",
        new TypeError("undefined is not an object (evaluating 'e[t].call')"),
      ],
    ])("%s", (_, error) => {
      expect(classifyError(error)).toBe("chunk");
    });
  });

  describe("network: the backend or the connection failed", () => {
    it.each([
      ["Chrome's fetch failure", new TypeError("Failed to fetch")],
      [
        "Firefox's fetch failure",
        new TypeError("NetworkError when attempting to fetch resource."),
      ],
      ["Safari's fetch failure", new TypeError("Load failed")],
      ["an aborted request", named("AbortError", "The operation was aborted.")],
      ["a timed-out request", named("TimeoutError", "signal timed out")],
      ["the API client's refusal", named("ApiError", "Backend error 502")],
    ])("%s", (_, error) => {
      expect(classifyError(error)).toBe("network");
    });
  });

  describe("render: anything else is a fault in the page itself", () => {
    it.each([
      [
        "a TypeError in a component",
        new TypeError("Cannot read properties of null (reading 'map')"),
      ],
      [
        "a DOM rewritten under React",
        named("NotFoundError", "Failed to execute 'removeChild' on 'Node'"),
      ],
      [
        "an error whose message merely mentions a chunk",
        new Error("chunk size must be positive"),
      ],
      ["a thrown string", "boom"],
      ["a thrown null", null],
      ["an error with no message", new Error()],
    ])("%s", (_, error) => {
      expect(classifyError(error)).toBe("render");
    });
  });
});
