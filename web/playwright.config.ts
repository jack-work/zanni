import pw from "@playwright/test";
const { defineConfig, devices } = pw;

const port = Number(process.env.PARITY_PORT ?? 4173);
const galleryPort = Number(process.env.GALLERY_PORT ?? 4174);

export default defineConfig({
  testDir: "parity",
  testMatch: /.*\.spec\.ts/,
  timeout: 90000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/parity-artifacts",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: [
    {
      command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: true,
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${galleryPort} --strictPort`,
      url: `http://127.0.0.1:${galleryPort}/gallery/index.html`,
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: "iphone15", use: { ...devices["iPhone 15"], viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "iphone15-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, userAgent: devices["iPhone 15"].userAgent } },
    { name: "desktop1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
