import { defineConfig, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import viteConfig from "./vite.config.js";

export default mergeConfig(viteConfig, defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.js"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.js"],
          browser: {
            enabled: true,
            headless: true,
            // Locally the installed Chrome, in CI the Chromium Playwright downloads.
            provider: playwright({
              launchOptions: { channel: process.env.CI ? undefined : "chrome" },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
}));
