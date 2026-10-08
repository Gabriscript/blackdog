// =============================================================================
// A password changed from the admin dashboard must actually change, and stay.
// Two bugs made "Cambia password" a no-op: the controller looked up the "sub"
// claim, which JwtBearer renames on the way in (always 401), and the seed
// re-applied the configured password at every restart.
// =============================================================================
using System.Security.Claims;
using System.Text;
using BlackDog.Api.Controllers;
using BlackDog.Api.Data;
using BlackDog.Api.Dtos;
using BlackDog.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.IdentityModel.Tokens;

namespace BlackDog.Api.Tests;

public class AuthTests : IDisposable
{
    private static readonly string Secret = new('k', 64);

    private readonly SqliteConnection _conn = new("DataSource=:memory:");
    private readonly AppDbContext     _db;
    private readonly PasswordHasher   _hasher = new();
    private readonly IConfiguration   _cfg = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"]     = Secret,
            ["Admin:Email"]    = "admin@test.it",
            ["Admin:Password"] = "from-config",
        })
        .Build();

    public AuthTests()
    {
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private Task Seed() =>
        new SeedService(_db, _hasher, _cfg, NullLogger<SeedService>.Instance).RunAsync();

    private async Task<string> StoredHash() =>
        (await _db.Users.AsNoTracking().SingleAsync()).PasswordHash;

    [Fact]
    public async Task ChangePassword_works_with_a_token_validated_like_production()
    {
        await Seed();
        var admin = await _db.Users.SingleAsync();

        // Validate with JwtBearer's own defaults so the claims are exactly what
        // the controller sees behind [Authorize] in Program.cs.
        var token = new JwtService(_cfg).Issue(admin.Id, admin.Email, admin.Role);
        var validated = await new JwtBearerOptions().TokenHandlers.First().ValidateTokenAsync(token,
            new TokenValidationParameters
            {
                ValidateIssuer   = false,
                ValidateAudience = false,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            });
        Assert.True(validated.IsValid);

        var controller = new AuthController(_db, _hasher, new JwtService(_cfg), _cfg)
        {
            ControllerContext = new()
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(validated.ClaimsIdentity) },
            },
        };

        var result = await controller.ChangePassword(new ChangePasswordDto("from-config", "changed-in-ui"));

        Assert.IsType<OkObjectResult>(result);
        Assert.True(_hasher.Verify("changed-in-ui", await StoredHash()));
    }

    [Fact]
    public async Task Restart_does_not_undo_a_password_changed_in_the_ui()
    {
        await Seed();
        var admin = await _db.Users.SingleAsync();
        admin.PasswordHash = _hasher.Hash("changed-in-ui");
        await _db.SaveChangesAsync();

        await Seed(); // next startup, config still says "from-config"

        Assert.True(_hasher.Verify("changed-in-ui", await StoredHash()));
    }
}
