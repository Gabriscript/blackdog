// =============================================================================
// JwtService — issue and (implicitly) validate admin tokens.
// Validation is wired in Program.cs via AddJwtBearer; this class only ISSUES.
// =============================================================================
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace BlackDog.Api.Services;

public class JwtService
{
    private readonly string _secret;
    private readonly int    _expiresMinutes;

    public JwtService(IConfiguration cfg)
    {
        _secret         = cfg["Jwt:Secret"] is { } s && !string.IsNullOrWhiteSpace(s) ? s
                          : throw new InvalidOperationException("Missing Jwt:Secret");
        _expiresMinutes = cfg.GetValue<int?>("Jwt:ExpiresMinutes") ?? 1440;
    }

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
