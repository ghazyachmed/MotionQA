import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vitest/config";

// AI Assisted Logic
export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: "./tailwindConfig.ts" }), autoprefixer()],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
