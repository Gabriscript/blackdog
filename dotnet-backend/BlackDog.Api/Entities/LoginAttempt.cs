// =============================================================================
// Tracks failed admin login attempts per (email + client IP).
// Cleared on successful login. Used for brute-force lockout.
// =============================================================================
namespace BlackDog.Api.Entities;

public class LoginAttempt
{
    public string   Identifier { get; set; } = string.Empty;   // "ip:email"
    public int      Attempts   { get; set; }
    public DateTime LastAt     { get; set; } = DateTime.UtcNow;
}
