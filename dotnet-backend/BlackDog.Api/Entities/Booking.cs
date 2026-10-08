// =============================================================================
// Booking entity — matches the data model requested by the studio owner.
//
// Status state machine:
//   confirmed --(/cancel) --> cancelled  (terminal, no charge)
//             \(/no-show)--> no-show     (terminal, Booking:NoShowPenalty charged)
//
// Times are stored as wall-clock Europe/Rome (DateTimeKind.Unspecified) in
// PostgreSQL `timestamp without time zone`. See AppDbContext for the column
// type configuration.
// =============================================================================
namespace BlackDog.Api.Entities;

public class Booking
{
    public Guid     Id                       { get; set; } = Guid.NewGuid();

    // Foreign key + navigation
    public Guid     RoomId                   { get; set; }
    public Room?    Room                     { get; set; }
    public string   RoomName                 { get; set; } = string.Empty; // denormalized for fast admin listing

    // Customer info (no full account needed)
    public string   CustomerName             { get; set; } = string.Empty;
    public string   Email                    { get; set; } = string.Empty;

    // Slot — naive wall-clock Europe/Rome
    public DateTime StartTime                { get; set; }
    public DateTime EndTime                  { get; set; }

    // Lifecycle
    public string   Status                   { get; set; } = BookingStatus.Confirmed;

    // Stripe — saved card via SetupIntent, charged later off-session if no-show
    public string   StripeCustomerId         { get; set; } = string.Empty;
    public string   StripePaymentMethodId    { get; set; } = string.Empty;
    public string?  SetupIntentId            { get; set; }

    // No-show penalty tracking
    public bool     PenaltyCharged           { get; set; }
    public string?  PenaltyPaymentIntentId   { get; set; }
    public string?  PenaltyStatus            { get; set; }
    public string?  PenaltyError             { get; set; }

    // Magic-link cancellation token. Generated at create-time, included in
    // the confirmation email, used by the customer to view/cancel their own
    // booking up to CustomerCancelCutoffHours before the slot starts.
    public string?  CancelToken              { get; set; }

    // Walk-in (admin) bookings — no card required.
    // Manual=true → no Stripe IDs, no magic link, "no-show" cannot be charged.
    // Paid=true   → admin marked the booking as paid in cash.
    public bool     Manual                   { get; set; }
    public bool     Paid                     { get; set; }

    public DateTime CreatedAt                { get; set; } = DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified);
}

// =============================================================================
// Allowed booking states. Edit this list (and the transitions in
// BookingService) to add new ones.
// =============================================================================
public static class BookingStatus
{
    public const string Confirmed = "confirmed";
    public const string Cancelled = "cancelled";
    public const string NoShow    = "no-show";
}
