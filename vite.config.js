import { readFileSync } from "node:fs";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const stripSameOriginCrossorigin = () => ({
  name: "strip-same-origin-crossorigin",
  enforce: "post",
  transformIndexHtml(html) {
    return html.replaceAll(" crossorigin", "");
  },
});

export default defineConfig(({ command }) => ({
  base: command === "build" ? normalizeBase(process.env.VITE_APP_BASE || "/") : "/",
  define: {
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(packageJson.version),
  },
  build: {
    target: ["es2019", "safari14"],
  },
  plugins: [react(), stripSameOriginCrossorigin()],
}));

function normalizeBase(value) {
  const path = String(value || "/").replace(/^\/+|\/+$/g, "");
  return path ? `/${path}/` : "/";
}
