// =============================================================================
// AdminController — protected by [Authorize(Policy = "AdminOnly")].
//   GET  /api/admin/bookings                  list with filters (date, status)
//   POST /api/admin/bookings/{id}/cancel      mark cancelled (no charge)
//   POST /api/admin/bookings/{id}/no-show     mark no-show (charges penalty)
//
// Only the studio owner can call these — they decide manually whether a
// no-show charge should be applied.
// =============================================================================
using BlackDog.Api.Data;
using BlackDog.Api.Dtos;
using BlackDog.Api.Entities;
using BlackDog.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext   _db;
    private readonly BookingService _bookings;

    public AdminController(AppDbContext db, BookingService bookings)
    {
        _db = db; _bookings = bookings;
    }

    // -------------------------------------------------------------------------
    // GET /api/admin/bookings?date=YYYY-MM-DD&status=confirmed|cancelled|no-show
    // -------------------------------------------------------------------------
    [HttpGet("bookings")]
    public async Task<IActionResult> List([FromQuery] string? date, [FromQuery] string? status)
    {
        var query = _db.Bookings.AsNoTracking().AsQueryable();

        if (!string.IsNullOrEmpty(date) && DateTime.TryParse(date, out var d))
        {
            var dayStart = new DateTime(d.Year, d.Month, d.Day, 0, 0, 0, DateTimeKind.Unspecified);
            var dayEnd   = dayStart.AddDays(1);
            query = query.Where(b => b.StartTime >= dayStart && b.StartTime < dayEnd);
        }
        if (!string.IsNullOrEmpty(status))
            query = query.Where(b => b.Status == status);

        var rows = await query.OrderBy(b => b.StartTime).ToListAsync();
        return Ok(rows.Select(PublicController.ToResponse));
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings — admin walk-in booking (no card required)
    // -------------------------------------------------------------------------
    [HttpPost("bookings")]
    public async Task<IActionResult> CreateManual([FromBody] AdminManualBookingCreateDto dto)
    {
        try
        {
            var b = await _bookings.CreateManualAsync(dto);
            return Ok(PublicController.ToResponse(b));
        }
        catch (BookingException ex)
        {
            return StatusCode(ex.StatusCode, new { detail = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings/{id}/toggle-paid — flip the paid flag
    // -------------------------------------------------------------------------
    [HttpPost("bookings/{id:guid}/toggle-paid")]
    public async Task<IActionResult> TogglePaid(Guid id)
    {
        try
        {
            var b = await _bookings.TogglePaidAsync(id);
            return Ok(new { ok = true, paid = b.Paid });
        }
        catch (BookingException ex)
        {
            return StatusCode(ex.StatusCode, new { detail = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings/{id}/cancel
    // -------------------------------------------------------------------------
    [HttpPost("bookings/{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        try
        {
            await _bookings.CancelAsync(id);
            return Ok(new { ok = true, status = BookingStatus.Cancelled });
        }
        catch (BookingException ex)
        {
            return StatusCode(ex.StatusCode, new { detail = ex.Message });
        }
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings/{id}/no-show
    // -------------------------------------------------------------------------
    [HttpPost("bookings/{id:guid}/no-show")]
    public async Task<IActionResult> NoShow(Guid id)
    {
        try
        {
            var b = await _bookings.NoShowAsync(id);
            return Ok(new
            {
                ok                 = true,
                status             = BookingStatus.NoShow,
                penalty_charged    = b.PenaltyCharged,
                payment_intent_id  = b.PenaltyPaymentIntentId,
            });
        }
        catch (BookingException ex)
        {
            return StatusCode(ex.StatusCode, new { detail = ex.Message });
        }
    }
}
