import assert from "node:assert/strict";
import test from "node:test";
import { resolveTheme } from "./theme.js";

test("explicit light and dark themes override the operating system", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("system theme follows the operating-system preference", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
});
