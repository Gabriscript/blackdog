// =============================================================================
// BookingService — encapsulates all booking validation and state transitions.
// All BUSINESS RULES live here so they are easy to find and tweak.
// =============================================================================
using System.Net;
using BlackDog.Api.Data;
using BlackDog.Api.Dtos;
using BlackDog.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Services;

public class BookingService(AppDbContext db, StripeService stripe, IConfiguration cfg,
                            IEmailService email, ILogger<BookingService> log)
{
    // -------------------------------------------------------------------------
    // BOOKING MANAGEMENT — BUSINESS RULES
    // Edit appsettings.json (Booking section) to change these.
    // -------------------------------------------------------------------------
    private TimeSpan MinDuration => TimeSpan.FromMinutes(cfg.GetValue<int>("Booking:MinDurationMinutes", 30));
    private TimeSpan MaxDuration => TimeSpan.FromHours(  cfg.GetValue<int>("Booking:MaxDurationHours",  12));
    private int      MaxHorizonDays => cfg.GetValue<int>("Booking:MaxHorizonDays", 180);
    private string   StudioTimeZone => cfg["Booking:StudioTimezone"] ?? "Europe/Rome";

    // A booking may start slightly in the past (e.g. it's 18:10 and the band
    // books the 18:00 slot they are about to use). Without this grace the
    // walk-in scenario the admin dialog exists for would always be rejected.
    private TimeSpan PastStartGrace =>
        TimeSpan.FromMinutes(cfg.GetValue<int>("Booking:PastStartGraceMinutes", 30));

    // Single source of truth for the no-show penalty (same key used by
    // GET /api/config/stripe, so what the customer sees is what gets charged).
    public decimal NoShowPenalty => cfg.GetValue<decimal>("Booking:NoShowPenalty", 20.00m);

    private string PublicBaseUrl =>
        cfg.GetSection("Cors:AllowedOrigins").Get<string[]>()?.FirstOrDefault()
        ?? "http://localhost:3000";

    // Hours BEFORE the slot start when the customer can still cancel via
    // the magic link. After this cutoff the link becomes read-only.
    public int CustomerCancelCutoffHours =>
        cfg.GetValue<int>("Booking:CustomerCancelCutoffHours", 5);

    private static TimeZoneInfo ResolveTimezone(string tzId)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(tzId); }
        catch (TimeZoneNotFoundException)
        {
            // Windows usa nomi diversi dagli IANA — prova la conversione automatica
            if (TimeZoneInfo.TryConvertIanaIdToWindowsId(tzId, out var winId))
                return TimeZoneInfo.FindSystemTimeZoneById(winId);
            throw;
        }
    }

    public DateTime StudioNow() =>
        TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ResolveTimezone(StudioTimeZone));

    private static DateTime ParseWallClock(string iso, string tzId)
    {
        var dt = DateTime.Parse(iso, System.Globalization.CultureInfo.InvariantCulture,
                                System.Globalization.DateTimeStyles.RoundtripKind);
        if (dt.Kind != DateTimeKind.Unspecified)
            dt = TimeZoneInfo.ConvertTime(dt, ResolveTimezone(tzId));
        return DateTime.SpecifyKind(dt, DateTimeKind.Unspecified);
    }

    // -------------------------------------------------------------------------
    // SLOT VALIDATION — shared by the public and the admin walk-in flows.
    // Cheap checks first; the caller adds whatever else its flow needs.
    // -------------------------------------------------------------------------
    private async Task<(Room Room, DateTime Start, DateTime End)> ValidateSlotAsync(
        Guid roomId, string startIso, string endIso)
    {
        var room = await db.Rooms.FirstOrDefaultAsync(r => r.Id == roomId)
                   ?? throw new BookingException(404, "Sala non trovata");

        DateTime start, end;
        try
        {
            start = ParseWallClock(startIso, StudioTimeZone);
            end   = ParseWallClock(endIso,   StudioTimeZone);
        }
        catch (FormatException)
        {
            // Only bad input. A misconfigured StudioTimezone must stay a 500,
            // not be reported to the customer as a date typo.
            throw new BookingException(400, "Formato data/ora non valido (usa ISO 8601)");
        }

        if (start >= end)
            throw new BookingException(400, "L'orario di fine deve essere dopo l'inizio");

        var duration = end - start;
        if (duration < MinDuration)
            throw new BookingException(400, $"La durata minima è {MinDuration.TotalMinutes:0} minuti");
        if (duration > MaxDuration)
            throw new BookingException(400, $"La durata massima è {MaxDuration.TotalHours:0} ore");

        var nowLocal = StudioNow();
        if (start < nowLocal - PastStartGrace)
            throw new BookingException(400, "Non puoi prenotare nel passato");
        if (start > nowLocal.AddDays(MaxHorizonDays))
            throw new BookingException(400, $"Puoi prenotare al massimo a {MaxHorizonDays} giorni di distanza");

        // Overlap check (cancelled bookings are ignored: the slot is free again)
        var overlap = await db.Bookings.AnyAsync(b =>
            b.RoomId == roomId &&
            b.Status != BookingStatus.Cancelled &&
            b.StartTime < end &&
            start < b.EndTime);
        if (overlap)
            throw new BookingException(409, "Questo slot è già prenotato");

        return (room, start, end);
    }

    // -------------------------------------------------------------------------
    // CREATE BOOKING — terms, then the shared slot checks, then Stripe last.
    // -------------------------------------------------------------------------
    public async Task<Booking> CreateAsync(BookingCreateDto dto)
    {
        if (!dto.AcceptedTerms)
            throw new BookingException(400, "Devi accettare i termini per procedere");

        var (room, startDt, endDt) = await ValidateSlotAsync(dto.RoomId, dto.StartTime, dto.EndTime);

        // Without this, one successful SetupIntent could book every slot of
        // every room. The unique index in AppDbContext backstops races.
        if (await db.Bookings.AnyAsync(b => b.SetupIntentId == dto.SetupIntentId))
            throw new BookingException(409, "Questa carta è già stata usata per un'altra prenotazione. Ricarica la pagina e riprova.");

        // Stripe check (or mock pass-through) — customer and card come from Stripe
        var (customerId, pmId) = await stripe.VerifySetupIntentAsync(dto.SetupIntentId);

        var booking = new Booking
        {
            RoomId                = room.Id,
            RoomName              = room.Name,
            CustomerName          = dto.CustomerName.Trim(),
            Email                 = dto.Email.Trim().ToLowerInvariant(),
            StartTime             = startDt,
            EndTime               = endDt,
            Status                = BookingStatus.Confirmed,
            StripeCustomerId      = customerId,
            StripePaymentMethodId = pmId,
            SetupIntentId         = dto.SetupIntentId,
            CancelToken           = GenerateCancelToken(),
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();

        await SendConfirmationEmailAsync(booking);

        return booking;
    }

    // -------------------------------------------------------------------------
    // EMAILS — failures are logged but never break the booking flow.
    // The name is typed by whoever books, and the address need not be theirs:
    // unencoded, it turns our confirmation into an HTML template anyone can
    // send to anyone from our verified domain.
    // -------------------------------------------------------------------------
    private static string FmtDate(DateTime dt) =>
        dt.ToString("dd/MM/yyyy", System.Globalization.CultureInfo.InvariantCulture);
    private static string FmtTime(DateTime dt) =>
        dt.ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture);

    private async Task SendConfirmationEmailAsync(Booking b)
    {
        var link = $"{PublicBaseUrl}/mia-prenotazione/{b.CancelToken}";
        try
        {
            await email.SendAsync(
                b.Email,
                "Black Dog — Prenotazione confermata",
                $"""
                <p>Ciao {WebUtility.HtmlEncode(b.CustomerName)},</p>
                <p>la tua prenotazione da <strong>Black Dog Sala Prove</strong> è confermata:</p>
                <ul>
                  <li>Sala: <strong>{b.RoomName}</strong></li>
                  <li>Data: <strong>{FmtDate(b.StartTime)}</strong></li>
                  <li>Orario: <strong>{FmtTime(b.StartTime)} – {FmtTime(b.EndTime)}</strong></li>
                </ul>
                <p><a href="{link}">Gestisci o annulla la tua prenotazione</a><br/>
                Puoi annullare gratuitamente fino a <strong>{CustomerCancelCutoffHours} ore</strong>
                prima dell'inizio. In caso di no-show verrà addebitata una penale di
                <strong>{NoShowPenalty:0.00} €</strong> sulla carta fornita.</p>
                <p>A presto!<br/>Black Dog Sala Prove</p>
                """);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Invio email di conferma fallito per {Email} (booking {Id})", b.Email, b.Id);
        }
    }

    private async Task SendCancellationEmailAsync(Booking b)
    {
        try
        {
            await email.SendAsync(
                b.Email,
                "Black Dog — Prenotazione annullata",
                $"""
                <p>Ciao {WebUtility.HtmlEncode(b.CustomerName)},</p>
                <p>la tua prenotazione del <strong>{FmtDate(b.StartTime)}</strong>
                ({FmtTime(b.StartTime)} – {FmtTime(b.EndTime)}, {b.RoomName}) è stata
                <strong>annullata</strong>. Nessun addebito è stato effettuato.</p>
                <p>Ti aspettiamo presto!<br/>Black Dog Sala Prove</p>
                """);
        }
        catch (Exception ex)
        {
            log.LogError(ex, "Invio email di annullamento fallito per {Email} (booking {Id})", b.Email, b.Id);
        }
    }

    // -------------------------------------------------------------------------
    // CUSTOMER SELF-SERVICE — magic-link cancellation
    // -------------------------------------------------------------------------
    private static string GenerateCancelToken()
    {
        var bytes = new byte[32];
        System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    public async Task<Booking?> GetByTokenAsync(string token)
    {
        return await db.Bookings.AsNoTracking()
            .FirstOrDefaultAsync(b => b.CancelToken == token);
    }

    public bool CanCustomerCancel(Booking b)
    {
        if (b.Status != BookingStatus.Confirmed) return false;
        return b.StartTime >= StudioNow().AddHours(CustomerCancelCutoffHours);
    }

    public async Task CancelByTokenAsync(string token)
    {
        var b = await db.Bookings.FirstOrDefaultAsync(x => x.CancelToken == token)
                ?? throw new BookingException(404, "Prenotazione non trovata");
        if (b.Status == BookingStatus.Cancelled)
            throw new BookingException(400, "Prenotazione già annullata");
        if (b.Status != BookingStatus.Confirmed)
            throw new BookingException(400, $"Impossibile annullare (stato attuale: {b.Status})");
        if (!CanCustomerCancel(b))
            throw new BookingException(400,
                $"È troppo tardi per annullare online (limite: {CustomerCancelCutoffHours} ore prima dell'inizio). Contatta lo studio.");
        b.Status = BookingStatus.Cancelled;
        await db.SaveChangesAsync();
        await SendCancellationEmailAsync(b);
    }

    // -------------------------------------------------------------------------
    // STATE TRANSITIONS (admin only)
    // -------------------------------------------------------------------------
    public async Task<Booking> CancelAsync(Guid id)
    {
        var b = await db.Bookings.FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new BookingException(404, "Prenotazione non trovata");
        if (b.Status != BookingStatus.Confirmed)
            throw new BookingException(400, $"Impossibile annullare (stato attuale: {b.Status})");
        b.Status = BookingStatus.Cancelled;
        await db.SaveChangesAsync();
        return b;
    }

    // -------------------------------------------------------------------------
    // ADMIN WALK-IN BOOKING — no card, optional email, optional paid flag
    // -------------------------------------------------------------------------
    public async Task<Booking> CreateManualAsync(AdminManualBookingCreateDto dto)
    {
        var (room, startDt, endDt) = await ValidateSlotAsync(dto.RoomId, dto.StartTime, dto.EndTime);

        var booking = new Booking
        {
            RoomId                = room.Id,
            RoomName              = room.Name,
            CustomerName          = dto.CustomerName.Trim(),
            Email                 = (dto.Email ?? "").Trim().ToLowerInvariant(),
            StartTime             = startDt,
            EndTime               = endDt,
            Status                = BookingStatus.Confirmed,
            StripeCustomerId      = "",
            StripePaymentMethodId = "",
            SetupIntentId         = null,
            CancelToken           = null,    // walk-ins do not get a magic link
            Manual                = true,
            Paid                  = dto.Paid,
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();

        log.LogInformation(
            "[ADMIN] Manual booking created — {Name} in {Room}, {Start} → {End}, paid={Paid}",
            booking.CustomerName, booking.RoomName, booking.StartTime, booking.EndTime, booking.Paid);

        return booking;
    }

    // -------------------------------------------------------------------------
    // TOGGLE PAID — only on manual bookings
    // -------------------------------------------------------------------------
    public async Task<Booking> TogglePaidAsync(Guid id)
    {
        var b = await db.Bookings.FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new BookingException(404, "Prenotazione non trovata");
        if (!b.Manual)
            throw new BookingException(400, "'Pagato' è disponibile solo per prenotazioni manuali");
        b.Paid = !b.Paid;
        await db.SaveChangesAsync();
        return b;
    }

    public async Task<Booking> NoShowAsync(Guid id)
    {
        var b = await db.Bookings.FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new BookingException(404, "Prenotazione non trovata");
        if (b.Status != BookingStatus.Confirmed)
            throw new BookingException(400, $"Impossibile segnare no-show (stato attuale: {b.Status})");

        // Manual bookings — no card on file, just mark the status
        if (b.Manual)
        {
            b.Status = BookingStatus.NoShow;
            await db.SaveChangesAsync();
            return b;
        }

        if (b.PenaltyCharged)
            throw new BookingException(400, "Penale già addebitata");

        var penalty = NoShowPenalty;

        try
        {
            var result = await stripe.ChargeOffSessionAsync(
                penalty, b.StripeCustomerId, b.StripePaymentMethodId,
                $"Penale no-show Black Dog - {b.StartTime:s}", b.Id);

            b.Status                 = BookingStatus.NoShow;
            b.PenaltyCharged         = result.Succeeded;
            b.PenaltyPaymentIntentId = result.PaymentIntentId;
            b.PenaltyStatus          = result.Status;
        }
        catch (Stripe.StripeException ex)
        {
            // Card declined — still mark as no-show but flag the failure
            b.Status        = BookingStatus.NoShow;
            b.PenaltyError  = ex.Message;
            await db.SaveChangesAsync();
            throw new BookingException(402, $"Carta rifiutata: {ex.Message}");
        }

        await db.SaveChangesAsync();
        return b;
    }
}

// =============================================================================
// Domain exception → mapped to HTTP status by the controllers.
// =============================================================================
public class BookingException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
