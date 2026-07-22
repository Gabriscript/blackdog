# Black Dog — Sala Prove

Booking system for a rehearsal-room studio in Florence: three rooms, half-hour
slots from 10:00 to 01:00 the next day, no account required. Customers hold a
slot with a card that is only charged if they don't show up.

React frontend, ASP.NET Core 8 API, PostgreSQL.

---

## What it does

**Customers** pick a room, date and slot range on an interactive timeline that
shades the hours already taken, leave a name, an email and a card, and get a
confirmation email with a private link. That link is the only thing they need
to see or cancel their booking — no password, no account. Cancelling is free
up to a configurable cutoff before the slot starts.

**The studio owner** gets a dashboard grouped by room: filter by date and
status, cancel a booking, mark a walk-in as paid in cash, or flag a no-show.
Flagging a no-show is what charges the card — off-session, through Stripe, with
the exact amount the customer agreed to at booking time. Walk-in bookings taken
over the phone have no card attached and can never be charged.

## Design decisions worth explaining

**Times are stored as wall-clock, with no timezone.** A booking at 21:00 is at
21:00 in the studio, whatever the server thinks its own timezone is. Postgres
column type is `timestamp without time zone`, and every date-time leaving the
API goes through a single formatter — on an Italian Windows host,
`ToString("HH:mm:ss")` renders `18.00.00`, which `new Date()` in the browser
cannot parse. That bug is the reason `Services/Iso.cs` exists.

**The slot grid is integers, not dates.** Once availability reaches the browser
it becomes indices 0–30, where 0 is 10:00 and 30 is 01:00 the next day.
Overlap checks, clamping the selection to the first taken cell, and the 12-hour
maximum are all integer comparisons. The conversion back to a date happens once,
at submit. `frontend/src/lib/slots.js` holds this and is the only unit-tested
part of the frontend, because it is the only part with logic worth testing.

**The card is saved, not charged.** Booking creates a Stripe SetupIntent; the
payment method sits unused until an admin marks a no-show, possibly a week
later. The penalty amount is read from one config key that both the customer-
facing page and the charge path use, so what the customer agreed to and what
gets charged cannot drift apart.

**Validation runs cheapest-first.** Terms, room, date parsing, duration,
horizon, overlap — and only then Stripe. No external call is made to discover
that a date was malformed.

**Emails never break a booking.** Send failures are logged and swallowed. A
booking that exists must not be undone because a mail provider was down.

## Running it

```bash
docker compose up -d
```

Set the two required secrets (the app refuses to start without them, on
purpose — there is no default admin password baked into the binary):

```bash
cd dotnet-backend/BlackDog.Api && dotnet user-secrets set "Jwt:Secret" "$(openssl rand -hex 32)"
```

```bash
cd dotnet-backend/BlackDog.Api && dotnet user-secrets set "Admin:Password" "<a-password>"
```

Then the API and the frontend:

```bash
dotnet run --project dotnet-backend/BlackDog.Api
```

```bash
npm install --prefix frontend && npm start --prefix frontend
```

Frontend on `:3000`, API on `:5000`, Swagger at `/swagger`. Stripe runs in mock
mode by default (`Stripe:Mock=true`), so no keys are needed to try the full
booking flow, and with no Resend token configured emails are printed to the
console instead of sent.

Log in at `/admin` with `admin@blackdog.it` and the password you just set.

## Tests

```bash
dotnet test --project dotnet-backend/BlackDog.Api.Tests
```

```bash
npm test --prefix frontend -- --watchAll=false
```

The backend tests cover the booking rules — overlap, duration limits, booking
into the past, the cancellation cutoff, and the rule that a walk-in booking can
never be charged — against SQLite in-memory with Stripe in mock mode. The
frontend tests cover the slot grid, including midnight and month rollovers.

## Layout

```
dotnet-backend/BlackDog.Api/
  Controllers/     Public (booking + magic link), Auth, Admin
  Services/        BookingService — every business rule lives here
  Entities/        Booking, Room, User, LoginAttempt
frontend/src/
  pages/           LandingPage, BookingPage, MyBooking, AdminDashboard, …
  lib/slots.js     the half-hour grid, unit-tested
DESIGN.md          colours, type scale and layout rules
```

Configuration lives in `dotnet-backend/BlackDog.Api/appsettings.json` — booking
duration limits, how far ahead people can book, the cancellation cutoff and the
no-show penalty are all config, not code. Secret values are blank there by
design; see `dotnet-backend/README.md`.
