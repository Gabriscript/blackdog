// =============================================================================
// EmailService — sends email via Resend (https://resend.com).
// If Email:ResendApiKey is empty (local dev), logs the message instead.
// Configure:
//   "Resend": { "ApiToken": "re_XXXXXXXXXX" }   ← picked up by AddResend()
//   "Email":  { "From": "noreply@yourdomain.it" } ← must be a verified Resend domain
// =============================================================================
using Resend;

namespace BlackDog.Api.Services;

public interface IEmailService
{
    Task SendAsync(string to, string subject, string htmlBody);
}

public class EmailService : IEmailService
{
    private readonly IResend               _resend;
    private readonly IConfiguration        _cfg;
    private readonly ILogger<EmailService> _log;

    public EmailService(IResend resend, IConfiguration cfg, ILogger<EmailService> log)
    {
        _resend = resend; _cfg = cfg; _log = log;
    }

    public async Task SendAsync(string to, string subject, string htmlBody)
    {
        var apiKey = _cfg["Resend:ApiToken"];

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            // Dev fallback: print link to console so admin can copy it
            _log.LogWarning(
                "[EMAIL - Resend non configurato]\nTo: {To}\nSubject: {Subject}\n\n{Body}",
                to, subject, htmlBody);
            return;
        }

        var from = _cfg["Email:From"] ?? "noreply@blackdog.it";

        var msg = new EmailMessage();
        msg.From = from;
        msg.To.Add(to);
        msg.Subject = subject;
        msg.HtmlBody = htmlBody;

        await _resend.EmailSendAsync(msg);
        _log.LogInformation("[EMAIL via Resend] Sent to {To}: {Subject}", to, subject);
    }
}
