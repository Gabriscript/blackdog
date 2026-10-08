// =============================================================================
// StripeService — wraps Stripe.net so the rest of the app stays decoupled.
// MOCK MODE (Stripe:Mock=true in appsettings) generates fake IDs without
// hitting Stripe. Useful for local dev / demo without test keys.
// =============================================================================
using Stripe;

namespace BlackDog.Api.Services;

public record SetupIntentResult(string SetupIntentId, string ClientSecret);

public record OffSessionChargeResult(string PaymentIntentId, string Status, bool Succeeded);

public class StripeService
{
    private readonly bool _mock;
    private readonly ILogger<StripeService> _log;

    public StripeService(IConfiguration cfg, ILogger<StripeService> log)
    {
        _log  = log;
        _mock = cfg.GetValue<bool>("Stripe:Mock");
        // ponytail: process-wide key, fine for one Stripe account; switch to a
        // StripeClient per instance if a second account ever appears.
        if (!_mock) StripeConfiguration.ApiKey = cfg["Stripe:ApiKey"];
    }

    // -------------------------------------------------------------------------
    // Save a card without charging. Returns IDs to be persisted on the booking.
    // -------------------------------------------------------------------------
    public async Task<SetupIntentResult> CreateSetupIntentAsync(string email, string customerName)
    {
        if (_mock)
        {
            var siId = $"seti_mock_{Guid.NewGuid():N}"[..19];
            _log.LogInformation("[STRIPE MOCK] SetupIntent {Id} for {Email}", siId, email);
            return new SetupIntentResult(siId, $"{siId}_secret_mock");
        }

        var customerService = new CustomerService();
        var customer = await customerService.CreateAsync(new CustomerCreateOptions
        {
            Email = email,
            Name  = customerName,
        });

        var setupIntentService = new SetupIntentService();
        var si = await setupIntentService.CreateAsync(new SetupIntentCreateOptions
        {
            Customer            = customer.Id,
            PaymentMethodTypes  = ["card"],
            Usage               = "off_session",  // required for later off-session charges
        });

        return new SetupIntentResult(si.Id, si.ClientSecret);
    }

    // -------------------------------------------------------------------------
    // Verify the SetupIntent succeeded and return the customer + card it saved.
    // Both come from Stripe, never from the request body: a forged customer id
    // would be stored as-is and make the no-show charge fail later.
    // -------------------------------------------------------------------------
    public async Task<(string CustomerId, string PaymentMethodId)> VerifySetupIntentAsync(string setupIntentId)
    {
        if (_mock) return ($"cus_mock_{Guid.NewGuid():N}"[..18], $"pm_mock_{Guid.NewGuid():N}"[..18]);

        var siService = new SetupIntentService();
        var si = await siService.GetAsync(setupIntentId);
        if (si.Status != "succeeded")
            throw new BookingException(402, $"Carta non salvata (stato: {si.Status})");

        return (si.CustomerId, si.PaymentMethodId);
    }

    // -------------------------------------------------------------------------
    // Off-session charge — used for the no-show penalty. The idempotency key
    // turns a repeated request for the same booking (two tabs, two admins)
    // into the first PaymentIntent instead of a second charge on the card.
    // -------------------------------------------------------------------------
    public async Task<OffSessionChargeResult> ChargeOffSessionAsync(
        decimal amountEur, string customerId, string paymentMethodId,
        string description, Guid bookingId)
    {
        if (_mock)
        {
            var pi = $"pi_mock_{Guid.NewGuid():N}"[..18];
            _log.LogInformation("[STRIPE MOCK] PaymentIntent {Id} charged {Amount} EUR to {Customer}",
                pi, amountEur, customerId);
            return new OffSessionChargeResult(pi, "succeeded", true);
        }

        var piService = new PaymentIntentService();
        var pi2 = await piService.CreateAsync(new PaymentIntentCreateOptions
        {
            Amount        = (long)Math.Round(amountEur * 100m),
            Currency      = "eur",
            Customer      = customerId,
            PaymentMethod = paymentMethodId,
            OffSession    = true,
            Confirm       = true,
            Description   = description,
            Metadata      = new Dictionary<string, string> { ["booking_id"] = bookingId.ToString() },
        }, new RequestOptions { IdempotencyKey = $"noshow-{bookingId}" });

        return new OffSessionChargeResult(pi2.Id, pi2.Status, pi2.Status == "succeeded");
    }
}
