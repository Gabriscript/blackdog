// =============================================================================
// The backend an e2e run talks to: a throwaway Postgres on :55432 and the API
// on :5000 in Development (Stripe mock, emails logged, never sent).
//   node stack.js  -> started by Playwright's webServer, killed at the end
//   require(...)   -> test constants; the default export removes the database
// =============================================================================
const { execSync, spawn } = require("child_process");
const path = require("path");

const PG = "bd-e2e-pg";
const ADMIN = { email: "admin@blackdog.it", password: "e2e-admin-password" }; // seeded into the throwaway DB
const API = "http://localhost:5000/api";

function removeDb() {
  try { execSync(`docker rm -f ${PG}`, { stdio: "ignore" }); } catch { /* not there */ }
}

if (require.main === module) {
  removeDb(); // leftover of an aborted run
  execSync(`docker run -d --rm --name ${PG} -p 55432:5432 -e POSTGRES_DB=blackdog ` +
           `-e POSTGRES_USER=blackdog -e POSTGRES_PASSWORD=blackdog postgres:16-alpine`, { stdio: "ignore" });

  // Over TCP, not the socket: during init the image runs a socket-only server
  // that would look ready and then restart under the API's feet.
  for (let i = 0; ; i++) {
    try {
      execSync(`docker exec ${PG} pg_isready -h 127.0.0.1 -U blackdog -d blackdog`, { stdio: "ignore" });
      break;
    } catch {
      if (i > 120) throw new Error("Postgres did not start");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }

  spawn("dotnet", ["run", "--project", path.join(__dirname, "..", "dotnet-backend", "BlackDog.Api")], {
    stdio: "inherit",
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Development",
      ConnectionStrings__DefaultConnection:
        "Host=localhost;Port=55432;Database=blackdog;Username=blackdog;Password=blackdog",
      Jwt__Secret: "e2e-only-signing-key-0123456789abcdef0123456789abcdef",
      Admin__Password: ADMIN.password,
      Resend__ApiToken: "",         // never send real email from a test run
      Stripe__Mock: "true",
      RateLimit__PerMinute: "1000", // every test request comes from 127.0.0.1
    },
  });
}

module.exports = removeDb; // globalTeardown
module.exports.ADMIN = ADMIN;
module.exports.API = API;
