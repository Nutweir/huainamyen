import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests against a production build served by `vite preview`, in local mode (no backend needed).
 * Uses the installed Chrome locally; CI installs Playwright's Chromium (PW_CHANNEL unset there).
 */
const channel = process.env.CI ? undefined : process.env.PW_CHANNEL || "chrome";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5174/huainamyen/", trace: "retain-on-failure", channel },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "phone", use: { ...devices["Pixel 7"], channel }, testMatch: /public\.spec/ },
  ],
  webServer: {
    command: "npx vite build --outDir .tmp/e2e-dist --emptyOutDir && npx vite preview --outDir .tmp/e2e-dist --port 5174 --strictPort",
    url: "http://localhost:5174/huainamyen/",
    reuseExistingServer: !process.env.CI,
    env: { VITE_BACKEND: "local", VITE_BASE: "/huainamyen/" },
    timeout: 180_000,
  },
});
