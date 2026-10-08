// =============================================================================
// JwtService — issue and (implicitly) validate admin tokens.
// Validation is wired in Program.cs via AddJwtBearer; this class only ISSUES.
// =============================================================================
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace BlackDog.Api.Services;

public class JwtService(IConfiguration cfg)
{
    private readonly string _secret         = cfg["Jwt:Secret"]!;   // presence checked at startup (Program.cs)
    private readonly int    _expiresMinutes = cfg.GetValue("Jwt:ExpiresMinutes", 1440);

    public string Issue(Guid userId, string email, string role)
    {
        var key   = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub,   userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim(ClaimTypes.Role,               role),
        };

        var token = new JwtSecurityToken(
            claims:             claims,
            expires:            DateTime.UtcNow.AddMinutes(_expiresMinutes),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
