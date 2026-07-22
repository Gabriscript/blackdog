// =============================================================================
// Iso.Format must be culture-invariant. On an Italian Windows host the default
// culture renders "HH:mm:ss" as "18.00.00" (dots), which broke every date the
// API sent to the frontend. These tests pin the fix.
// =============================================================================
using System.Globalization;
using BlackDog.Api.Services;

namespace BlackDog.Api.Tests;

public class IsoTests
{
    [Fact]
    public void Format_uses_colons_even_under_italian_culture()
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            // it-IT historically uses "." as time separator on Windows
            CultureInfo.CurrentCulture = new CultureInfo("it-IT");
            var dt = new DateTime(2026, 6, 13, 18, 0, 0);
            Assert.Equal("2026-06-13T18:00:00", Iso.Format(dt));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    [Fact]
    public void Format_pads_single_digit_components()
    {
        var dt = new DateTime(2026, 1, 2, 3, 4, 5);
        Assert.Equal("2026-01-02T03:04:05", Iso.Format(dt));
    }

    [Fact]
    public void Format_output_is_parseable_by_javascript_date_grammar()
    {
        // The frontend does new Date(value): the value must match the strict
        // ISO 8601 date-time grammar (no locale separators).
        var s = Iso.Format(new DateTime(2026, 12, 31, 23, 30, 0));
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", s);
    }
}
