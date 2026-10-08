using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BlackDog.Api.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LoginAttempts",
                columns: table => new
                {
                    Identifier = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    LastAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LoginAttempts", x => x.Identifier);
                });

            migrationBuilder.CreateTable(
                name: "Rooms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PricePerHour = table.Column<decimal>(type: "numeric(10,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rooms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PasswordResetToken = table.Column<string>(type: "text", nullable: true),
                    PasswordResetTokenExpiry = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Bookings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RoomId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoomName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CustomerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    StartTime = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    EndTime = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StripeCustomerId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    StripePaymentMethodId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SetupIntentId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PenaltyCharged = table.Column<bool>(type: "boolean", nullable: false),
                    PenaltyPaymentIntentId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PenaltyStatus = table.Column<string>(type: "text", nullable: true),
                    PenaltyError = table.Column<string>(type: "text", nullable: true),
                    CancelToken = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Manual = table.Column<bool>(type: "boolean", nullable: false),
                    Paid = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bookings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Bookings_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_CancelToken",
                table: "Bookings",
                column: "CancelToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_RoomId_StartTime",
                table: "Bookings",
                columns: new[] { "RoomId", "StartTime" });

            migrationBuilder.CreateIndex(
                name: "IX_Bookings_SetupIntentId",
                table: "Bookings",
                column: "SetupIntentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Bookings");

            migrationBuilder.DropTable(
                name: "LoginAttempts");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "Rooms");
        }
    }
}
