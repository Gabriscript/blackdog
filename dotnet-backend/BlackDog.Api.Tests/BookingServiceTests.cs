// =============================================================================
// BookingService business-rule tests.
// SQLite in-memory database, Stripe in mock mode, fake email recorder.
// =============================================================================
using System.Globalization;
using BlackDog.Api.Controllers;
using BlackDog.Api.Data;
using BlackDog.Api.Dtos;
using BlackDog.Api.Entities;
using BlackDog.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace BlackDog.Api.Tests;

// Records every send instead of hitting Resend.
internal class FakeEmailService : IEmailService
{
    public List<(string To, string Subject, string Body)> Sent { get; } = new();
    public Task SendAsync(string to, string subject, string htmlBody)
    {
        Sent.Add((to, subject, htmlBody));
        return Task.CompletedTask;
    }
}

public class BookingServiceTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext     _db;
    private readonly FakeEmailService _email = new();
    private readonly Room             _room;

    public BookingServiceTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_conn).Options;
        _db = new AppDbContext(opts);
        _db.Database.EnsureCreated();

        _room = new Room { Name = "Sala Test", PricePerHour = 15m };
        _db.Rooms.Add(_room);
        _db.SaveChanges();
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    private BookingService MakeService(Dictionary<string, string?>? overrides = null)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Stripe:Mock"]                      = "true",
            ["Booking:NoShowPenalty"]            = "20.00",
            ["Booking:MinDurationMinutes"]       = "30",
            ["Booking:MaxDurationHours"]         = "12",
            ["Booking:MaxHorizonDays"]           = "180",
            ["Booking:StudioTimezone"]           = "Europe/Rome",
            ["Booking:CustomerCancelCutoffHours"] = "5",
            ["Booking:PastStartGraceMinutes"]    = "30",
            ["Cors:AllowedOrigins:0"]            = "http://localhost:3000",
        };
        if (overrides is not null)
            foreach (var (k, v) in overrides) settings[k] = v;

        var cfg    = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var stripe = new StripeService(cfg, NullLogger<StripeService>.Instance);
        return new BookingService(_db, stripe, cfg, _email, NullLogger<BookingService>.Instance);
    }

    // "now" as the studio sees it (Europe/Rome wall clock)
    private static DateTime RomeNow()
    {
        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById("Europe/Rome"); }
        catch (TimeZoneNotFoundException) { tz = TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time"); }
        return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
    }

    private static string IsoStr(DateTime dt) =>
        dt.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);

    private BookingCreateDto ValidDto(DateTime start, DateTime end, string email = "band@test.it") => new(
        CustomerName:          "Test Band",
        Email:                 email,
        StartTime:             IsoStr(start),
        EndTime:               IsoStr(end),
        RoomId:                _room.Id,
        SetupIntentId:         $"seti_mock_{Guid.NewGuid():N}",   // one card setup per booking
        AcceptedTerms:         true);

    // -------------------------------------------------------------------------
    // CREATE
    // -------------------------------------------------------------------------
    [Fact]
    public async Task Create_valid_booking_persists_and_sends_confirmation_email()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);

        var b = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));

        Assert.Equal(BookingStatus.Confirmed, b.Status);
        Assert.False(string.IsNullOrEmpty(b.CancelToken));

        var sent = Assert.Single(_email.Sent);
        Assert.Equal("band@test.it", sent.To);
        Assert.Contains("confermata", sent.Subject, StringComparison.OrdinalIgnoreCase);
        Assert.Contains($"/mia-prenotazione/{b.CancelToken}", sent.Body);
    }

    [Fact]
    public async Task Confirmation_email_html_encodes_the_customer_name()
    {
        // Anyone can book with any address: the name must not become markup.
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        var dto = ValidDto(start, start.AddHours(2)) with
        {
            CustomerName = "<a href=\"https://evil.example\">Paga qui</a>",
        };

        await svc.CreateAsync(dto);

        var body = Assert.Single(_email.Sent).Body;
        Assert.DoesNotContain("<a href=\"https://evil", body);
        Assert.Contains("&lt;a href=", body);
    }

    [Fact]
    public async Task Create_without_accepted_terms_is_rejected()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        var dto = ValidDto(start, start.AddHours(2)) with { AcceptedTerms = false };

        var ex = await Assert.ThrowsAsync<BookingException>(() => svc.CreateAsync(dto));
        Assert.Equal(400, ex.StatusCode);
    }

    [Fact]
    public async Task Create_overlapping_booking_returns_409()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        await svc.CreateAsync(ValidDto(start, start.AddHours(2)));

        // overlaps 19:00-21:00 with the existing 18:00-20:00
        var ex = await Assert.ThrowsAsync<BookingException>(
            () => svc.CreateAsync(ValidDto(start.AddHours(1), start.AddHours(3), "other@test.it")));
        Assert.Equal(409, ex.StatusCode);
    }

    [Fact]
    public async Task Reusing_a_setup_intent_for_a_second_booking_returns_409()
    {
        // One saved card must not be able to book every slot.
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(12);
        var first = ValidDto(start, start.AddHours(1));
        await svc.CreateAsync(first);

        var ex = await Assert.ThrowsAsync<BookingException>(() => svc.CreateAsync(
            ValidDto(start.AddHours(3), start.AddHours(4)) with { SetupIntentId = first.SetupIntentId }));
        Assert.Equal(409, ex.StatusCode);
    }

    [Fact]
    public async Task Create_on_cancelled_slot_succeeds()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        var first = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));
        await svc.CancelAsync(first.Id);

        var second = await svc.CreateAsync(ValidDto(start, start.AddHours(2), "other@test.it"));
        Assert.Equal(BookingStatus.Confirmed, second.Status);
    }

    [Fact]
    public async Task Create_too_long_duration_is_rejected()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(10);

        var ex = await Assert.ThrowsAsync<BookingException>(
            () => svc.CreateAsync(ValidDto(start, start.AddHours(13))));
        Assert.Equal(400, ex.StatusCode);
    }

    [Fact]
    public async Task Create_in_the_past_beyond_grace_is_rejected()
    {
        var svc = MakeService();
        var start = RomeNow().AddHours(-2);

        var ex = await Assert.ThrowsAsync<BookingException>(
            () => svc.CreateAsync(ValidDto(start, start.AddHours(4))));
        Assert.Equal(400, ex.StatusCode);
        Assert.Contains("passato", ex.Message);
    }

    [Fact]
    public async Task Create_slightly_in_the_past_within_grace_succeeds()
    {
        // The walk-in case: it's 18:10, the band books the 18:00 slot.
        var svc = MakeService();
        var start = RomeNow().AddMinutes(-10);

        var b = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));
        Assert.Equal(BookingStatus.Confirmed, b.Status);
    }

    // -------------------------------------------------------------------------
    // NO-SHOW & PENALTY
    // -------------------------------------------------------------------------
    [Fact]
    public async Task NoShow_online_booking_charges_penalty()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        var b = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));

        var after = await svc.NoShowAsync(b.Id);

        Assert.Equal(BookingStatus.NoShow, after.Status);
        Assert.True(after.PenaltyCharged);
        Assert.False(string.IsNullOrEmpty(after.PenaltyPaymentIntentId));
    }

    [Fact]
    public async Task NoShow_manual_booking_never_charges()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(21);
        var b = await svc.CreateManualAsync(new AdminManualBookingCreateDto(
            CustomerName: "Walk In", Email: null, RoomId: _room.Id,
            StartTime: IsoStr(start), EndTime: IsoStr(start.AddHours(2)), Paid: false));

        var after = await svc.NoShowAsync(b.Id);

        Assert.Equal(BookingStatus.NoShow, after.Status);
        Assert.False(after.PenaltyCharged);
    }

    [Fact]
    public void NoShowPenalty_reads_the_same_key_shown_to_customers()
    {
        // GET /api/config/stripe reads Booking:NoShowPenalty — the charge must too.
        var svc = MakeService(new() { ["Booking:NoShowPenalty"] = "35.50" });
        Assert.Equal(35.50m, svc.NoShowPenalty);
    }

    // -------------------------------------------------------------------------
    // PAID FLAG
    // -------------------------------------------------------------------------
    [Fact]
    public async Task TogglePaid_is_rejected_on_online_bookings()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        var b = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));

        var ex = await Assert.ThrowsAsync<BookingException>(() => svc.TogglePaidAsync(b.Id));
        Assert.Equal(400, ex.StatusCode);
    }

    // -------------------------------------------------------------------------
    // ADMIN LIST
    // -------------------------------------------------------------------------
    [Fact]
    public async Task Admin_list_without_date_shows_today_onward_only()
    {
        // The default view must not grow with the history.
        var svc = MakeService();
        var yesterday = RomeNow().Date.AddDays(-1).AddHours(18);
        _db.Bookings.Add(new Booking
        {
            RoomId       = _room.Id,
            RoomName     = _room.Name,
            CustomerName = "Ieri",
            Email        = "old@test.it",
            StartTime    = yesterday,
            EndTime      = yesterday.AddHours(2),
        });
        await _db.SaveChangesAsync();
        var tomorrow = RomeNow().Date.AddDays(1).AddHours(18);
        var upcoming = await svc.CreateAsync(ValidDto(tomorrow, tomorrow.AddHours(2)));

        var ok = Assert.IsType<OkObjectResult>(await new AdminController(_db, svc).List(null, null));

        var row = Assert.Single(Assert.IsAssignableFrom<IEnumerable<Dtos.BookingResponseDto>>(ok.Value));
        Assert.Equal(upcoming.Id, row.Id);
    }

    // -------------------------------------------------------------------------
    // CUSTOMER SELF-SERVICE CANCELLATION
    // -------------------------------------------------------------------------
    [Fact]
    public async Task CancelByToken_before_cutoff_cancels_and_sends_email()
    {
        var svc = MakeService();
        var start = RomeNow().Date.AddDays(1).AddHours(18);
        var b = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));
        _email.Sent.Clear();

        await svc.CancelByTokenAsync(b.CancelToken!);

        var reloaded = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == b.Id);
        Assert.Equal(BookingStatus.Cancelled, reloaded.Status);

        var sent = Assert.Single(_email.Sent);
        Assert.Contains("annullata", sent.Subject, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task CancelByToken_after_cutoff_is_rejected()
    {
        var svc = MakeService();
        // booking starts in 2h — within the 5h cutoff (use grace-friendly future start)
        var start = RomeNow().AddHours(2);
        var b = await svc.CreateAsync(ValidDto(start, start.AddHours(2)));

        var ex = await Assert.ThrowsAsync<BookingException>(
            () => svc.CancelByTokenAsync(b.CancelToken!));
        Assert.Equal(400, ex.StatusCode);

        var reloaded = await _db.Bookings.AsNoTracking().SingleAsync(x => x.Id == b.Id);
        Assert.Equal(BookingStatus.Confirmed, reloaded.Status);
    }

    [Fact]
    public async Task CancelByToken_unknown_token_returns_404()
    {
        var svc = MakeService();
        var ex = await Assert.ThrowsAsync<BookingException>(
            () => svc.CancelByTokenAsync("does-not-exist"));
        Assert.Equal(404, ex.StatusCode);
    }
}
