// =============================================================================
// Unit tests for the half-hour booking grid helpers (src/lib/slots.js).
// Run: npm test -- --watchAll=false
// =============================================================================
import {
  TOTAL_SLOTS,
  buildSlots,
  todayStr,
  isValidDateStr,
  slotToIso,
  isSlotPast,
  firstSelectableSlot,
  isoRangeToSlotRange,
  fmtEur,
  fmtDateShort,
  fmtDateLong,
  fmtTime,
} from "./slots";

const SLOTS = buildSlots();

describe("buildSlots", () => {
  test("creates 31 edges for the 10:00 → 01:00 (+1) window", () => {
    expect(TOTAL_SLOTS).toBe(30);
    expect(SLOTS).toHaveLength(31);
  });

  test("first edge is 10:00 same day, last edge is 01:00 next day", () => {
    expect(SLOTS[0]).toMatchObject({ hour: 10, minute: 0, isNextDay: false });
    expect(SLOTS[30]).toMatchObject({ hour: 1, minute: 0, isNextDay: true });
    expect(SLOTS[30].label).toContain("+1");
  });

  test("midnight rollover happens at index 28", () => {
    expect(SLOTS[27]).toMatchObject({ hour: 23, minute: 30, isNextDay: false });
    expect(SLOTS[28]).toMatchObject({ hour: 0, minute: 0, isNextDay: true });
  });
});

describe("isValidDateStr", () => {
  test("accepts a normal date", () => {
    expect(isValidDateStr("2026-06-13")).toBe(true);
  });
  test("rejects malformed or impossible dates", () => {
    expect(isValidDateStr("13/06/2026")).toBe(false);
    expect(isValidDateStr("2026-6-13")).toBe(false);
    expect(isValidDateStr("2026-02-31")).toBe(false); // overflows to March
    expect(isValidDateStr("garbage")).toBe(false);
    expect(isValidDateStr("")).toBe(false);
  });
});

describe("slotToIso", () => {
  test("same-day slot keeps the chosen date", () => {
    expect(slotToIso("2026-06-13", SLOTS[16])).toBe("2026-06-13T18:00:00");
  });
  test("next-day slot rolls over to the following date", () => {
    expect(slotToIso("2026-06-13", SLOTS[28])).toBe("2026-06-14T00:00:00");
    expect(slotToIso("2026-06-13", SLOTS[30])).toBe("2026-06-14T01:00:00");
  });
  test("month rollover works", () => {
    expect(slotToIso("2026-06-30", SLOTS[29])).toBe("2026-07-01T00:30:00");
  });
});

describe("isoRangeToSlotRange", () => {
  test("maps a 15:00-18:00 booking to cells 10..16", () => {
    const r = isoRangeToSlotRange("2026-06-13T15:00:00", "2026-06-13T18:00:00", "2026-06-13");
    expect(r).toEqual({ start: 10, end: 16 });
  });
  test("clips ranges that start before the operating window", () => {
    const r = isoRangeToSlotRange("2026-06-13T08:00:00", "2026-06-13T11:00:00", "2026-06-13");
    expect(r).toEqual({ start: 0, end: 2 });
  });
  test("clips ranges that end after the window close", () => {
    const r = isoRangeToSlotRange("2026-06-13T23:00:00", "2026-06-14T03:00:00", "2026-06-13");
    expect(r).toEqual({ start: 26, end: 30 });
  });
  test("handles next-day (00:00-01:00) bookings inside the window", () => {
    const r = isoRangeToSlotRange("2026-06-14T00:00:00", "2026-06-14T01:00:00", "2026-06-13");
    expect(r).toEqual({ start: 28, end: 30 });
  });
});

describe("isSlotPast / firstSelectableSlot", () => {
  // Fixed "now": 2026-06-13 at 15:10 local time
  const now = new Date("2026-06-13T15:10:00");

  test("slots earlier today are past, future ones are not", () => {
    expect(isSlotPast("2026-06-13", SLOTS[0], now)).toBe(true);   // 10:00
    expect(isSlotPast("2026-06-13", SLOTS[10], now)).toBe(true);  // 15:00 (started)
    expect(isSlotPast("2026-06-13", SLOTS[11], now)).toBe(false); // 15:30
    expect(isSlotPast("2026-06-13", SLOTS[28], now)).toBe(false); // 00:00 +1
  });

  test("no slot of a future date is past", () => {
    expect(isSlotPast("2026-06-14", SLOTS[0], now)).toBe(false);
  });

  test("every slot of a previous date is past", () => {
    expect(isSlotPast("2026-06-12", SLOTS[29], now)).toBe(true);
  });

  test("firstSelectableSlot skips past edges for today", () => {
    expect(firstSelectableSlot("2026-06-13", SLOTS, now)).toBe(11); // 15:30
    expect(firstSelectableSlot("2026-06-14", SLOTS, now)).toBe(0);  // full day free
  });

  test("firstSelectableSlot returns -1 when the whole day is gone", () => {
    expect(firstSelectableSlot("2026-06-12", SLOTS, now)).toBe(-1);
  });

  test("late night: next-day cells are still selectable for today's date", () => {
    const lateNow = new Date("2026-06-13T23:50:00");
    expect(firstSelectableSlot("2026-06-13", SLOTS, lateNow)).toBe(28); // 00:00 +1
  });
});

describe("fmtEur", () => {
  test("formats with Italian decimal comma", () => {
    expect(fmtEur(20)).toBe("20,00 €");
    expect(fmtEur(15.5)).toBe("15,50 €");
  });
});

describe("date/time display formatters", () => {
  // A 00:30 slot must still read as the day it belongs to — no Date parsing,
  // no timezone, no off-by-one-day.
  test("fmtDateShort reverses the ISO date without parsing it", () => {
    expect(fmtDateShort("2026-06-13T18:00:00")).toBe("13.06.2026");
    expect(fmtDateShort("2026-06-14T00:30:00")).toBe("14.06.2026");
  });

  test("fmtDateLong spells the month in Italian", () => {
    expect(fmtDateLong("2026-06-13T18:00:00")).toBe("13 giugno 2026");
  });

  test("fmtTime slices HH:mm", () => {
    expect(fmtTime("2026-06-13T18:00:00")).toBe("18:00");
    expect(fmtTime("2026-06-14T00:30:00")).toBe("00:30");
  });

  test("all formatters tolerate a missing value", () => {
    expect(fmtDateShort(undefined)).toBe("");
    expect(fmtDateLong(null)).toBe("");
    expect(fmtTime("")).toBe("");
  });
});

describe("todayStr", () => {
  test("formats a date as YYYY-MM-DD", () => {
    expect(todayStr(new Date("2026-06-13T15:10:00"))).toBe("2026-06-13");
  });
});
