// =============================================================================
// Model changed without `dotnet ef migrations add`? MigrateAsync would refuse
// to start the app on deploy (EF 9+ treats pending model changes as an error);
// this fails first, in the test run. No database connection is opened.
// =============================================================================
using BlackDog.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BlackDog.Api.Tests;

public class MigrationTests
{
    [Fact]
    public void Model_has_no_changes_missing_from_migrations()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql("Host=unused").Options;
        using var db = new AppDbContext(opts);

        Assert.False(db.Database.HasPendingModelChanges());
    }
}
