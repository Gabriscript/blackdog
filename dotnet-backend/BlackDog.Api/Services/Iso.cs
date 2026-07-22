// =============================================================================
// Iso — ISO 8601 wall-clock serialization for API payloads.
// DateTime.ToString with a custom format uses the OS culture's separators:
// on an Italian Windows host "HH:mm:ss" renders as "18.00.00", which the
// frontend's new Date(...) cannot parse. Every date-time that leaves the API
// must go through this helper.
// =============================================================================
using System.Globalization;

namespace BlackDog.Api.Services;

public static class Iso
{
    public static string Format(DateTime dt) =>
        dt.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
}
