using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BlackDog.Api.Migrations
{
    /// <inheritdoc />
    public partial class BookingNoOverlap : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Postgres itself refuses two non-cancelled bookings of the same room
            // whose [start, end) ranges overlap. The check in BookingService is
            // check-then-insert and loses races; this cannot. Same predicate as
            // that check (adjacent slots are fine, cancelled ones don't count).
            // btree_gist lets the GiST index compare the uuid with "=".
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");
            migrationBuilder.Sql("""
                ALTER TABLE "Bookings" ADD CONSTRAINT "EX_Bookings_NoOverlap"
                EXCLUDE USING gist ("RoomId" WITH =, tsrange("StartTime", "EndTime") WITH &&)
                WHERE ("Status" <> 'cancelled');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "Bookings" DROP CONSTRAINT "EX_Bookings_NoOverlap";""");
        }
    }
}
