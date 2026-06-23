import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/demo/posokanei-basket/" : "/",
  build: {
    target: ["es2019", "safari14"],
  },
  plugins: [react()],
}));
