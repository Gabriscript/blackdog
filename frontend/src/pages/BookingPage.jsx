import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { CalendarIcon } from "lucide-react";
import { api } from "../lib/api";
import SiteHeader from "../components/SiteHeader";
import Field from "../components/Field";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar } from "../components/ui/calendar";

import {
  OPEN_HOUR, CLOSE_HOUR, TOTAL_SLOTS,
  MAX_DURATION_HOURS, MAX_DURATION_SLOTS, MIN_DURATION_SLOTS,
  pad, buildSlots, todayStr, isValidDateStr, slotToIso,
  isSlotPast, firstSelectableSlot, isoRangeToSlotRange, fmtEur,
} from "../lib/slots";

const SLOTS = buildSlots();


// =============================================================================
// PAGE
// =============================================================================
export default function BookingPage() {
  const [stripePromise, setStripePromise] = useState(null);
  const [penalty, setPenalty] = useState(20);
  const [mock, setMock] = useState(null);

  useEffect(() => {
    api.get("/config/stripe").then(({ data }) => {
      setPenalty(data.penalty ?? 20);
      setMock(!!data.mock);
      if (!data.mock && data.publishable_key) {
        setStripePromise(loadStripe(data.publishable_key));
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6]">
      <SiteHeader showCta={false} />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="font-mono-tech text-[#D92D20] mb-4">Prenotazione</div>
        <h1 className="font-display text-4xl sm:text-5xl mb-2">Prenota la tua sessione</h1>
        <p className="text-[#A1A1AA] mb-10 max-w-xl">
          Sala aperta dalle <span className="text-[#F3F4F6] font-bold">{pad(OPEN_HOUR)}:00</span> alle{" "}
          <span className="text-[#F3F4F6] font-bold">{pad(CLOSE_HOUR)}:00 del giorno dopo</span>.
          Penale no-show: <span className="text-[#F3F4F6] font-bold">{fmtEur(penalty)}</span>.
        </p>

        {mock === null ? (
          <div className="text-[#A1A1AA] font-mono-tech">Caricamento…</div>
        ) : mock ? (
          <BookingForm penalty={penalty} mock={true} />
        ) : stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ appearance: { theme: "night", variables: { colorPrimary: "#D92D20" } } }}
          >
            <BookingForm penalty={penalty} mock={false} />
          </Elements>
        ) : (
          <div className="text-[#DC2626] font-mono-tech">Stripe non configurato.</div>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// FORM
// =============================================================================
function BookingForm({ penalty, mock }) {
  const navigate = useNavigate();
  const stripe   = mock ? null : useStripe();   // eslint-disable-line react-hooks/rules-of-hooks
  const elements = mock ? null : useElements(); // eslint-disable-line react-hooks/rules-of-hooks

  const [rooms, setRooms]     = useState([]);
  const [roomId, setRoomId]   = useState("");
  const [date, setDate]       = useState(todayStr());
  const [startSlot, setStart] = useState(16);   // 18:00
  const [endSlot, setEnd]     = useState(20);   // 20:00
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [terms, setTerms]     = useState(false);
  const [mockCard, setMockCard]       = useState("4242 4242 4242 4242");
  const [bookedSlots, setBookedSlots] = useState([]);
  const [submitting, setSubmitting]   = useState(false);
  const [clickPhase, setClickPhase]   = useState("start"); // "start" | "end"

  // load rooms
  useEffect(() => {
    api.get("/rooms").then(({ data }) => {
      setRooms(data);
      if (data.length) setRoomId((cur) => cur || data[0].id);
    });
  }, []);

  // refresh availability whenever date or room changes
  useEffect(() => {
    if (!date || !roomId) return;
    api.get("/bookings/availability", { params: { date, room_id: roomId } })
      .then(({ data }) => setBookedSlots(data.booked_slots || []))
      .catch(() => setBookedSlots([]));
  }, [date, roomId]);

  // ---- derived state ---------------------------------------------------------
  const dateValid = isValidDateStr(date);

  // Occupied slot ranges (in cell indices, relative to selected date)
  const occupiedRanges = useMemo(
    () => bookedSlots.map((b) => isoRangeToSlotRange(b.start_time, b.end_time, date)),
    [bookedSlots, date]
  );

  const isCellOccupied = (idx) =>
    occupiedRanges.some((r) => r.start <= idx && idx < r.end);

  // Cells whose start time already went by (only affects today's date)
  const isCellPast = (idx) => isSlotPast(date, SLOTS[idx]);

  // When the chosen date is today and the current selection slid into the
  // past (e.g. page opened in the evening with the 18:00 default), snap the
  // start to the first future slot. -1 → the whole day is gone.
  const firstSelectable = dateValid ? firstSelectableSlot(date, SLOTS) : 0;
  useEffect(() => {
    if (!dateValid || firstSelectable < 0) return;
    if (isSlotPast(date, SLOTS[startSlot])) {
      setStart(firstSelectable);
      setEnd(Math.min(TOTAL_SLOTS, firstSelectable + 4)); // default 2h
      setClickPhase("start");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dateValid, firstSelectable]);

  // valid end slot range (depends on selected start)
  const minEnd = startSlot + MIN_DURATION_SLOTS;
  const maxEnd = Math.min(TOTAL_SLOTS, startSlot + MAX_DURATION_SLOTS);

  // keep end coherent: snap up if too close, snap down if too far
  useEffect(() => {
    if (endSlot < minEnd) setEnd(Math.min(minEnd, TOTAL_SLOTS));
    else if (endSlot > maxEnd) setEnd(maxEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSlot]);

  // overlap check between user's selection and occupied ranges
  const conflict = useMemo(
    () => occupiedRanges.some((r) => startSlot < r.end && r.start < endSlot),
    [occupiedRanges, startSlot, endSlot]
  );

  // Reset selection when room changes so user doesn't accidentally book with
  // a stale selection that overlaps in the new room
  function handleRoomChange(newRoomId) {
    setRoomId(newRoomId);
    setStart(16);
    setEnd(20);
    setClickPhase("start");
  }

  // -------------------------------------------------------------------------
  // CLICKABLE TIMELINE — two-phase select:
  //   1st click on free cell → set start (end auto = start+30min)
  //   2nd click on a later free cell → extend end (clamped to MAX 12h
  //   AND to the first occupied cell encountered, so the range stays valid)
  //   click before current start → reset (treat as new start)
  // -------------------------------------------------------------------------
  function handleCellClick(idx) {
    if (isCellOccupied(idx) || isCellPast(idx)) return;   // ignore taken/past cells
    if (clickPhase === "start" || idx < startSlot) {
      setStart(idx);
      setEnd(Math.min(TOTAL_SLOTS, idx + 1));
      setClickPhase("end");
      return;
    }
    // phase === "end" AND idx >= startSlot
    let target = idx + 1; // clicked cell is treated as last occupied half-hour
    const maxAllowed = Math.min(TOTAL_SLOTS, startSlot + MAX_DURATION_SLOTS);
    if (target > maxAllowed) target = maxAllowed;
    // clamp before the first occupied cell after start (so we don't span over)
    for (let i = startSlot; i < target; i++) {
      if (isCellOccupied(i)) { target = i; break; }
    }
    if (target <= startSlot) target = startSlot + 1;
    setEnd(target);
    setClickPhase("start");   // next click starts a new selection
  }

  const canSubmit =
    name.trim() && email.trim() && roomId && dateValid &&
    firstSelectable >= 0 && !isCellPast(startSlot) &&
    startSlot < endSlot && !conflict && terms && !submitting;

  // ---- submit ----------------------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Compila tutti i campi e accetta i termini.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: si } = await api.post("/bookings/setup-intent", {
        customer_name: name, email,
      });

      let paymentMethodId;
      if (mock) {
        if (!mockCard.replace(/\s/g, "").match(/^\d{15,19}$/)) {
          toast.error("Inserisci un numero carta valido (mock).");
          setSubmitting(false); return;
        }
        paymentMethodId = `pm_mock_${Math.random().toString(36).slice(2, 14)}`;
      } else {
        const result = await stripe.confirmCardSetup(si.client_secret, {
          payment_method: {
            card: elements.getElement(CardElement),
            billing_details: { name, email },
          },
        });
        if (result.error) {
          toast.error(result.error.message || "Errore carta.");
          setSubmitting(false); return;
        }
        paymentMethodId = result.setupIntent.payment_method;
      }

      const startISO = slotToIso(date, SLOTS[startSlot]);
      const endISO   = slotToIso(date, SLOTS[endSlot]);

      const { data: booking } = await api.post("/bookings", {
        customer_name: name, email,
        start_time: startISO, end_time: endISO,
        room_id: roomId,
        stripe_customer_id: si.customer_id,
        stripe_payment_method_id: paymentMethodId,
        setup_intent_id: si.setup_intent_id,
        accepted_terms: terms,
      });

      toast.success("Prenotazione confermata!");
      navigate("/prenota/successo", { state: { booking } });
    } catch (err) {
      const detail = err?.response?.data?.detail || err.message || "Errore sconosciuto";
      toast.error(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setSubmitting(false);
    }
  }

  // Find the currently selected room object for display
  const selectedRoom = rooms.find((r) => r.id === roomId);

  // ---- render ----------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 01 — ROOM TABS + DETAILS */}
      <div className="border border-[#333333] bg-[#171717] p-6 sm:p-8 space-y-6">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl text-[#222] leading-none select-none" aria-hidden="true">01</span>
          <span className="font-mono-tech text-[#A1A1AA]">Sala e orario</span>
        </div>

        {/* ROOM TABS */}
        <div className="flex gap-0" data-testid="room-tabs">
          {rooms.map((r) => {
            const active = r.id === roomId;
            return (
              <button
                key={r.id}
                type="button"
                data-testid={`room-tab-${r.id}`}
                onClick={() => handleRoomChange(r.id)}
                className={`
                  relative flex-1 py-2 px-2 text-center font-bold uppercase tracking-wider
                  border border-[#333333] transition-all duration-200
                  ${active
                    ? "bg-[#D92D20] text-white border-[#D92D20] z-10"
                    : "bg-[#0a0a0a] text-[#A1A1AA] hover:bg-[#262626] hover:text-[#F3F4F6]"
                  }
                  ${r === rooms[0] ? "" : "-ml-px"}
                `}
              >
                <span className="block font-display text-sm">{r.name}</span>
              </button>
            );
          })}
        </div>

        {/* DATE + TIME SELECTORS */}
        <div className="grid sm:grid-cols-3 gap-6">
          <Field label="Data inizio sessione">
            <DatePickerField
              value={date}
              onChange={setDate}
              min={todayStr()}
            />
          </Field>
          <Field label="Dalle">
            <select
              data-testid="start-time-select"
              value={startSlot}
              onChange={(e) => setStart(Number(e.target.value))}
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            >
              {SLOTS.slice(0, TOTAL_SLOTS)
                .filter((s) => !isSlotPast(date, s))
                .map((s) => (
                  <option key={s.index} value={s.index} className="bg-[#171717]">
                    {s.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={`Alle (max ${MAX_DURATION_HOURS}h)`}>
            <select
              data-testid="end-time-select"
              value={endSlot}
              onChange={(e) => setEnd(Number(e.target.value))}
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            >
              {SLOTS.slice(minEnd, maxEnd + 1).map((s) => (
                <option key={s.index} value={s.index} className="bg-[#171717]">
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Selected room indicator */}
        {selectedRoom && (
          <div className="flex items-center gap-2 font-mono-tech text-xs text-[#A1A1AA]">
            <span className="inline-block w-2 h-2 bg-[#D92D20]" />
            Stai prenotando: <span className="text-[#F3F4F6] font-bold">{selectedRoom.name}</span>
          </div>
        )}

        {/* TIMELINE */}
        <Timeline
          slots={SLOTS}
          isOccupied={isCellOccupied}
          isPast={isCellPast}
          startSlot={startSlot}
          endSlot={endSlot}
          conflict={conflict}
          onCellClick={handleCellClick}
          clickPhase={clickPhase}
        />

        {!dateValid && (
          <div
            className="border border-[#DC2626] bg-[#DC2626]/10 px-4 py-3 font-mono-tech text-sm text-[#DC2626]"
            data-testid="invalid-date-warning"
            role="alert"
          >
            Data non valida: usa il formato AAAA-MM-GG o scegli dal calendario
          </div>
        )}

        {dateValid && firstSelectable < 0 && (
          <div
            className="border border-[#DC2626] bg-[#DC2626]/10 px-4 py-3 font-mono-tech text-sm text-[#DC2626]"
            data-testid="day-past-warning"
            role="alert"
          >
            Tutti gli orari di questa data sono già passati: scegli un altro giorno
          </div>
        )}

        {conflict && (
          <div
            className="border border-[#DC2626] bg-[#DC2626]/10 px-4 py-3 font-mono-tech text-sm text-[#DC2626]"
            data-testid="conflict-warning"
            role="alert"
          >
            Slot non disponibile: la selezione si sovrappone a una prenotazione esistente
          </div>
        )}
      </div>

      {/* 02 — CONTACTS */}
      <div className="border border-[#333333] bg-[#171717] p-6 space-y-6">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl text-[#222] leading-none select-none" aria-hidden="true">02</span>
          <span className="font-mono-tech text-[#A1A1AA]">Contatti</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          <Field label="Nome e cognome">
            <input
              data-testid="name-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mario Rossi"
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
              required
            />
          </Field>
          <Field label="Email">
            <input
              data-testid="email-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@email.it"
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
              required
            />
          </Field>
        </div>
      </div>

      {/* 03 — CARD */}
      <div className="border border-[#333333] bg-[#171717] p-6 space-y-6">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl text-[#222] leading-none select-none" aria-hidden="true">03</span>
          <span className="font-mono-tech text-[#A1A1AA]">
            Carta a garanzia {mock ? "· Modalità DEMO" : ""}
          </span>
        </div>
        {mock ? (
          <div className="space-y-3">
            <Field label="Numero carta (demo)">
              <input
                data-testid="mock-card-input"
                type="text" value={mockCard}
                onChange={(e) => setMockCard(e.target.value)}
                className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full font-mono-tech tracking-widest"
              />
            </Field>
            <p className="text-[#A1A1AA] text-sm">
              <span className="text-[#D92D20] font-bold">DEMO MODE</span>: nessun pagamento reale.
              In produzione qui appare lo Stripe Card Element.
            </p>
          </div>
        ) : (
          <>
            <div data-testid="card-element-wrapper">
              <CardElement options={{
                hidePostalCode: true,
                style: {
                  base: {
                    color: "#F3F4F6", fontSize: "16px",
                    fontFamily: "Manrope, sans-serif",
                    "::placeholder": { color: "#6b7280" },
                  },
                  invalid: { color: "#DC2626" },
                },
              }} />
            </div>
            <p className="text-[#A1A1AA] text-sm">
              Nessun addebito immediato. Carta salvata in modo sicuro tramite Stripe.
            </p>
          </>
        )}

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            data-testid="terms-checkbox"
            type="checkbox" checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#D92D20]"
          />
          <span className="text-sm text-[#F3F4F6]">
            Accetto i termini: in caso di <span className="font-bold text-[#D92D20]">no-show</span> autorizzo
            l'addebito di una penale di <span className="font-bold">{fmtEur(penalty)}</span> sulla carta fornita.
          </span>
        </label>
      </div>

      <button
        data-testid="submit-booking-button"
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-[#D92D20] hover:bg-[#B91C1C] disabled:bg-[#333333] disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider px-8 py-4"
      >
        {submitting ? "Elaborazione…" : "Conferma prenotazione"}
      </button>
    </form>
  );
}


// =============================================================================
// TIMELINE — visual schedule of the day's operating window
//   • horizontal scroll on small screens
//   • red cells = already booked
//   • outlined green range = your selection
//   • hour labels every 2 cells (every hour)
// =============================================================================
function Timeline({ slots, isOccupied, isPast, startSlot, endSlot, conflict, onCellClick, clickPhase }) {
  // we render TOTAL_SLOTS cells (each = SLOT_MIN minutes)
  return (
    <div className="space-y-2" data-testid="schedule-timeline">
      <div className="flex items-center justify-between text-xs font-mono-tech text-[#A1A1AA]">
        <span>
          Disponibilità: {pad(OPEN_HOUR)}:00 &ndash; {pad(CLOSE_HOUR)}:00 (giorno dopo)
          <span className="ml-3 text-[#F3F4F6]">
            {clickPhase === "start" ? "Tocca uno slot libero per impostare l'inizio" : "Tocca uno slot per impostare la fine"}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <Legend swatch="bg-[#262626] border border-[#333333]" label="Libero" />
          <Legend swatch="bg-[#DC2626]" label="Occupato" />
          <Legend swatch={`border-2 ${conflict ? "border-[#DC2626] bg-[#DC2626]/30" : "border-[#16A34A] bg-[#16A34A]/30"}`} label="La tua scelta" />
        </div>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 pb-1">
        <div
          className="grid gap-px min-w-[680px]"
          style={{ gridTemplateColumns: `repeat(${slots.length - 1}, minmax(22px, 1fr))` }}
        >
          {slots.slice(0, slots.length - 1).map((s, idx) => {
            const occupied = isOccupied(idx);
            const past = !occupied && isPast(idx);
            const inSelection = !past && idx >= startSlot && idx < endSlot;
            const showHour = s.minute === 0;
            const cls = occupied
              ? "bg-[#DC2626] cursor-not-allowed"
              : past
                ? "bg-[#111111] border border-[#1e1e1e] cursor-not-allowed"
                : inSelection
                  ? (conflict
                      ? "bg-[#DC2626]/30 border-2 border-[#DC2626] cursor-pointer"
                      : "bg-[#16A34A]/30 border-2 border-[#16A34A] cursor-pointer")
                  : "bg-[#262626] border border-[#333333] cursor-pointer hover:bg-[#404040] hover:border-[#D92D20]";
            return (
              <button
                key={idx}
                type="button"
                disabled={occupied || past}
                onClick={() => onCellClick(idx)}
                className={`relative h-10 ${cls} transition-none`}
                data-testid={`schedule-cell-${idx}`}
                aria-label={`${s.shortLabel}${s.isNextDay ? " giorno dopo" : ""}${occupied ? ", occupato" : past ? ", orario passato" : inSelection ? ", selezionato" : ", libero"}`}
                title={`${s.shortLabel}${s.isNextDay ? " (giorno dopo)" : ""}${occupied ? " · Occupato" : past ? " · Passato" : ""}`}
              >
                {showHour && (
                  <div className="absolute -bottom-5 left-0 text-[10px] font-mono-tech text-[#A1A1AA] whitespace-nowrap pointer-events-none">
                    {s.shortLabel}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-5" />{/* spacer for hour labels */}
    </div>
  );
}

function Legend({ swatch, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 ${swatch}`} />
      <span>{label}</span>
    </span>
  );
}

// =============================================================================
// DatePickerField — text input + calendar popup (Popover + shadcn Calendar)
// Typing and clicking both work.
// =============================================================================
function DatePickerField({ value, onChange, min }) {
  const [open, setOpen] = useState(false);

  // "YYYY-MM-DD" → Date object (local midnight, no TZ shift)
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const fromDate = min  ? new Date(min  + "T00:00:00") : undefined;

  function handleSelect(d) {
    if (!d) return;
    const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    onChange(str);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center border border-[#333333] focus-within:border-[#D92D20] transition-colors">
        <input
          data-testid="date-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="YYYY-MM-DD"
          className="bg-transparent text-[#F3F4F6] focus:outline-none px-4 py-3 flex-1 min-w-0"
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Apri calendario"
            className="px-3 py-3 text-[#A1A1AA] hover:text-[#D92D20] transition-colors"
          >
            <CalendarIcon size={16} />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        className="w-auto p-0 bg-[#171717] border border-[#333333] shadow-xl"
        align="start"
      >
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          fromDate={fromDate}
          initialFocus
          classNames={{
            months:       "flex flex-col",
            month:        "space-y-3 p-3",
            caption:      "flex justify-center pt-1 relative items-center",
            caption_label:"text-sm font-medium text-[#F3F4F6]",
            nav:          "space-x-1 flex items-center",
            nav_button:   "h-7 w-7 bg-transparent text-[#A1A1AA] hover:text-[#D92D20] hover:bg-[#262626] flex items-center justify-center",
            nav_button_previous: "absolute left-1",
            nav_button_next:     "absolute right-1",
            table:        "w-full border-collapse",
            head_row:     "flex",
            head_cell:    "text-[#A1A1AA] rounded-md w-8 font-normal text-[0.75rem] text-center",
            row:          "flex w-full mt-1",
            cell:         "relative p-0 text-center text-sm",
            day:          "h-8 w-8 p-0 font-normal text-[#F3F4F6] hover:bg-[#D92D20] hover:text-white rounded-sm transition-colors",
            day_selected: "bg-[#D92D20] text-white hover:bg-[#B91C1C] rounded-sm",
            day_today:    "bg-[#262626] text-[#F3F4F6] rounded-sm",
            day_outside:  "text-[#555555] opacity-50",
            day_disabled: "text-[#555555] opacity-30 cursor-not-allowed",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
