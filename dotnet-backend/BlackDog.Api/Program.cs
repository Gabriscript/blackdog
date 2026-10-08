// =============================================================================
// BLACK DOG — Sala Prove a Firenze · ASP.NET Core 10 entry point
// =============================================================================
// Sections (search the comment banners below to jump to a section):
//   1. CONFIGURATION       — read appsettings, DI registration
//   2. DATABASE            — EF Core + PostgreSQL
//   3. AUTHENTICATION      — JWT bearer for admin
//   4. CORS & SWAGGER      — middleware
//   5. STARTUP HOOKS       — migrations + seed (admin & rooms)
//   6. PIPELINE            — middleware order, error → { detail } mapping
// =============================================================================

using System.Text;
using System.Threading.RateLimiting;
using BlackDog.Api.Data;
using BlackDog.Api.Services;
using Resend;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// =============================================================================
// 1. CONFIGURATION
// =============================================================================
// Secrets are deliberately blank in appsettings.json (that file is committed).
// They arrive from user-secrets in Development or environment variables in
// Production — so check for blank, not just null, or an empty string sails
// through and we boot with no signing key.
var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret))
    throw new InvalidOperationException(
        "Jwt:Secret non configurato. In locale: dotnet user-secrets set \"Jwt:Secret\" \"<32+ caratteri>\". " +
        "In produzione: variabile d'ambiente Jwt__Secret.");

// Without a token EmailService logs every email instead of sending it —
// password-reset links included. Fine on a laptop, a takeover anywhere else.
if (!builder.Environment.IsDevelopment() &&
    string.IsNullOrWhiteSpace(builder.Configuration["Resend:ApiToken"]))
    throw new InvalidOperationException(
        "Resend:ApiToken non configurato: senza, le email (link di reset password compresi) " +
        "finirebbero nei log. In produzione: variabile d'ambiente Resend__ApiToken.");

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
    throw new InvalidOperationException("Missing ConnectionStrings:DefaultConnection");

builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.SnakeCaseLower;
    });
builder.Services.AddEndpointsApiExplorer();

// Application services (singletons / scoped)
builder.Services.AddSingleton<PasswordHasher>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<StripeService>();
builder.Services.AddScoped<BookingService>();
builder.Services.AddScoped<SeedService>();
builder.Services.AddResend(o =>
    o.ApiToken = builder.Configuration["Resend:ApiToken"] ?? string.Empty);
builder.Services.AddScoped<IEmailService, EmailService>();

// =============================================================================
// 2. DATABASE — EF Core + PostgreSQL
// =============================================================================
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(connectionString));

// =============================================================================
// 3. AUTHENTICATION — JWT bearer (admin only)
// =============================================================================
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = false,
            ValidateAudience         = false,
            ValidateLifetime         = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ClockSkew                = TimeSpan.FromMinutes(1)
        };

        // The SPA's session is the HttpOnly cookie set at login; an Authorization
        // header (tools, Swagger) wins when present. Check the header itself:
        // JwtBearer parses it only after this event, so ctx.Token is empty here.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (!ctx.Request.Headers.ContainsKey("Authorization") &&
                    ctx.Request.Cookies.TryGetValue("access_token", out var cookieToken))
                {
                    ctx.Token = cookieToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(opts =>
{
    opts.AddPolicy("AdminOnly", p => p.RequireAuthenticatedUser().RequireRole("admin"));
});

// =============================================================================
// 4. CORS & SWAGGER
// =============================================================================
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? ["http://localhost:3000"];

builder.Services.AddCors(opts =>
{
    opts.AddDefaultPolicy(p => p
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

builder.Services.AddSwaggerGen();

// Real client IP behind Caddy (deploy/Caddyfile), so the login lockout and the
// rate limit below are per visitor, not one shared bucket for the whole internet.
// ponytail: trusts whoever connects, not a pinned proxy address: pinned to
// loopback, a Dockerized API would see the bridge IP and share one bucket. Safe
// because only Caddy can connect (Kestrel binds localhost) and Caddy overwrites
// any client-sent X-Forwarded-For. Publish the port publicly and it is spoofable.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

// Public endpoints that send email, create Stripe customers or bookings:
// RateLimit:PerMinute requests per minute per IP (default 10;
// [EnableRateLimiting("public")]). The e2e suite raises it.
var perMinute = builder.Configuration.GetValue("RateLimit:PerMinute", 10);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, ct) => new ValueTask(ctx.HttpContext.Response.WriteAsJsonAsync(
        new { detail = "Troppe richieste. Riprova tra un minuto." }, ct));
    o.AddPolicy("public", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// =============================================================================
// 5. STARTUP HOOKS — apply schema and seed data
// =============================================================================
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // Applies whatever is pending in Migrations/ (see dotnet-backend/README.md).
    await ctx.Database.MigrateAsync();

    var seed = scope.ServiceProvider.GetRequiredService<SeedService>();
    await seed.RunAsync();
}

// =============================================================================
// 6. PIPELINE
// =============================================================================
app.UseForwardedHeaders();   // first: everything below must see the real IP and scheme

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
// HSTS and the other security headers come from Caddy, for the SPA and the API alike.

app.UseCors();

// BookingException carries its own status; Stripe errors (declined card,
// unknown SetupIntent) are the caller's problem, not a 500; a booking
// constraint violation means a concurrent request won the same slot or card.
// One place instead of a try/catch in every action.
app.Use(async (ctx, next) =>
{
    try { await next(); }
    catch (BookingException ex)       { await Detail(ctx, ex.StatusCode, ex.Message); }
    catch (Stripe.StripeException ex) { await Detail(ctx, 400, ex.Message); }
    catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException
        { ConstraintName: "EX_Bookings_NoOverlap" or "IX_Bookings_SetupIntentId" })
    {
        await Detail(ctx, 409, "Lo slot è appena stato prenotato da un'altra richiesta. Ricarica e riprova.");
    }
});

static Task Detail(HttpContext ctx, int status, string detail)
{
    ctx.Response.StatusCode = status;
    return ctx.Response.WriteAsJsonAsync(new { detail });
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
