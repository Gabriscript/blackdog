// =============================================================================
// EF Core DbContext — PostgreSQL via Npgsql.
// Configures column types, indexes and uniqueness constraints.
// =============================================================================
using BlackDog.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> opts) : base(opts) { }

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

            // Wall-clock Europe/Rome — stored without timezone
            e.Property(x => x.StartTime).HasColumnType("timestamp without time zone");
            e.Property(x => x.EndTime).HasColumnType("timestamp without time zone");
            e.Property(x => x.CreatedAt).HasColumnType("timestamp without time zone");

            // Indexes for common queries
            e.HasIndex(x => new { x.RoomId, x.StartTime });
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.CancelToken).IsUnique();

            e.HasOne(x => x.Room).WithMany().HasForeignKey(x => x.RoomId);
        });

        // -------------------- LoginAttempts --------------------
        b.Entity<LoginAttempt>(e =>
        {
            e.HasKey(x => x.Identifier);
            e.Property(x => x.Identifier).HasMaxLength(300);
        });
    }
}
