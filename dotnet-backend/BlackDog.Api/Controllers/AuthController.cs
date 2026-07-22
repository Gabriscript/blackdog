// =============================================================================
// AuthController — admin login, current user, logout,
//                  change-password, forgot-password, reset-password.
// Brute-force protection: LOGIN_MAX_ATTEMPTS failures per "ip:email" → lockout.
// =============================================================================
using BlackDog.Api.Data;
using BlackDog.Api.Dtos;
using BlackDog.Api.Entities;
using BlackDog.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using System.Security.Claims;

namespace BlackDog.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext   _db;
    private readonly PasswordHasher _hasher;
    private readonly JwtService     _jwt;
    private readonly IConfiguration _cfg;

    public AuthController(AppDbContext db, PasswordHasher hasher, JwtService jwt, IConfiguration cfg)
    {
        _db = db; _hasher = hasher; _jwt = jwt; _cfg = cfg;
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/login
    // -------------------------------------------------------------------------
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var identifier = $"{ip}:{dto.Email.ToLowerInvariant()}";

        // Brute-force lockout
        var maxAttempts = _cfg.GetValue<int>("Auth:MaxLoginAttempts", 5);
        var lockoutMin  = _cfg.GetValue<int>("Auth:LockoutMinutes",   15);

        var attempt = await _db.LoginAttempts.FirstOrDefaultAsync(a => a.Identifier == identifier);
        if (attempt is not null && attempt.Attempts >= maxAttempts)
        {
            var lockedUntil = attempt.LastAt.AddMinutes(lockoutMin);
            if (lockedUntil > DateTime.UtcNow)
            {
                var wait = Math.Max(1, (int)(lockedUntil - DateTime.UtcNow).TotalMinutes + 1);
                return StatusCode(429, new { detail = $"Troppi tentativi falliti. Riprova tra circa {wait} minuti." });
            }
            // window expired → reset
            _db.LoginAttempts.Remove(attempt);
            attempt = null;
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == dto.Email.ToLowerInvariant());
        if (user is null || !_hasher.Verify(dto.Password, user.PasswordHash))
        {
            // Record failure
            if (attempt is null)
                _db.LoginAttempts.Add(new LoginAttempt { Identifier = identifier, Attempts = 1, LastAt = DateTime.UtcNow });
            else
            { attempt.Attempts++; attempt.LastAt = DateTime.UtcNow; }
            await _db.SaveChangesAsync();
            return Unauthorized(new { detail = "Credenziali non valide" });
        }

        // Success → clear failures, issue token
        if (attempt is not null) _db.LoginAttempts.Remove(attempt);
        await _db.SaveChangesAsync();

        var token = _jwt.Issue(user.Id, user.Email, user.Role);
        Response.Cookies.Append("access_token", token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure   = false,
            Path     = "/",
            MaxAge   = TimeSpan.FromMinutes(_cfg.GetValue<int>("Jwt:ExpiresMinutes", 1440)),
        });

        return Ok(new LoginResponseDto(token, new UserDto(user.Id, user.Email, user.Role)));
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/me
    // -------------------------------------------------------------------------
    [Authorize(Policy = "AdminOnly")]
    [HttpGet("me")]
    public IActionResult Me()
    {
        var id    = User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        var email = User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Email);
        var role  = User.FindFirstValue(ClaimTypes.Role);
        return Ok(new UserDto(Guid.Parse(id!), email ?? "", role ?? ""));
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/logout
    // -------------------------------------------------------------------------
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("access_token", new CookieOptions { Path = "/" });
        return Ok(new { ok = true });
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/change-password   [requires login]
    // -------------------------------------------------------------------------
    [Authorize(Policy = "AdminOnly")]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        var idStr = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (idStr is null || !Guid.TryParse(idStr, out var id))
            return Unauthorized();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return Unauthorized();

        if (!_hasher.Verify(dto.OldPassword, user.PasswordHash))
            return BadRequest(new { detail = "Password attuale non corretta." });

        user.PasswordHash = _hasher.Hash(dto.NewPassword);
        await _db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/forgot-password   [public]
    // Always returns 200 to prevent email enumeration.
    // If SMTP is not configured, the reset link is logged to the console.
    // -------------------------------------------------------------------------
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordDto dto,
        [FromServices] IEmailService emailSvc)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == dto.Email.ToLowerInvariant());

        if (user is not null)
        {
            // Generate a URL-safe token (22 chars)
            var raw   = Guid.NewGuid().ToByteArray();
            var token = Convert.ToBase64String(raw)
                               .Replace("+", "-").Replace("/", "_").TrimEnd('=');

            user.PasswordResetToken       = token;
            user.PasswordResetTokenExpiry = DateTime.UtcNow.AddHours(1);
            await _db.SaveChangesAsync();

            var origins = _cfg.GetSection("Cors:AllowedOrigins").Get<string[]>();
            var baseUrl = origins?.FirstOrDefault() ?? "http://localhost:3000";
            var link    = $"{baseUrl}/admin/reset-password?token={Uri.EscapeDataString(token)}";

            await emailSvc.SendAsync(
                user.Email,
                "Black Dog — Reimposta la password",
                $"""
                <p>Hai richiesto il reset della password per l'account admin di
                <strong>Black Dog Sala Prove</strong>.</p>
                <p><a href="{link}">Clicca qui per reimpostare la password</a></p>
                <p>Il link scade tra <strong>1 ora</strong>.
                Se non hai richiesto il reset, ignora questa email.</p>
                """);
        }

        return Ok(new { ok = true });
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/reset-password    [public]
    // -------------------------------------------------------------------------
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto dto)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.PasswordResetToken == dto.Token &&
            u.PasswordResetTokenExpiry > DateTime.UtcNow);

        if (user is null)
            return BadRequest(new { detail = "Link non valido o scaduto. Richiedi un nuovo reset." });

        user.PasswordHash             = _hasher.Hash(dto.NewPassword);
        user.PasswordResetToken       = null;
        user.PasswordResetTokenExpiry = null;
        await _db.SaveChangesAsync();

        return Ok(new { ok = true });
    }
}
