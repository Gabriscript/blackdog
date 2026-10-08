// =============================================================================
// AdminController — protected by [Authorize(Policy = "AdminOnly")].
//   GET  /api/admin/bookings                    list with filters (date, status)
//   POST /api/admin/bookings                    walk-in booking (no card)
//   POST /api/admin/bookings/{id}/toggle-paid   flip the paid flag (walk-ins)
//   POST /api/admin/bookings/{id}/cancel        mark cancelled (no charge)
//   POST /api/admin/bookings/{id}/no-show       mark no-show (charges penalty)
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
public class AdminController(AppDbContext db, BookingService bookings) : ControllerBase
{
    // -------------------------------------------------------------------------
    // GET /api/admin/bookings?date=YYYY-MM-DD&status=confirmed|cancelled|no-show
    // No date = today onward: bounded by Booking:MaxHorizonDays, so the list
    // stops growing with the history. Past days are one date filter away.
    // -------------------------------------------------------------------------
    [HttpGet("bookings")]
    public async Task<IActionResult> List([FromQuery] string? date, [FromQuery] string? status)
    {
        var query = db.Bookings.AsNoTracking().AsQueryable();

        if (!string.IsNullOrEmpty(date) && DateTime.TryParse(date, out var d))
        {
            var dayStart = new DateTime(d.Year, d.Month, d.Day, 0, 0, 0, DateTimeKind.Unspecified);
            var dayEnd   = dayStart.AddDays(1);
            query = query.Where(b => b.StartTime >= dayStart && b.StartTime < dayEnd);
        }
        else
        {
            var today = DateTime.SpecifyKind(bookings.StudioNow().Date, DateTimeKind.Unspecified);
            query = query.Where(b => b.StartTime >= today);
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
        var b = await bookings.CreateManualAsync(dto);
        return Ok(PublicController.ToResponse(b));
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings/{id}/toggle-paid — flip the paid flag
    // -------------------------------------------------------------------------
    [HttpPost("bookings/{id:guid}/toggle-paid")]
    public async Task<IActionResult> TogglePaid(Guid id)
    {
        var b = await bookings.TogglePaidAsync(id);
        return Ok(new { ok = true, paid = b.Paid });
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings/{id}/cancel
    // -------------------------------------------------------------------------
    [HttpPost("bookings/{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        await bookings.CancelAsync(id);
        return Ok(new { ok = true, status = BookingStatus.Cancelled });
    }

    // -------------------------------------------------------------------------
    // POST /api/admin/bookings/{id}/no-show
    // -------------------------------------------------------------------------
    [HttpPost("bookings/{id:guid}/no-show")]
    public async Task<IActionResult> NoShow(Guid id)
    {
        var b = await bookings.NoShowAsync(id);
        return Ok(new { ok = true, status = BookingStatus.NoShow, penalty_charged = b.PenaltyCharged });
    }
}
