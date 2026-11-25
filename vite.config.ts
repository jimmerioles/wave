import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/wave/" : "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        "case-study": "case-study.html",
      },
    },
  },
}));
