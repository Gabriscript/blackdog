// =============================================================================
// EF Core DbContext — PostgreSQL via Npgsql.
// Configures column types, indexes and uniqueness constraints.
// =============================================================================
using BlackDog.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> opts) : DbContext(opts)
{
    public DbSet<User>          Users          => Set<User>();
    public DbSet<Room>          Rooms          => Set<Room>();
    public DbSet<Booking>       Bookings       => Set<Booking>();
    public DbSet<LoginAttempt>  LoginAttempts  => Set<LoginAttempt>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // -------------------- Users --------------------
        b.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Email).HasMaxLength(254).IsRequired();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.PasswordHash).HasMaxLength(200).IsRequired();
            e.Property(x => x.Role).HasMaxLength(20).IsRequired();
        });

        // -------------------- Rooms --------------------
        b.Entity<Room>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.PricePerHour).HasColumnType("numeric(10,2)");
        });

        // -------------------- Bookings --------------------
        b.Entity<Booking>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.CustomerName).HasMaxLength(200).IsRequired();
            e.Property(x => x.Email).HasMaxLength(254).IsRequired();
            e.Property(x => x.RoomName).HasMaxLength(100).IsRequired();
            e.Property(x => x.Status).HasMaxLength(20).IsRequired();
            e.Property(x => x.StripeCustomerId).HasMaxLength(100).IsRequired();
            e.Property(x => x.StripePaymentMethodId).HasMaxLength(100).IsRequired();
            e.Property(x => x.SetupIntentId).HasMaxLength(100);
            e.Property(x => x.PenaltyPaymentIntentId).HasMaxLength(100);
            e.Property(x => x.CancelToken).HasMaxLength(80);

            // Wall-clock Europe/Rome — stored without timezone. Values must be
            // DateTimeKind.Unspecified: Npgsql refuses Kind=Utc on these columns.
            e.Property(x => x.StartTime).HasColumnType("timestamp without time zone");
            e.Property(x => x.EndTime).HasColumnType("timestamp without time zone");
            e.Property(x => x.CreatedAt).HasColumnType("timestamp without time zone");

            // Indexes for common queries. No index on Status: three values,
            // Postgres would scan anyway.
            e.HasIndex(x => new { x.RoomId, x.StartTime });
            e.HasIndex(x => x.CancelToken).IsUnique();
            // One saved card, one booking (walk-ins have null, which unique allows).
            e.HasIndex(x => x.SetupIntentId).IsUnique();
            // No double booking even under concurrency: EX_Bookings_NoOverlap,
            // an exclusion constraint created by raw SQL in Migrations/.

            // Restrict, not the default cascade: deleting a room must not
            // silently take its booking and penalty history with it.
            e.HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // -------------------- LoginAttempts --------------------
        b.Entity<LoginAttempt>(e =>
        {
            e.HasKey(x => x.Identifier);
            e.Property(x => x.Identifier).HasMaxLength(300);
        });
    }
}
