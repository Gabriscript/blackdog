// =============================================================================
// DTOs — request and response shapes for the public booking flow.
// Keep the field names identical to the FastAPI version so the existing
// React frontend works unchanged.
// =============================================================================
using System.ComponentModel.DataAnnotations;

namespace BlackDog.Api.Dtos;

public record SetupIntentDto(
    [Required, StringLength(200, MinimumLength = 1)] string CustomerName,
    [Required, EmailAddress]                          string Email);

public record BookingCreateDto(
    [Required, StringLength(200, MinimumLength = 1)] string CustomerName,
    [Required, EmailAddress]                          string Email,
    [Required]                                        string StartTime,           // ISO-8601
    [Required]                                        string EndTime,             // ISO-8601
    [Required]                                        Guid   RoomId,
    [Required]                                        string StripeCustomerId,
    [Required]                                        string StripePaymentMethodId,
    [Required]                                        string SetupIntentId,
                                                       bool   AcceptedTerms);

public record BookingResponseDto(
    Guid    Id,
    string  CustomerName,
    string  Email,
    string  StartTime,
    string  EndTime,
    Guid    RoomId,
    string  RoomName,
    string  Status,
    string  StripeCustomerId,
    string  StripePaymentMethodId,
    bool    PenaltyCharged,
    bool    Manual,
    bool    Paid,
    string  CreatedAt,
    // Filled in ONLY by POST /api/bookings — the magic link is handed to the
    // customer once, at creation. Null on every other endpoint so the token
    // never rides along in listings that have no use for it.
    string? CancelToken   = null,
    string? CancelUrlPath = null);

// Returned by GET /api/bookings/by-token/{token} — safe to expose to the customer.
public record BookingPublicDto(
    Guid    Id,
    string  CustomerName,
    string  Email,
    string  StartTime,
    string  EndTime,
    string  RoomName,
    string  Status,
    bool    CanCancel,
    int     CancelCutoffHours);

    

public record AvailabilitySlotDto(string StartTime, string EndTime);

public record StripeConfigDto(string PublishableKey, decimal Penalty, bool Mock);

public record RoomDto(Guid Id, string Name, decimal PricePerHour);

