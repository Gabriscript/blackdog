# Black Dog — Backend .NET 8 (ASP.NET Core + EF Core + PostgreSQL)

Drop-in replacement for the FastAPI backend. **Same routes, same payloads** — the existing React frontend works unchanged.

> Built for local development on your machine (Visual Studio / Rider / VS Code).

---

## Stack

- **.NET 8 LTS** (ASP.NET Core Web API)
- **Entity Framework Core 8** with **Npgsql** provider
- **PostgreSQL 16**
- **Stripe.net** for payments (SetupIntent + off-session PaymentIntent)
- **BCrypt.Net-Next** for password hashing
- **JWT bearer** auth for admin
- **Swagger UI** at `/swagger`

## Project structure

```
BlackDog.Api/
├── BlackDog.Api.csproj
├── Program.cs                 ← DI, JWT, CORS, Swagger, startup
├── appsettings.json           ← edit your config here (see below)
├── Entities/                  ← User, Room, Booking, LoginAttempt
├── Data/
│   ├── AppDbContext.cs        ← EF Core mapping (column types, indexes)
│   └── SeedService.cs         ← creates admin + default rooms on first run
├── Dtos/                      ← request / response shapes
├── Services/
│   ├── PasswordHasher.cs      ← BCrypt
│   ├── JwtService.cs          ← issues admin tokens
│   ├── StripeService.cs       ← Stripe wrapper (mock mode supported)
│   └── BookingService.cs      ← ★ all business rules live here
└── Controllers/
    ├── AuthController.cs      ← /api/auth/{login,me,logout}
    ├── PublicController.cs    ← /api/{rooms,bookings,…}
    └── AdminController.cs     ← /api/admin/*  (JWT required)
docker-compose.yml             ← PostgreSQL container
```

## Where do I tweak business rules?

**`Services/BookingService.cs`** — booking duration min/max, horizon, timezone all read from `appsettings.json` under the `Booking` section.

**`appsettings.json` (Booking section):**
```json
"Booking": {
  "NoShowPenaltyEur":   20.00,    // ← penalty amount
  "MinDurationMinutes": 30,
  "MaxDurationHours":   12,
  "MaxHorizonDays":     180,
  "StudioTimezone":     "Europe/Rome"
}
```

**`Entities/Booking.cs`** — adjust the data model, allowed status values.

**`Controllers/AdminController.cs`** — endpoints the studio owner uses to mark bookings.

---

## First-time setup

### 1. Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Docker](https://docs.docker.com/get-docker/) (only to run PostgreSQL — skip if you have your own)

### 2. Start PostgreSQL

```bash
cd dotnet-backend
docker compose up -d
```

Postgres listens on `localhost:5432` with user/password/db all set to `blackdog`.

### 3. Configure secrets

**Never put secret values in `appsettings.json`** — that file is committed. The
secret keys are there with empty values as documentation only.

Local development uses **user-secrets**, which live in
`%APPDATA%\Microsoft\UserSecrets\<id>\secrets.json` (Linux/macOS:
`~/.microsoft/usersecrets/…`) — outside the repository, so they cannot be
committed by accident:

```bash
cd BlackDog.Api
dotnet user-secrets set "Jwt:Secret" "<random-64-char-hex>"   # openssl rand -hex 32
dotnet user-secrets set "Admin:Password" "<password>"
```

Those two are **required** — the app refuses to start without them, with a
message telling you which one is missing. A default admin password baked into
the binary would be a known password on every deployment, so there isn't one.

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

User-secrets are Development-only and are simply not read in Production.

### 4. Run

```bash
cd BlackDog.Api
dotnet restore
dotnet run
```

The API starts on `https://localhost:5001` (or whatever Kestrel picks). Swagger UI: `https://localhost:5001/swagger`.

On first run, the schema is created automatically (`EnsureCreated`) and the admin user + default rooms are seeded.

### 5. Connect the React frontend

In the React project's `.env`:
```
REACT_APP_BACKEND_URL=https://localhost:5001
```

Make sure your `appsettings.json` `Cors:AllowedOrigins` includes the frontend URL.

---

## API contract (matches the FastAPI version)

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/`                            | health |
| GET    | `/api/config/stripe`               | publishable key + penalty + mock flag |
| GET    | `/api/rooms`                       | list rooms |
| GET    | `/api/bookings/availability?date=YYYY-MM-DD&roomId=GUID` | confirmed slots |
| POST   | `/api/bookings/setup-intent`       | save card |
| POST   | `/api/bookings`                    | create booking |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST   | `/api/auth/login`                  | admin login (5 fails → 15 min lockout) |
| GET    | `/api/auth/me`                     | current admin |
| POST   | `/api/auth/logout`                 | clears cookie |

### Admin (JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/admin/bookings?date&status`  | list with filters |
| POST   | `/api/admin/bookings/{id}/cancel`  | cancel (no charge) |
| POST   | `/api/admin/bookings/{id}/no-show` | mark no-show + charge 20 € |

### Booking state machine
```
   confirmed --(/cancel)----→ cancelled   (terminal, no charge)
              \(/no-show)---→ no-show     (terminal, penalty charged)
```

---

## Switching to EF Core migrations (production-ready)

The project uses `EnsureCreated()` for first-run convenience. To use real migrations:

1. Replace `await ctx.Database.EnsureCreatedAsync();` in `Program.cs` with:
   ```csharp
   await ctx.Database.MigrateAsync();
   ```
2. Generate the initial migration:
   ```bash
   cd BlackDog.Api
   dotnet ef migrations add Initial
   ```
3. The next `dotnet run` will apply it.

---

## Admin credentials (after first run)

- Email: `admin@blackdog.it` (`Admin:Email` in `appsettings.json` — not a secret)
- Password: whatever you set in `Admin:Password` (see *Configure secrets* above)

The seed service re-applies the configured password at **every** startup, so
changing the secret and restarting is how you rotate it. The flip side: a
password changed through the admin UI gets overwritten on the next restart
unless you update the secret too.

---

## Stripe in MOCK vs REAL mode

| `Stripe:Mock` | What happens |
|---------------|--------------|
| `true`        | All Stripe calls return fake IDs (`cus_mock_…`, `pi_mock_…`). No real charges. |
| `false`       | Uses `Stripe:ApiKey` to talk to Stripe. Required for real card collection and charges. |

Frontend reads `/api/config/stripe` and switches between Stripe Elements (real) and a mock card input (mock) automatically.
