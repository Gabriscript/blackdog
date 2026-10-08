// =============================================================================
// EmailService — sends email via Resend (https://resend.com).
// If Resend:ApiToken is empty (local dev), logs the message instead.
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

public class EmailService(IResend resend, IConfiguration cfg, ILogger<EmailService> log) : IEmailService
{
    public async Task SendAsync(string to, string subject, string htmlBody)
    {
        var apiKey = cfg["Resend:ApiToken"];

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            // Dev fallback: print link to console so admin can copy it
            log.LogWarning(
                "[EMAIL - Resend non configurato]\nTo: {To}\nSubject: {Subject}\n\n{Body}",
                to, subject, htmlBody);
            return;
        }

        await resend.EmailSendAsync(new EmailMessage
        {
            From     = cfg["Email:From"] ?? "noreply@blackdog.it",
            To       = { to },
            Subject  = subject,
            HtmlBody = htmlBody,
        });
        log.LogInformation("[EMAIL via Resend] Sent to {To}: {Subject}", to, subject);
    }
}
