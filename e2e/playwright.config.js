// @ts-check
// Full stack, no mocks between browser and database: Postgres + API come from
// stack.js, the frontend is the repo's dev server on :3001 (3000 may be busy).
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  workers: 1,               // one shared database; keeps runs deterministic
  retries: 0,
  globalTeardown: "./stack.js",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3001",
    channel: "msedge",      // the Edge already on Windows; no browser download
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node stack.js",
      url: "http://localhost:5000/api/",
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: "npm start --prefix ../frontend",
      url: "http://localhost:3001/",
      timeout: 180_000,
      reuseExistingServer: false,
      // Empty backend URL = same-origin /api through the dev server's proxy,
      // whatever the local frontend/.env says.
      env: { PORT: "3001", BROWSER: "none", REACT_APP_BACKEND_URL: "" },
    },
  ],
});
