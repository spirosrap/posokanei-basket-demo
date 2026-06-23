import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const stripSameOriginCrossorigin = () => ({
  name: "strip-same-origin-crossorigin",
  enforce: "post",
  transformIndexHtml(html) {
    return html.replaceAll(" crossorigin", "");
  },
});

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/demo/posokanei-basket/" : "/",
  build: {
    target: ["es2019", "safari14"],
  },
  plugins: [react(), stripSameOriginCrossorigin()],
}));
