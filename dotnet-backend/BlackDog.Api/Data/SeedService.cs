// =============================================================================
// SeedService — runs at startup. Idempotent.
// Creates the default admin user (from appsettings) and the three default rooms
// if they do not already exist. Mirrors the FastAPI behaviour.
// =============================================================================
using BlackDog.Api.Entities;
using BlackDog.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Data;

public class SeedService
{
    private readonly AppDbContext   _db;
    private readonly PasswordHasher _hasher;
    private readonly IConfiguration _cfg;
    private readonly ILogger<SeedService> _log;

    public SeedService(AppDbContext db, PasswordHasher hasher, IConfiguration cfg, ILogger<SeedService> log)
    {
        _db = db; _hasher = hasher; _cfg = cfg; _log = log;
    }

    public async Task RunAsync()
    {
        // -------------------- Admin --------------------
        var adminEmail = (_cfg["Admin:Email"] ?? "admin@blackdog.it").ToLowerInvariant();

        // No fallback password on purpose: a default baked into the binary is a
        // known password on every deployment. Blank config must stop the app.
        var adminPassword = _cfg["Admin:Password"];
        if (string.IsNullOrWhiteSpace(adminPassword))
            throw new InvalidOperationException(
                "Admin:Password non configurata. In locale: dotnet user-secrets set \"Admin:Password\" \"<password>\". " +
                "In produzione: variabile d'ambiente Admin__Password.");

        var existing = await _db.Users.FirstOrDefaultAsync(u => u.Email == adminEmail);
        if (existing is null)
        {
            _db.Users.Add(new User
            {
                Email        = adminEmail,
                PasswordHash = _hasher.Hash(adminPassword),
                Role         = "admin",
            });
            _log.LogInformation("Seeded admin user: {Email}", adminEmail);
        }
        else if (!_hasher.Verify(adminPassword, existing.PasswordHash))
        {
            // Keep the password in sync with appsettings (matches FastAPI version)
            existing.PasswordHash = _hasher.Hash(adminPassword);
            _log.LogInformation("Updated admin password from configuration");
        }

        // -------------------- Rooms --------------------
        if (!await _db.Rooms.AnyAsync())
        {
            _db.Rooms.AddRange(
                new Room { Name = "Sala 1", PricePerHour = 15.00m },
                new Room { Name = "Sala 2", PricePerHour = 15.00m },
                new Room { Name = "Sala 3", PricePerHour = 15.00m });
            _log.LogInformation("Seeded 3 default rooms");
        }

        await _db.SaveChangesAsync();
    }
}
