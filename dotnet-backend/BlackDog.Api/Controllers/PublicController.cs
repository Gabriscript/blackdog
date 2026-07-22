// =============================================================================
// PublicController — endpoints used by anyone (no auth required):
//   GET  /api/                            health check
//   GET  /api/config/stripe               publishable key + penalty + mock flag
//   GET  /api/rooms                       list bookable rooms
//   GET  /api/bookings/availability       slots already taken on a given day
//   POST /api/bookings/setup-intent       save card via Stripe SetupIntent
//   POST /api/bookings                    create a confirmed booking
// =============================================================================
using BlackDog.Api.Data;
using BlackDog.Api.Dtos;
using BlackDog.Api.Entities;
using BlackDog.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Controllers;

[ApiController]
[Route("api")]
public class PublicController : ControllerBase
{
    private readonly AppDbContext   _db;
    private readonly StripeService  _stripe;
    private readonly BookingService _bookings;
    private readonly IConfiguration _cfg;

    public PublicController(AppDbContext db, StripeService stripe, BookingService bookings, IConfiguration cfg)
    {
        _db = db; _stripe = stripe; _bookings = bookings; _cfg = cfg;
    }

    // -------------------------------------------------------------------------
    [HttpGet("")]
    public IActionResult Root() => Ok(new { service = "Black Dog API", status = "ok" });

    // -------------------------------------------------------------------------
    [HttpGet("config/stripe")]
    public IActionResult StripeConfig() => Ok(new StripeConfigDto(
        PublishableKey: _cfg["Stripe:PublishableKey"] ?? string.Empty,
        Penalty:        _cfg.GetValue<decimal>("Booking:NoShowPenalty", 20.00m),
        Mock:           _cfg.GetValue<bool>("Stripe:Mock")));
    // -------------------------------------------------------------------------
[HttpGet("rooms")]
public async Task<IActionResult> Rooms()
{
    var rooms = await _db.Rooms.AsNoTracking()
        .OrderBy(r => r.Name)
        .Select(r => new RoomDto(r.Id, r.Name, r.PricePerHour))
        .ToListAsync();
    return Ok(rooms);
}

    // -------------------------------------------------------------------------
    [HttpGet("bookings/availability")]
    public async Task<IActionResult> Availability([FromQuery] string date, [FromQuery(Name = "room_id")] Guid roomId)
    {
        if (!DateTime.TryParse(date, out var d))
            return BadRequest(new { detail = "Formato data non valido (YYYY-MM-DD)" });

        // Operating window: [date 10:00, date+1 01:00) — studio closed in the morning,
        // can run sessions until 1 am next day. Return any confirmed booking that
        // intersects this window.
        var open  = new DateTime(d.Year, d.Month, d.Day, 10, 0, 0, DateTimeKind.Unspecified);
        var close = open.Date.AddDays(1).AddHours(1);

        var rows = await _db.Bookings.AsNoTracking()
            .Where(b => b.RoomId == roomId
                     && b.Status == BookingStatus.Confirmed
                     && b.StartTime < close
                     && b.EndTime   > open)
            .Select(b => new { b.StartTime, b.EndTime })
            .ToListAsync();

        var slots = rows
            .Select(r => new AvailabilitySlotDto(Iso.Format(r.StartTime), Iso.Format(r.EndTime)))
            .ToList();

        return Ok(new { booked_slots = slots });
    }

    // -------------------------------------------------------------------------
    [HttpPost("bookings/setup-intent")]
    public async Task<IActionResult> CreateSetupIntent([FromBody] SetupIntentDto dto)
    {
        try
        {
            var r = await _stripe.CreateSetupIntentAsync(dto.Email, dto.CustomerName);
            return Ok(new
            {
                client_secret    = r.ClientSecret,
                customer_id      = r.CustomerId,
                setup_intent_id  = r.SetupIntentId,
            });
        }
        catch (Stripe.StripeException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    [HttpPost("bookings")]
    public async Task<IActionResult> CreateBooking([FromBody] BookingCreateDto dto)
    {
        try
        {
            var b = await _bookings.CreateAsync(dto);
            return Ok(ToResponse(b) with
            {
                CancelToken   = b.CancelToken ?? string.Empty,
                CancelUrlPath = $"/mia-prenotazione/{b.CancelToken}",
            });
        }
        catch (BookingException ex)
        {
            return StatusCode(ex.StatusCode, new { detail = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // CUSTOMER SELF-SERVICE — magic-link endpoints (no auth)
    //   GET  /api/bookings/by-token/{token}
    //   POST /api/bookings/by-token/{token}/cancel
    // -------------------------------------------------------------------------
    [HttpGet("bookings/by-token/{token}")]
    public async Task<IActionResult> GetByToken(string token)
    {
        var b = await _bookings.GetByTokenAsync(token);
        if (b is null) return NotFound(new { detail = "Prenotazione non trovata" });
        return Ok(new BookingPublicDto(
            Id:                b.Id,
            CustomerName:      b.CustomerName,
            Email:             b.Email,
            StartTime:         Iso.Format(b.StartTime),
            EndTime:           Iso.Format(b.EndTime),
            RoomName:          b.RoomName,
            Status:            b.Status,
            CanCancel:         _bookings.CanCustomerCancel(b),
            CancelCutoffHours: _bookings.CustomerCancelCutoffHours));
    }

    [HttpPost("bookings/by-token/{token}/cancel")]
    public async Task<IActionResult> CancelByToken(string token)
    {
        try
        {
            await _bookings.CancelByTokenAsync(token);
            return Ok(new { ok = true, status = BookingStatus.Cancelled });
        }
        catch (BookingException ex)
        {
            return StatusCode(ex.StatusCode, new { detail = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    internal static BookingResponseDto ToResponse(Booking b) => new(
        Id:                    b.Id,
        CustomerName:          b.CustomerName,
        Email:                 b.Email,
        StartTime:             Iso.Format(b.StartTime),
        EndTime:               Iso.Format(b.EndTime),
        RoomId:                b.RoomId,
        RoomName:              b.RoomName,
        Status:                b.Status,
        StripeCustomerId:      b.StripeCustomerId,
        StripePaymentMethodId: b.StripePaymentMethodId,
        PenaltyCharged:        b.PenaltyCharged,
        Manual:                b.Manual,
        Paid:                  b.Paid,
        CreatedAt:             b.CreatedAt.ToString("o"));
}
