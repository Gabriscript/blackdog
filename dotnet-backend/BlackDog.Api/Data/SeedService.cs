// =============================================================================
// SeedService — runs at startup. Idempotent.
// Creates the default admin user (from configuration) and the three default
// rooms if they do not already exist. Never touches an existing admin.
// =============================================================================
using BlackDog.Api.Entities;
using BlackDog.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Data;

public class SeedService(AppDbContext db, PasswordHasher hasher, IConfiguration cfg, ILogger<SeedService> log)
{
    public async Task RunAsync()
    {
        // -------------------- Admin --------------------
        var adminEmail = (cfg["Admin:Email"] ?? "admin@blackdog.it").ToLowerInvariant();

        // Create-only. Re-applying the configured password at every start used
        // to silently undo "Cambia password" and the reset link on the next
        // restart. Locked out? Delete the admin row and restart to re-seed.
        if (!await db.Users.AnyAsync(u => u.Email == adminEmail))
        {
            // No fallback password on purpose: a default baked into the binary is a
            // known password on every deployment. Blank config must stop the app.
            var adminPassword = cfg["Admin:Password"];
            if (string.IsNullOrWhiteSpace(adminPassword))
                throw new InvalidOperationException(
                    "Admin:Password non configurata. In locale: dotnet user-secrets set \"Admin:Password\" \"<password>\". " +
                    "In produzione: variabile d'ambiente Admin__Password.");

            db.Users.Add(new User
            {
                Email        = adminEmail,
                PasswordHash = hasher.Hash(adminPassword),
                Role         = "admin",
            });
            log.LogInformation("Seeded admin user: {Email}", adminEmail);
        }

        // -------------------- Rooms --------------------
        if (!await db.Rooms.AnyAsync())
        {
            db.Rooms.AddRange(
                new Room { Name = "Sala 1", PricePerHour = 15.00m },
                new Room { Name = "Sala 2", PricePerHour = 15.00m },
                new Room { Name = "Sala 3", PricePerHour = 15.00m });
            log.LogInformation("Seeded 3 default rooms");
        }

        await db.SaveChangesAsync();
    }
}
