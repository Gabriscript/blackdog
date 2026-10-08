# Black Dog — Rehearsal Studio Booking

A production booking system built for a real rehearsal studio in Florence:
customers book a room online with no account, the owner runs everything from a
private dashboard, and a card is held as a guarantee and charged only if the
customer doesn't show up.

**Stack:** React 19 · ASP.NET Core 10 (C# 14) · EF Core 10 · PostgreSQL 16 ·
Stripe · Resend · Playwright · Caddy

---

## At a glance

| | |
|---|---|
| **Customer site** | Interactive half-hour timeline per room, live availability, booking with a card guarantee, no sign-up |
| **Magic link** | Each confirmation email carries a private link to check the booking status or cancel it, from any device |
| **Owner dashboard** | Bookings by room, filters by date and status, cancel, walk-ins paid in cash, no-show flagging |
| **Payments** | Stripe SetupIntent: the card is saved, never charged at booking; the no-show fee is charged off-session only when the owner confirms it |
| **Security** | HttpOnly `SameSite=Strict` session cookie, per-IP rate limiting, login lockout, server-side verification of every Stripe id, HTML-escaped emails |
| **Data integrity** | A PostgreSQL exclusion constraint makes double bookings impossible, even for two requests in the same millisecond |
| **Tests** | 23 backend (xUnit) · 27 frontend (Jest) · 7 end-to-end (Playwright on the full stack) |
| **Deploy** | Single origin behind Caddy on a VPS, EF Core migrations applied at startup |

## What it does

**Customers** pick a room, a date and a slot range on a timeline that shades the
hours already taken, leave a name, an email and a card, and receive a
confirmation email with a private link. That link is all they need to see or
cancel the booking. Cancelling is free up to a configurable cutoff before the
slot starts.

**The studio owner** gets a dashboard grouped by room, today onward by default,
with past bookings one filter away: cancel a booking, record a walk-in taken
over the phone, mark it as paid in cash, or flag a no-show. Flagging a no-show
is the only thing that charges a card: off-session, through Stripe, for the
exact amount the customer agreed to. Walk-ins have no card and can never be
charged.

## Engineering decisions worth a look

**Double bookings are impossible at the database level.** An application-side
"is this slot free?" check races: two requests can both see the slot free and
both insert. The schema has a `btree_gist` exclusion constraint on
`(room, tsrange(start, end))` for non-cancelled bookings, so the second insert
fails, and the API turns that into a clean 409 that the frontend answers by
refreshing the timeline. An E2E test reproduces exactly this race.

**The card is saved, not charged.** Booking creates a Stripe SetupIntent; the
payment method sits unused until the owner marks a no-show, possibly a week
later. The customer and card attached to a booking are read from the verified
SetupIntent on the server, never trusted from the request body, and each
SetupIntent can back only one booking. The no-show charge carries an
idempotency key, so a double click cannot charge twice.

**The admin token never touches JavaScript.** The session lives in an HttpOnly,
`SameSite=Strict` cookie; the login response carries no token and nothing is
kept in `localStorage`, so an XSS cannot steal the session. Frontend and API
share one origin behind Caddy, which also removes CORS from the picture.

**Times are wall-clock, not UTC.** A booking at 21:00 is at 21:00 in the
studio, whatever timezone the server runs in. Booking times are
`timestamp without time zone`; audit times are `timestamptz`. Every date leaving
the API goes through one formatter. On an Italian Windows host
`ToString("HH:mm:ss")` renders `18.00.00`, which the browser cannot parse, and
that bug is why `Services/Iso.cs` exists.

**The slot grid is integers, not dates.** In the browser, availability becomes
indices 0–30 (0 = 10:00, 30 = 01:00 the next day). Overlap checks, clamping a
selection to the first taken cell and the 12-hour maximum are integer
comparisons; the conversion back to dates happens once, at submit
(`frontend/src/lib/slots.js`, unit-tested across midnight and month rollovers).

**Validation runs cheapest-first.** Terms, room, date parsing, duration,
horizon, overlap, and only then Stripe: no external call is made to find out a
date was malformed.

**Emails never break a booking.** Send failures are logged and swallowed: a
booking that exists must not be undone because the mail provider was down. In
Development, emails are printed to the console instead of sent; in Production
the app refuses to start without a mail token, so a password-reset link can
never end up in a log.

**Business rules are configuration.** Duration limits, booking horizon,
cancellation cutoff and no-show fee live in `appsettings.json`, and the fee
the customer sees and the fee that gets charged come from the same key.

## Run it locally

Needs the .NET 10 SDK, Node 20+ and Docker. Stripe runs in mock mode in
Development, so no keys are needed to try the full flow.

```bash
docker compose up -d
```

The app refuses to start without a signing key and an initial admin password:
there is no default credential baked into the binary.

```bash
cd dotnet-backend/BlackDog.Api && dotnet user-secrets set "Jwt:Secret" "$(openssl rand -hex 32)"
```

```bash
cd dotnet-backend/BlackDog.Api && dotnet user-secrets set "Admin:Password" "<a-password>"
```

```bash
dotnet run --project dotnet-backend/BlackDog.Api
```

```bash
npm ci --prefix frontend && npm start --prefix frontend
```

Frontend on `:3000` (it proxies `/api` to the API on `:5000`), Swagger at
`:5000/swagger`. Log in at `/admin` with `admin@blackdog.it` and the password
you set.

## Tests

```bash
dotnet test dotnet-backend/BlackDog.Api.Tests
```

```bash
npm test --prefix frontend -- --watchAll=false
```

```bash
npm ci --prefix e2e && npm test --prefix e2e
```

- **Backend**: the booking rules (overlap, duration limits, booking into the
  past, the cancellation cutoff, walk-ins never charged, SetupIntent reuse),
  HTML escaping in emails, the admin password change surviving a restart, and
  a guard that fails if the model changes without a migration.
- **Frontend**: the slot grid, and the mapping of the API's two error shapes
  to user-facing messages.
- **End-to-end**: a customer books and cancels from the magic link, loses a
  slot race (409), the owner logs in, filters, cancels and logs out, and a
  forged session is rejected. The suite starts its own throwaway Postgres
  (`:55432`), API (`:5000`) and frontend (`:3001`) and removes them afterwards.

## Deploy

One VPS, one domain: Caddy serves the frontend build and proxies `/api` to the
API on `localhost:5000`, with automatic HTTPS, security headers and cache rules
for hashed bundles. The site block is [`deploy/Caddyfile`](deploy/Caddyfile);
environment variables and migration/rollback notes are in
[`dotnet-backend/README.md`](dotnet-backend/README.md).

## Layout

```
dotnet-backend/BlackDog.Api/
  Controllers/     Public (booking + magic link), Auth, Admin
  Services/        BookingService (every business rule), Stripe, email, JWT
  Migrations/      EF Core schema, including the no-overlap constraint
dotnet-backend/BlackDog.Api.Tests/
frontend/src/
  pages/           LandingPage, BookingPage, MyBooking, AdminDashboard, …
  lib/             API client, half-hour slot grid
e2e/               Playwright suite on the full stack
deploy/Caddyfile   production reverse proxy
DESIGN.md          colours, type scale and layout rules
```
