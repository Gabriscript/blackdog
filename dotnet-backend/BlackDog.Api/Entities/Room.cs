// =============================================================================
// Room entity — a bookable rehearsal room
// Add new rooms by inserting rows or extending the SeedService.
// =============================================================================
namespace BlackDog.Api.Entities;

public class Room
{
    public Guid    Id           { get; set; } = Guid.NewGuid();
    public string  Name         { get; set; } = string.Empty;
    public decimal PricePerHour { get; set; }   // EUR per hour
}
