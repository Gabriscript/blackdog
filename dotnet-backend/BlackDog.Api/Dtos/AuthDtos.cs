// =============================================================================
// Authentication DTOs.
// =============================================================================
using System.ComponentModel.DataAnnotations;

namespace BlackDog.Api.Dtos;

// String limits mirror the column sizes in AppDbContext: an oversized value
// is a 400 here instead of a Postgres "value too long" 500 at SaveChanges.
public record LoginDto(
    [Required, EmailAddress, MaxLength(254)] string Email,
    [Required]                               string Password);

// Change password (must be authenticated)
public record ChangePasswordDto(
    [Required]               string OldPassword,
    [Required, MinLength(8)] string NewPassword);

// Password recovery
public record ForgotPasswordDto(
    [Required, EmailAddress, MaxLength(254)] string Email);

public record ResetPasswordDto(
    [Required]               string Token,
    [Required, MinLength(8)] string NewPassword);

// Admin walk-in booking — no card required.
public record AdminManualBookingCreateDto(
    [Required, StringLength(200, MinimumLength = 1)] string CustomerName,
    [EmailAddress, MaxLength(254)]                    string? Email,
    [Required]                                        string  StartTime,           // ISO-8601
    [Required]                                        string  EndTime,
    [Required]                                        Guid    RoomId,
                                                       bool    Paid);
