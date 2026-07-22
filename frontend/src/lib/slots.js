// =============================================================================
// slots.js — pure helpers for the half-hour booking grid.
// Shared by BookingPage and AdminDashboard, unit-tested in slots.test.js.
//
// Operating window: OPEN_HOUR (same day) → CLOSE_HOUR (next day).
// Each slot index is a HALF-HOUR EDGE: 0 = 10:00, 1 = 10:30, …
// 28 = 00:00 (+1), 30 = 01:00 (+1).
// =============================================================================
export const OPEN_HOUR  = 10;        // 10:00 same day
export const CLOSE_HOUR = 1;         // 01:00 NEXT day
export const SLOT_MIN   = 30;        // grid resolution (minutes)
export const TOTAL_SLOTS = ((24 - OPEN_HOUR) + CLOSE_HOUR) * (60 / SLOT_MIN); // 30 cells

// Booking constraints (must match backend appsettings Booking section)
export const MIN_DURATION_MIN   = 30;
export const MAX_DURATION_HOURS = 12;
export const MAX_DURATION_SLOTS = MAX_DURATION_HOURS * (60 / SLOT_MIN);
export const MIN_DURATION_SLOTS = MIN_DURATION_MIN / SLOT_MIN;

export const pad = (n) => String(n).padStart(2, "0");

// Build the slot grid (TOTAL_SLOTS + 1 edges).
export function buildSlots() {
  const slots = [];
  for (let i = 0; i <= TOTAL_SLOTS; i++) {
    const totalMin   = i * SLOT_MIN;
    const hourAbs    = OPEN_HOUR + Math.floor(totalMin / 60);   // 10..25
    const isNextDay  = hourAbs >= 24;
    const hour       = hourAbs % 24;
    const minute     = totalMin % 60;
    slots.push({
      index:      i,
      hour, minute, isNextDay,
      label:      `${pad(hour)}:${pad(minute)}${isNextDay ? "  +1" : ""}`,
      shortLabel: `${pad(hour)}:${pad(minute)}`,
    });
  }
  return slots;
}

export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Strict YYYY-MM-DD validation (the date field is also free-text editable).
export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime()) && todayStr(d) === s;
}

// Local Date at which a slot edge starts, for a given booking date.
export function slotDate(dateStr, slot) {
  const d = new Date(dateStr + "T00:00:00");
  if (slot.isNextDay) d.setDate(d.getDate() + 1);
  d.setHours(slot.hour, slot.minute, 0, 0);
  return d;
}

// Compose a naive ISO datetime from a date string + slot info, handling
// next-day overflow (e.g. start 23:00 + 3h ends at 02:00 next day).
export function slotToIso(dateStr, slot) {
  const d = slotDate(dateStr, slot);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(slot.hour)}:${pad(slot.minute)}:00`;
}

// A slot edge is "past" when its start time has already gone by — used to
// grey out cells of the current day so users don't pick a slot the backend
// would reject at submit time.
export function isSlotPast(dateStr, slot, now = new Date()) {
  if (!isValidDateStr(dateStr)) return false;
  return slotDate(dateStr, slot).getTime() <= now.getTime();
}

// First selectable start index for a date (skips past edges). -1 if the whole
// day is gone.
export function firstSelectableSlot(dateStr, slots, now = new Date()) {
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (!isSlotPast(dateStr, slots[i], now)) return i;
  }
  return -1;
}

// Convert an occupied booking ISO range into slot indices (relative to the
// chosen booking date). Indices outside [0, TOTAL_SLOTS] are clipped so a slot
// that started on a previous day still shades the visible portion correctly.
export function isoRangeToSlotRange(startIso, endIso, baseDateStr) {
  const base = new Date(baseDateStr + "T" + pad(OPEN_HOUR) + ":00:00").getTime();
  const s    = new Date(startIso).getTime();
  const e    = new Date(endIso).getTime();
  const sIdx = Math.round((s - base) / (SLOT_MIN * 60 * 1000));
  const eIdx = Math.round((e - base) / (SLOT_MIN * 60 * 1000));
  return {
    start: Math.max(0, sIdx),
    end:   Math.min(TOTAL_SLOTS, eIdx),
  };
}

// "20.00 €" reads wrong in Italian — format money the local way ("20,00 €").
export function fmtEur(amount) {
  return `${Number(amount).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

// -----------------------------------------------------------------------------
// Display formatters for API date-times (naive wall-clock ISO, e.g.
// "2026-07-23T18:00:00"). Two formats on purpose: the admin table is dense and
// wants digits, the customer pages have room for the month spelled out.
// -----------------------------------------------------------------------------

// "23.07.2026" — sliced, never parsed, so no timezone can shift the day.
export const fmtDateShort = (iso) =>
  iso ? iso.slice(0, 10).split("-").reverse().join(".") : "";

// "23 luglio 2026"
export const fmtDateLong = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("it-IT", {
        day: "2-digit", month: "long", year: "numeric",
      })
    : "";

export const fmtTime = (iso) => (iso ? iso.slice(11, 16) : "");
