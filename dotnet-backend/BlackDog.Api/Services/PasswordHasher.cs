// =============================================================================
// Password hashing — BCrypt with default cost.
// Single class so the algorithm can be swapped without touching call sites.
// =============================================================================
namespace BlackDog.Api.Services;

public class PasswordHasher
{
    public string Hash(string plain) => BCrypt.Net.BCrypt.HashPassword(plain);

    public bool Verify(string plain, string hash)
    {
        try   { return BCrypt.Net.BCrypt.Verify(plain, hash); }
        catch { return false; }
    }
}
