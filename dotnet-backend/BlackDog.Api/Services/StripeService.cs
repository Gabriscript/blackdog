// =============================================================================
// StripeService — wraps Stripe.net so the rest of the app stays decoupled.
// MOCK MODE (Stripe:Mock=true in appsettings) generates fake IDs without
// hitting Stripe. Useful for local dev / demo without test keys.
// =============================================================================
using Stripe;

namespace BlackDog.Api.Services;

public record SetupIntentResult(string CustomerId, string SetupIntentId, string ClientSecret);

public record OffSessionChargeResult(string PaymentIntentId, string Status, bool Succeeded);

public class StripeService
{
    private readonly bool   _mock;
    private readonly string _apiKey;
    private readonly ILogger<StripeService> _log;

    public StripeService(IConfiguration cfg, ILogger<StripeService> log)
    {
        _log    = log;
        _mock   = cfg.GetValue<bool>("Stripe:Mock");
        _apiKey = cfg["Stripe:ApiKey"] ?? string.Empty;
        if (!_mock)
        {
            StripeConfiguration.ApiKey = _apiKey;
        }
    }

    // -------------------------------------------------------------------------
    // Save a card without charging. Returns IDs to be persisted on the booking.
    // -------------------------------------------------------------------------
    public async Task<SetupIntentResult> CreateSetupIntentAsync(string email, string customerName)
    {
        if (_mock)
        {
            var custId = $"cus_mock_{Guid.NewGuid():N}".Substring(0, 18);
            var siId   = $"seti_mock_{Guid.NewGuid():N}".Substring(0, 19);
            _log.LogInformation("[STRIPE MOCK] SetupIntent {Id} for {Email}", siId, email);
            return new SetupIntentResult(custId, siId, $"{siId}_secret_mock");
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
            PaymentMethodTypes  = new List<string> { "card" },
            Usage               = "off_session",  // required for later off-session charges
        });

        return new SetupIntentResult(customer.Id, si.Id, si.ClientSecret);
    }

    // -------------------------------------------------------------------------
    // Verify the SetupIntent succeeded and return the resolved payment method.
    // -------------------------------------------------------------------------
    public async Task<string> VerifySetupIntentAsync(string setupIntentId, string fallbackPaymentMethodId)
    {
        if (_mock) return string.IsNullOrWhiteSpace(fallbackPaymentMethodId)
            ? $"pm_mock_{Guid.NewGuid():N}".Substring(0, 18)
            : fallbackPaymentMethodId;

        var siService = new SetupIntentService();
        var si = await siService.GetAsync(setupIntentId);
        if (si.Status != "succeeded")
            throw new InvalidOperationException($"Carta non salvata (stato: {si.Status})");

        return si.PaymentMethodId ?? fallbackPaymentMethodId;
    }

    // -------------------------------------------------------------------------
    // Off-session charge — used for the no-show penalty.
    // -------------------------------------------------------------------------
    public async Task<OffSessionChargeResult> ChargeOffSessionAsync(
        decimal amountEur, string customerId, string paymentMethodId,
        string description, IDictionary<string, string>? metadata = null)
    {
        if (_mock)
        {
            var pi = $"pi_mock_{Guid.NewGuid():N}".Substring(0, 18);
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
            Metadata      = metadata is null ? null : new Dictionary<string, string>(metadata),
        });

        return new OffSessionChargeResult(pi2.Id, pi2.Status, pi2.Status == "succeeded");
    }
}
