# Black Dog — backend (.NET 10)

ASP.NET Core 10 Web API · EF Core 10 + Npgsql (PostgreSQL 16) · Stripe.net ·
BCrypt · JWT. How to run it, the tests and the design rationale are in the
[root README](../README.md); this file is configuration only. Endpoints are
listed at the top of each controller and browsable at `/swagger` in
Development.

## Business rules

All of them live in `BlackDog.Api/Services/BookingService.cs` and read their
numbers from the `Booking` section of `appsettings.json`:

| Key | Default | Meaning |
|-----|---------|---------|
| `NoShowPenalty` | `20.00` | € charged on no-show — also the amount the booking page shows |
| `MinDurationMinutes` | `30` | shortest booking |
| `MaxDurationHours` | `12` | longest booking (duplicated in `frontend/src/lib/slots.js`) |
| `MaxHorizonDays` | `180` | how far ahead one can book |
| `CustomerCancelCutoffHours` | `5` | free self-cancel until this many hours before start |
| `PastStartGraceMinutes` | `30` | a walk-in may start slightly in the past |
| `StudioTimezone` | `Europe/Rome` | wall clock all times are stored in |

## Secrets

**Never put secret values in `appsettings.json`** — that file is committed. The
secret keys are there with empty values as documentation only.

Local development uses **user-secrets**, which live in
`%APPDATA%\Microsoft\UserSecrets\<id>\secrets.json` (Linux/macOS:
`~/.microsoft/usersecrets/…`) — outside the repository:

```bash
cd BlackDog.Api
dotnet user-secrets set "Jwt:Secret" "<random-64-char-hex>"   # openssl rand -hex 32
dotnet user-secrets set "Admin:Password" "<password>"
```

`Jwt:Secret` is required at every start. `Admin:Password` is required only
while the admin user does not exist: the seed creates it once and never
touches it again, so a password changed from the dashboard ("Cambia
password") or through "Password dimenticata?" survives restarts. Locked out
with no working email? Delete the admin row from `"Users"` and restart.

Optional, only if you leave mock mode: `Stripe:ApiKey`, `Stripe:PublishableKey`.

Do **not** set `Resend:ApiToken` as a user secret: user-secrets are loaded
*after* `appsettings.Development.json`, so it would override the empty value
that keeps local emails logged to the console instead of actually sent.

**Production** reads the same keys from environment variables, with `__`
(double underscore) in place of `:`:

```
Jwt__Secret, Admin__Password, Resend__ApiToken,
Stripe__ApiKey, Stripe__PublishableKey, ConnectionStrings__DefaultConnection
```

`Cors__AllowedOrigins__0` must be the public frontend URL: besides CORS, it is
the base of the links in the confirmation and password-reset emails.

Outside Development the app refuses to start without `Resend__ApiToken`:
without it every email, password-reset links included, would go to the logs.

## Behind Caddy

Production is one origin: Caddy serves the React build and proxies `/api` to
Kestrel on `localhost:5000` — see [`deploy/Caddyfile`](../deploy/Caddyfile),
which also sets HSTS, CSP and the cache headers.

- **Admin session**: an HttpOnly, `SameSite=Strict` cookie set by
  `/api/auth/login`, whose body carries no token. Its `Secure` flag follows
  the forwarded scheme, so it is set behind Caddy and off on plain-http localhost.
- **Client IP**: read from `X-Forwarded-For`, so the login lockout and the rate
  limit (`RateLimit:PerMinute`, default 10 req/min per IP on login, password
  reset, setup-intent, booking and cancel; then 429) are per visitor. Whoever
  connects is trusted, on purpose (a pinned loopback address would break a
  Dockerized API): safe because Kestrel binds localhost and Caddy overwrites
  any client-sent value. **Never publish port 5000** (in Docker:
  `127.0.0.1:5000:…` only).

## Stripe: mock vs real

`Stripe:Mock` is `true` only in `appsettings.Development.json`; everywhere
else it defaults to `false`, so a production deploy cannot silently take fake
card guarantees.

| `Stripe:Mock` | What happens |
|---------------|--------------|
| `true`  | Stripe calls return fake IDs (`cus_mock_…`, `pi_mock_…`). No real charges. The booking page shows a demo card field. |
| `false` | Uses `Stripe:ApiKey`. The customer and card stored on a booking are read from the verified SetupIntent, never from the request body. |

## Schema and migrations

The schema lives in `BlackDog.Api/Migrations/` and is applied at startup
(`MigrateAsync`). After changing the model, from the repo root:

```bash
dotnet ef migrations add <Name> --project dotnet-backend/BlackDog.Api
```

(EF tool: `dotnet tool install --global dotnet-ef`.) Never edit generated
migrations; custom SQL goes in an empty migration's `Up`/`Down`, like
`BookingNoOverlap` — a Postgres exclusion constraint (`btree_gist`) that makes
a double booking impossible even for two requests in the same millisecond. The
API turns a violation into a 409.

A database created before the switch to migrations (by the old
`EnsureCreated`) cannot be upgraded in place: recreate it once with
`docker compose down -v`, then `docker compose up -d`.

`MigrationTests` fails if the model changes without a migration (on deploy,
EF would otherwise refuse to migrate and the app would not start).

**Deploy and rollback**

- Each migration runs in a transaction: a failure leaves no half-applied
  schema and is not recorded in `__EFMigrationsHistory`.
- The database user must own the database. `btree_gist` is a trusted
  extension, so a non-superuser owner can install it (checked on PostgreSQL 16).
- The app migrates itself at startup, which is fine for one instance. With
  several instances, or a DBA-run deploy, apply the idempotent script first
  (startup then finds nothing pending):

  ```bash
  dotnet ef migrations script --idempotent -o migrate.sql --project dotnet-backend/BlackDog.Api
  ```

- Before production, rollback is `dotnet ef database update <PreviousMigration>`
  (`0` = empty database); every migration has a working `Down`. Once a migration
  has run in production it is frozen: fix forward with a new migration.
- Re-applying `BookingNoOverlap` on a database that already holds overlapping
  bookings fails with 23P01 and changes nothing: cancel the overlaps first.
