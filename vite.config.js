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
  resolve: {
    alias: [
      { find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
      { find: "react-dom/test-utils", replacement: "preact/test-utils" },
      { find: "react-dom/client", replacement: "preact/compat/client" },
      { find: "react-dom", replacement: "preact/compat" },
      { find: "react", replacement: "preact/compat" },
    ],
  },
  define: {
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(packageJson.version),
  },
  build: {
    target: ["es2019", "safari14"],
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-v${packageJson.version}-[hash].js`,
      },
    },
  },
  plugins: [react(), stripSameOriginCrossorigin()],
}));

function normalizeBase(value) {
  const path = String(value || "/").replace(/^\/+|\/+$/g, "");
  return path ? `/${path}/` : "/";
}
