// @ts-check
// The flows that matter, end to end: a customer books, manages the booking
// from the magic link, loses a race for a slot; the owner logs in and acts.
const { test, expect } = require("@playwright/test");
const { ADMIN, API } = require("./stack");

const pad = (n) => String(n).padStart(2, "0");
// Local YYYY-MM-DD `n` days ahead: far enough to never be "past".
const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Books straight through the API, like another customer would.
async function bookViaApi(request, { date, start, end, name }) {
  const [room] = await (await request.get(`${API}/rooms`)).json();
  const si = await (await request.post(`${API}/bookings/setup-intent`, {
    data: { customer_name: name, email: "api@example.test" },
  })).json();
  const res = await request.post(`${API}/bookings`, {
    data: {
      customer_name: name, email: "api@example.test", room_id: room.id,
      start_time: `${date}T${start}:00`, end_time: `${date}T${end}:00`,
      setup_intent_id: si.setup_intent_id, accepted_terms: true,
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// 18:00-20:00 on `date` in the first room, form ready to submit. Waits for the
// availability of that date so the page has seen the slot free.
async function fillBookingForm(page, date) {
  await page.goto("/prenota");
  const availability = page.waitForResponse((r) => r.url().includes(`date=${date}`));
  await page.getByTestId("date-input").fill(date);
  await availability;
  await page.getByTestId("start-time-select").selectOption("16"); // 18:00
  await page.getByTestId("end-time-select").selectOption("20");   // 20:00
  await page.getByTestId("name-input").fill("E2E Band");
  await page.getByTestId("email-input").fill("e2e@example.test");
  await page.getByTestId("terms-checkbox").check();
}

test.describe("customer", () => {
  test("books a slot, then cancels it from the magic link", async ({ page }) => {
    await fillBookingForm(page, day(3));
    await page.getByTestId("submit-booking-button").click();

    await expect(page).toHaveURL(/\/prenota\/successo$/);
    await expect(page.getByTestId("booking-summary")).toContainText("E2E Band");
    await expect(page.getByTestId("booking-summary")).toContainText("18:00 – 20:00");

    await page.getByTestId("my-booking-link-go").click();
    await expect(page.getByTestId("my-booking-status")).toHaveText(/confermata/i);
    await page.getByTestId("my-booking-cancel-button").click();
    await page.getByTestId("my-booking-confirm-cancel").click();
    await expect(page.getByTestId("my-booking-status")).toHaveText(/annullata/i);
  });

  test("loses the slot to someone faster: 409, and the timeline shows it taken", async ({ page, request }) => {
    const date = day(4);
    await fillBookingForm(page, date);
    await bookViaApi(request, { date, start: "18:00", end: "20:00", name: "Più Veloce" });

    await page.getByTestId("submit-booking-button").click();

    await expect(page.getByText("Questo slot è già prenotato")).toBeVisible();
    await expect(page.getByTestId("schedule-cell-16")).toHaveAttribute("aria-label", /occupato/);
    await expect(page.getByTestId("conflict-warning")).toBeVisible();
    await expect(page.getByTestId("submit-booking-button")).toBeDisabled();
  });

  test("an unknown magic link says so", async ({ page }) => {
    await page.goto("/mia-prenotazione/non-esiste");
    await expect(page.getByTestId("my-booking-error")).toContainText("Prenotazione non trovata");
  });

  test("an unknown URL lands on the home page", async ({ page }) => {
    await page.goto("/pagina-che-non-esiste");
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect(page.getByTestId("hero-title")).toBeVisible();
  });
});

test.describe("admin", () => {
  test("a wrong password stays on the login, with a message", async ({ page }) => {
    await page.goto("/admin");
    await page.getByTestId("admin-email-input").fill(ADMIN.email);
    await page.getByTestId("admin-password-input").fill("not-the-password");
    await page.getByTestId("admin-login-button").click();

    await expect(page.getByText("Credenziali non valide")).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("logs in, finds a booking by date, cancels it and logs out", async ({ page, request }) => {
    const date = day(5);
    const booking = await bookViaApi(request, { date, start: "15:00", end: "17:00", name: "Da Annullare" });

    await page.goto("/admin");
    await page.getByTestId("admin-email-input").fill(ADMIN.email);
    await page.getByTestId("admin-password-input").fill(ADMIN.password);
    const login = page.waitForResponse((r) => r.url().endsWith("/api/auth/login"));
    await page.getByTestId("admin-login-button").click();

    // The session is an HttpOnly cookie: neither the body nor JavaScript sees it.
    expect(await (await login).json()).toEqual({ ok: true });
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    expect(await page.evaluate(() => document.cookie)).not.toContain("access_token");

    await page.getByTestId("filter-date-input").fill(date);
    await expect(page.getByTestId(`booking-row-${booking.id}`)).toContainText("Da Annullare");
    await page.getByTestId(`mark-cancel-${booking.id}`).click();
    await page.getByTestId("confirm-dialog-confirm-cancel").click();
    await expect(page.getByTestId(`status-badge-${booking.id}`)).toHaveText(/annullata/i);

    // Only the server can delete that cookie: after logout the dashboard is shut.
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("an expired or forged session goes back to the login", async ({ page }) => {
    await page.goto("/admin");
    await page.context().addCookies([
      { name: "access_token", value: "expired.or.forged", url: new URL("/", page.url()).href },
    ]);
    await page.goto("/admin/dashboard");

    await expect(page).toHaveURL(/\/admin$/);
  });
});
