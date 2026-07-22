// =============================================================================
// User entity — admin login (single role for now; easy to extend)
// =============================================================================
namespace BlackDog.Api.Entities;

public class User
{
    public Guid     Id           { get; set; } = Guid.NewGuid();
    public string   Email        { get; set; } = string.Empty;   // unique, lowercase
    public string   PasswordHash { get; set; } = string.Empty;   // BCrypt hash
    public string   Role         { get; set; } = "admin";        // admin | (future: customer)
    public DateTime  CreatedAt                { get; set; } = DateTime.UtcNow;
    public string?   PasswordResetToken       { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }
}
