// =============================================================================
// BLACK DOG — Sala Prove a Firenze · ASP.NET Core 8 entry point
// =============================================================================
// Sections (search the comment banners below to jump to a section):
//   1. CONFIGURATION       — read appsettings, DI registration
//   2. DATABASE            — EF Core + PostgreSQL
//   3. AUTHENTICATION      — JWT bearer for admin
//   4. CORS & SWAGGER      — middleware
//   5. STARTUP HOOKS       — schema creation + seed (admin & rooms)
//   6. PIPELINE            — middleware order
// =============================================================================

using System.Text;
using BlackDog.Api.Data;
using BlackDog.Api.Services;
using Resend;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// Npgsql 6+ strict timestamp mode rejects DateTime with Kind=Utc on
// "timestamp without time zone" columns. Since we store wall-clock times
// everywhere, enable the legacy behavior to avoid runtime exceptions.
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

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

        // Allow token from cookie as a fallback (matches FastAPI behaviour)
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (string.IsNullOrEmpty(ctx.Token) &&
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
                     ?? new[] { "http://localhost:3000" };

builder.Services.AddCors(opts =>
{
    opts.AddDefaultPolicy(p => p
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

builder.Services.AddSwaggerGen();

var app = builder.Build();

// =============================================================================
// 5. STARTUP HOOKS — apply schema and seed data
// =============================================================================
using (var scope = app.Services.CreateScope())
{
    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // For first-run convenience we use EnsureCreated.
    // For production migrations, replace with: await ctx.Database.MigrateAsync();
    // and run `dotnet ef migrations add Initial` once before deploying.
    await ctx.Database.EnsureCreatedAsync();

    // Add columns introduced after initial schema creation (idempotent)
    await ctx.Database.ExecuteSqlRawAsync("""
        ALTER TABLE "Users"
        ADD COLUMN IF NOT EXISTS "PasswordResetToken"       varchar(100),
        ADD COLUMN IF NOT EXISTS "PasswordResetTokenExpiry" timestamp without time zone;
        """);

    var seed = scope.ServiceProvider.GetRequiredService<SeedService>();
    await seed.RunAsync();
}

// =============================================================================
// 6. PIPELINE
// =============================================================================
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
