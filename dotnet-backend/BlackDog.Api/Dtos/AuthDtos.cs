// =============================================================================
// Authentication DTOs.
// =============================================================================
using System.ComponentModel.DataAnnotations;

namespace BlackDog.Api.Dtos;

public record LoginDto(
    [Required, EmailAddress] string Email,
    [Required]                string Password);

public record LoginResponseDto(string Token, UserDto User);

public record UserDto(Guid Id, string Email, string Role);

// Change password (must be authenticated)
public record ChangePasswordDto(
    [Required] string OldPassword,
    [Required] string NewPassword);

// Password recovery
public record ForgotPasswordDto(
    [Required, EmailAddress] string Email);

public record ResetPasswordDto(
    [Required] string Token,
    [Required] string NewPassword);

// Admin walk-in booking — no card required.
public record AdminManualBookingCreateDto(
    [Required, StringLength(200, MinimumLength = 1)] string CustomerName,
    [EmailAddress]                                    string? Email,
    [Required]                                        string  StartTime,           // ISO-8601
    [Required]                                        string  EndTime,
    [Required]                                        Guid    RoomId,
                                                       bool    Paid);
