// =============================================================================
// AdminDashboard — bookings table + filters + row actions + admin walk-in
// =============================================================================
//   Sections:
//     1. STATE & helpers
//     2. ACTIONS (cancel, no-show, toggle paid, create manual)
//     3. RENDER — header, toolbar (with "Nuova prenotazione"), table
//     4. CONFIRM dialog (cancel / no-show)
//     5. NEW MANUAL BOOKING dialog
// =============================================================================
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, authHeader, getToken, setToken } from "../lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

import Field from "../components/Field";
import {
  TOTAL_SLOTS, MIN_DURATION_SLOTS, MAX_DURATION_SLOTS,
  buildSlots, todayStr, slotToIso,
  fmtEur, fmtDateShort as fmtDate, fmtTime,
} from "../lib/slots";

const SLOTS = buildSlots();

// -- 1. State & helpers -------------------------------------------------------
const PAID_COLOR  = "#06B6D4";   // cyan — used everywhere "paid" is referenced

const STATUS_LABEL = { confirmed: "Confermata", cancelled: "Annullata", "no-show": "No-show" };
// Status badges on the white table panel — filled like the PAGATO toggle so
// the state is readable at a glance.
const STATUS_BADGE = {
  confirmed: "bg-[#16A34A]/15 text-[#15803d] border-[#15803d]",
  cancelled: "bg-[#f5f5f5] text-[#525252] border-[#a3a3a3]",
  "no-show": "bg-[#DC2626]/10 text-[#B91C1C] border-[#DC2626]",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [bookings, setBookings]         = useState([]);
  const [rooms, setRooms]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [filterDate, setFilterDate]     = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [actingId, setActingId]         = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);  // { type, booking }
  const [newOpen, setNewOpen]           = useState(false);
  const [pwOpen, setPwOpen]             = useState(false);
  // No-show penalty, read from backend config so it always matches the charge
  const [penalty, setPenalty]           = useState(20);
  // Collapsed state per room — all expanded by default
  const [collapsed, setCollapsed]       = useState({});

  const toggleCollapse = (roomId) =>
    setCollapsed((prev) => ({ ...prev, [roomId]: !prev[roomId] }));

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate)   params.date   = filterDate;
      if (filterStatus) params.status = filterStatus;
      const { data } = await api.get("/admin/bookings", {
        params, headers: { ...authHeader() },
      });
      setBookings(data);
    } catch (err) {
      if (err?.response?.status === 401) { setToken(null); navigate("/admin"); return; }
      toast.error("Errore nel caricamento prenotazioni");
    } finally { setLoading(false); }
  }, [filterDate, filterStatus, navigate]);

  useEffect(() => {
    if (!getToken()) { navigate("/admin"); return; }
    fetchBookings();
    api.get("/rooms").then(({ data }) => setRooms(data)).catch(() => {});
    api.get("/config/stripe").then(({ data }) => setPenalty(data.penalty ?? 20)).catch(() => {});
  }, [fetchBookings, navigate]);

  // Group bookings by room_id
  const bookingsByRoom = useMemo(() => {
    const map = {};
    rooms.forEach((r) => { map[r.id] = []; });
    bookings.forEach((b) => {
      if (!map[b.room_id]) map[b.room_id] = [];
      map[b.room_id].push(b);
    });
    return map;
  }, [bookings, rooms]);
  // -- 2. Actions -------------------------------------------------------------
  async function doCancel(id) {
    setActingId(id);
    try {
      await api.post(`/admin/bookings/${id}/cancel`, null, { headers: { ...authHeader() } });
      toast.success("Prenotazione annullata");
      fetchBookings();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Errore";
      toast.error(typeof detail === "string" ? detail : "Errore");
    } finally { setActingId(null); setConfirmAction(null); }
  }

  async function doNoShow(id) {
    setActingId(id);
    try {
      const { data } = await api.post(`/admin/bookings/${id}/no-show`, null, { headers: { ...authHeader() } });
      toast.success(data.penalty_charged ? `Penale di ${fmtEur(penalty)} addebitata` : "No-show segnato");
      fetchBookings();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Errore addebito";
      toast.error(typeof detail === "string" ? detail : "Errore");
    } finally { setActingId(null); setConfirmAction(null); }
  }

  async function togglePaid(id) {
    setActingId(id);
    try {
      await api.post(`/admin/bookings/${id}/toggle-paid`, null, { headers: { ...authHeader() } });
      fetchBookings();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Errore";
      toast.error(typeof detail === "string" ? detail : "Errore");
    } finally { setActingId(null); }
  }

  async function handleLogout() {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    setToken(null); navigate("/admin");
  }

  // -- 3. Render --------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6]">
      <header className="border-b border-[#333333] bg-[#0a0a0a] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <div>
            <div className="font-mono-tech text-[#D92D20]">Admin</div>
            <div className="font-display text-xl">BLACK DOG</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPwOpen(true)}
              className="border border-[#333333] hover:bg-[#171717] text-[#A1A1AA] font-bold uppercase tracking-wider px-4 py-2.5 text-xs"
            >Cambia password</button>
            <button
              data-testid="logout-button"
              onClick={handleLogout}
              className="border border-[#333333] hover:bg-[#171717] text-[#F3F4F6] font-bold uppercase tracking-wider px-5 py-2.5 text-sm"
            >Esci</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <h1 className="font-display text-3xl sm:text-4xl">Prenotazioni</h1>
          <button
            data-testid="new-manual-booking-button"
            onClick={() => setNewOpen(true)}
            className="bg-[#D92D20] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider px-5 py-3 text-sm"
          >+ Nuova prenotazione</button>
        </div>

        <div className="border border-[#333333] bg-[#171717] p-5 flex flex-wrap items-end gap-4 mb-8">
          <label className="block">
            <span className="font-mono-tech text-[#A1A1AA] block mb-2">Data</span>
            <input
              data-testid="filter-date-input"
              type="date" value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="font-mono-tech text-[#A1A1AA] block mb-2">Stato</span>
            <select
              data-testid="filter-status-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-2"
            >
              <option value="" className="bg-[#171717]">Tutti</option>
              <option value="confirmed" className="bg-[#171717]">Confermata</option>
              <option value="cancelled" className="bg-[#171717]">Annullata</option>
              <option value="no-show" className="bg-[#171717]">No-show</option>
            </select>
          </label>
          <button
            data-testid="clear-filters-button"
            onClick={() => { setFilterDate(""); setFilterStatus(""); }}
            className="border border-[#333333] hover:bg-[#262626] text-[#F3F4F6] font-bold uppercase tracking-wider px-4 py-2 text-xs"
          >Azzera filtri</button>
          <div className="font-mono-tech text-[#A1A1AA] ml-auto" data-testid="bookings-count">
            {bookings.length} prenotazion{bookings.length === 1 ? "e" : "i"}
          </div>
        </div>

        {/* Room-grouped collapsible sections */}
        <div className="space-y-4" data-testid="room-sections">
          {loading && (
            <div className="border border-[#333333] bg-[#171717] py-8 text-center text-[#A1A1AA] font-mono-tech">
              Caricamento…
            </div>
          )}
          {!loading && rooms.map((room) => {
            const roomBookings = bookingsByRoom[room.id] || [];
            const isCollapsed = !!collapsed[room.id];
            return (
              <div key={room.id} className="border border-[#333333] bg-[#171717]" data-testid={`room-section-${room.id}`}>
                {/* Collapsible header */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(room.id)}
                  data-testid={`room-toggle-${room.id}`}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#1f1f1f] transition-colors"
                >
                  {/* Chevron */}
                  <svg
                    className={`w-4 h-4 text-[#A1A1AA] transition-transform duration-200 ${isCollapsed ? "" : "rotate-90"}`}
                    viewBox="0 0 16 16" fill="currentColor"
                  >
                    <path d="M6 3l5 5-5 5V3z" />
                  </svg>
                  <span className="font-display text-xl uppercase tracking-tight">{room.name}</span>
                  <span className="font-mono-tech text-xs text-[#A1A1AA] ml-2">
                    {roomBookings.length} prenotazion{roomBookings.length === 1 ? "e" : "i"}
                  </span>
                </button>

                {/* Table — hidden when collapsed. White panel for readability:
                    the page stays dark, the data sits on paper. */}
                {!isCollapsed && (
                  <div className="overflow-x-auto border-t border-[#333333] bg-white text-[#0a0a0a]">
                    <table className="w-full text-left border-collapse" data-testid={`bookings-table-${room.id}`}>
                      <thead>
                        <tr className="border-b border-[#d4d4d4] text-[#525252] font-mono-tech text-xs">
                          <th className="py-3 px-4">Data</th>
                          <th className="py-3 px-4">Orario</th>
                          <th className="py-3 px-4">Cliente</th>
                          <th className="py-3 px-4">Tipo</th>
                          <th className="py-3 px-4">Pagato</th>
                          <th className="py-3 px-4">Stato</th>
                          <th className="py-3 px-4 text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roomBookings.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-6 px-4 text-center text-[#525252] font-mono-tech text-sm">
                              Nessuna prenotazione per questa sala
                            </td>
                          </tr>
                        )}
                        {roomBookings.map((b) => (
                          <BookingRow
                            key={b.id} b={b} actingId={actingId}
                            onCancel={() => setConfirmAction({ type: "cancel", booking: b })}
                            onNoShow={() => setConfirmAction({ type: "no-show", booking: b })}
                            onTogglePaid={() => togglePaid(b.id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Confirm dialog (cancel / no-show) */}
      <ConfirmDialog
        action={confirmAction}
        penalty={penalty}
        onClose={() => setConfirmAction(null)}
        onCancel={() => doCancel(confirmAction.booking.id)}
        onNoShow={() => doNoShow(confirmAction.booking.id)}
      />

      {/* 5. New manual booking dialog */}
      <NewManualBookingDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        rooms={rooms}
        onCreated={() => { setNewOpen(false); fetchBookings(); }}
      />

      {/* 6. Change password dialog */}
      <ChangePasswordDialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// BookingRow — table row with paid toggle + appropriate action buttons
// -----------------------------------------------------------------------------
function BookingRow({ b, actingId, onCancel, onNoShow, onTogglePaid }) {
  const isManual = !!b.manual;
  return (
    <tr
      className={`border-b border-[#e5e5e5] hover:bg-[#f5f5f5] ${isManual ? "border-l-4" : ""}`}
      style={isManual ? { borderLeftColor: PAID_COLOR } : {}}
      data-testid={`booking-row-${b.id}`}
    >
      <td className="py-4 px-4 text-sm">{fmtDate(b.start_time)}</td>
      <td className="py-4 px-4 text-sm">{fmtTime(b.start_time)}–{fmtTime(b.end_time)}</td>
      <td className="py-4 px-4 text-sm">
        <div className="text-[#0a0a0a] font-medium">{b.customer_name}</div>
        {b.email && <div className="text-[#525252] text-xs">{b.email}</div>}
      </td>
      <td className="py-4 px-4 text-sm">
        {isManual ? (
          <span
            className="inline-block px-2 py-1 text-[10px] font-mono-tech border border-[#0E7490] text-[#0E7490] bg-[#06B6D4]/10"
            data-testid={`type-badge-${b.id}`}
          >Manuale</span>
        ) : (
          <span className="text-[#525252] font-mono-tech text-xs">Online</span>
        )}
      </td>
      <td className="py-4 px-4 text-sm">
        {isManual ? (
          <button
            data-testid={`toggle-paid-${b.id}`}
            onClick={onTogglePaid}
            disabled={actingId === b.id}
            className="px-3 py-1.5 text-[10px] font-mono-tech border transition-none"
            style={
              b.paid
                ? { background: PAID_COLOR, color: "#0a0a0a", borderColor: PAID_COLOR }
                : { background: "transparent", color: "#525252", borderColor: "#a3a3a3" }
            }
          >
            {b.paid ? "✓ PAGATO" : "Da pagare"}
          </button>
        ) : b.penalty_charged ? (
          <span className="inline-block px-2 py-1 text-[10px] font-mono-tech border border-[#15803d] text-[#15803d] bg-[#16A34A]/15">Penale</span>
        ) : (
          <span className="text-[#737373] font-mono-tech">—</span>
        )}
      </td>
      <td className="py-4 px-4">
        <span
          className={`inline-block px-2 py-1 border text-[10px] font-mono-tech font-bold uppercase tracking-wider ${STATUS_BADGE[b.status] || "border-[#a3a3a3] text-[#525252]"}`}
          data-testid={`status-badge-${b.id}`}
        >
          {STATUS_LABEL[b.status] || b.status}
        </span>
      </td>
      <td className="py-4 px-4 text-right whitespace-nowrap">
        {b.status === "confirmed" && (
          <div className="inline-flex gap-2">
            <button
              data-testid={`mark-cancel-${b.id}`}
              onClick={onCancel}
              disabled={actingId === b.id}
              className="border border-[#525252] text-[#525252] hover:bg-[#525252] hover:text-white font-bold uppercase tracking-wider px-3 py-2 text-xs disabled:opacity-50"
            >Annulla</button>
            <button
                data-testid={`mark-no-show-${b.id}`}
                onClick={onNoShow}
                disabled={actingId === b.id}
                className="border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-bold uppercase tracking-wider px-3 py-2 text-xs disabled:opacity-50"
              >No-show</button>
          </div>
        )}
      </td>
    </tr>
  );
}

// -----------------------------------------------------------------------------
// ConfirmDialog — strong confirmation for cancel and no-show
// -----------------------------------------------------------------------------
function ConfirmDialog({ action, penalty, onClose, onCancel, onNoShow }) {
  return (
    <AlertDialog open={!!action} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent
        className="bg-[#171717] border border-[#333333] rounded-none text-[#F3F4F6] max-w-lg"
        data-testid="confirm-dialog"
      >
        {action?.type === "no-show" ? (
          <>
            <AlertDialogHeader>
              <div className="font-mono-tech text-[#D92D20] mb-2">⚠ Azione irreversibile</div>
              <AlertDialogTitle className="font-display text-2xl uppercase tracking-tight">
                {action.booking.manual ? "Segnare come no-show?" : `Addebitare ${fmtEur(penalty)} ?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#A1A1AA] mt-3">
                {action.booking.manual
                  ? "La prenotazione verrà segnata come no-show. Nessun addebito (prenotazione manuale, nessuna carta a garanzia)."
                  : (<>Stai per addebitare <span className="text-[#F3F4F6] font-bold">{fmtEur(penalty)}</span> sulla carta di:</>)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Snapshot booking={action.booking} />
            {!action.booking.manual && (
              <p className="text-sm text-[#A1A1AA]">L'addebito è immediato e non può essere annullato.</p>
            )}
            <AlertDialogFooter className="mt-6 gap-2">
              <AlertDialogCancel className="border border-[#333333] bg-transparent hover:bg-[#262626] text-[#F3F4F6] rounded-none font-bold uppercase tracking-wider">Annulla</AlertDialogCancel>
              <AlertDialogAction
                data-testid="confirm-dialog-confirm-no-show"
                onClick={onNoShow}
                className="bg-[#D92D20] hover:bg-[#B91C1C] text-white rounded-none font-bold uppercase tracking-wider"
              >{action.booking.manual ? "Sì, segna no-show" : `Sì, addebita ${fmtEur(penalty)}`}</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : action?.type === "cancel" ? (
          <>
            <AlertDialogHeader>
              <div className="font-mono-tech text-[#A1A1AA] mb-2">Annullamento</div>
              <AlertDialogTitle className="font-display text-2xl uppercase tracking-tight">
                Annullare la prenotazione?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#A1A1AA] mt-3">
                Lo slot tornerà disponibile. <span className="text-[#16A34A] font-bold">Nessun addebito</span> verrà effettuato.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Snapshot booking={action.booking} />
            <AlertDialogFooter className="mt-6 gap-2">
              <AlertDialogCancel className="border border-[#333333] bg-transparent hover:bg-[#262626] text-[#F3F4F6] rounded-none font-bold uppercase tracking-wider">Indietro</AlertDialogCancel>
              <AlertDialogAction
                data-testid="confirm-dialog-confirm-cancel"
                onClick={onCancel}
                className="bg-[#A1A1AA] hover:bg-[#737373] text-[#0a0a0a] rounded-none font-bold uppercase tracking-wider"
              >Sì, annulla</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Snapshot({ booking }) {
  return (
    <div className="border border-[#333333] bg-[#0a0a0a] p-4 my-4 font-mono-tech text-xs space-y-2">
      <Line label="Cliente" value={booking.customer_name} />
      {booking.email && <Line label="Email" value={booking.email} />}
      <Line label="Sala" value={booking.room_name} />
      <Line label="Slot" value={`${fmtDate(booking.start_time)} · ${fmtTime(booking.start_time)}–${fmtTime(booking.end_time)}`} />
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[#A1A1AA]">{label}</span>
      <span className="text-[#F3F4F6] text-right normal-case tracking-normal font-sans">{value}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// NewManualBookingDialog — admin creates a walk-in booking, no card
// -----------------------------------------------------------------------------
function NewManualBookingDialog({ open, onClose, rooms, onCreated }) {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");
  const [date, setDate]     = useState(todayStr());
  const [startSlot, setStartSlot] = useState(16);   // 18:00 default
  const [endSlot, setEndSlot]     = useState(20);   // 20:00 default
  const [paid, setPaid]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      // reset on open
      setName(""); setEmail(""); setPaid(false);
      setDate(todayStr()); setStartSlot(16); setEndSlot(20);
      if (rooms.length) setRoomId(rooms[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minEnd = startSlot + MIN_DURATION_SLOTS;
  const maxEnd = Math.min(TOTAL_SLOTS, startSlot + MAX_DURATION_SLOTS);
  useEffect(() => {
    if (endSlot < minEnd) setEndSlot(minEnd);
    else if (endSlot > maxEnd) setEndSlot(maxEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSlot]);

  const canSubmit = useMemo(
    () => name.trim() && roomId && startSlot < endSlot && !submitting,
    [name, roomId, startSlot, endSlot, submitting]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
await api.post("/admin/bookings", {
  customer_name: name.trim(),
  email: email.trim() || null,
  room_id: roomId,
  start_time: slotToIso(date, SLOTS[startSlot]),
  end_time: slotToIso(date, SLOTS[endSlot]),
  paid: paid,
}, { headers: { ...authHeader() } });
      toast.success(`Prenotazione manuale creata${paid ? " (pagata)" : ""}`);
      onCreated();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Errore";
      toast.error(typeof detail === "string" ? detail : "Errore");
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="bg-[#171717] border border-[#333333] rounded-none text-[#F3F4F6] max-w-lg"
        data-testid="new-manual-dialog"
      >
        <DialogHeader>
          <div className="font-mono-tech text-[#D92D20] mb-2">Walk-in</div>
          <DialogTitle className="font-display text-2xl uppercase tracking-tight">
            Nuova prenotazione manuale
          </DialogTitle>
          <DialogDescription className="text-[#A1A1AA]">
            Per band o clienti che chiamano / si presentano in studio. Nessuna carta richiesta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <Field label="Nome cliente">
            <input
              data-testid="manual-name-input"
              type="text" required value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mario Rossi"
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            />
          </Field>
          <Field label="Email (opzionale)">
            <input
              data-testid="manual-email-input"
              type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="(facoltativa)"
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sala">
              <select
                data-testid="manual-room-select"
                value={roomId}
                onChange={(e) => setRoomId(String(e.target.value))}
                className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-3 w-full"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id} className="bg-[#171717]">{r.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Data">
              <input
                data-testid="manual-date-input"
                type="date" value={date} min={todayStr()}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-3 w-full"
              />
            </Field>
            <Field label="Dalle">
              <select
                data-testid="manual-start-select"
                value={startSlot} onChange={(e) => setStartSlot(Number(e.target.value))}
                className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-3 w-full"
              >
                {SLOTS.slice(0, TOTAL_SLOTS).map((s) => (
                  <option key={s.index} value={s.index} className="bg-[#171717]">{s.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Alle">
              <select
                data-testid="manual-end-select"
                value={endSlot} onChange={(e) => setEndSlot(Number(e.target.value))}
                className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-3 w-full"
              >
                {SLOTS.slice(minEnd, maxEnd + 1).map((s) => (
                  <option key={s.index} value={s.index} className="bg-[#171717]">{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none border border-[#333333] bg-[#0a0a0a] px-4 py-3">
            <input
              data-testid="manual-paid-checkbox"
              type="checkbox" checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: PAID_COLOR }}
            />
            <span className="text-sm">
              <span className="font-bold" style={{ color: PAID_COLOR }}>Pagato</span>
              <span className="text-[#A1A1AA]"> · Il cliente ha già saldato in contanti</span>
            </span>
          </label>

          <DialogFooter className="mt-6 gap-2">
            <button
              type="button" onClick={onClose}
              className="border border-[#333333] bg-transparent hover:bg-[#262626] text-[#F3F4F6] font-bold uppercase tracking-wider px-5 py-3 text-sm"
            >Annulla</button>
            <button
              type="submit"
              data-testid="manual-submit-button"
              disabled={!canSubmit}
              className="bg-[#D92D20] hover:bg-[#B91C1C] disabled:bg-[#333333] disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider px-5 py-3 text-sm"
            >{submitting ? "Creazione…" : "Crea prenotazione"}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// ChangePasswordDialog — cambia la password dell'admin loggato
// -----------------------------------------------------------------------------
function ChangePasswordDialog({ open, onClose }) {
  const [oldPw, setOldPw]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [conf,  setConf]    = useState("");
  const [loading, setLoading] = useState(false);

  function reset() { setOldPw(""); setNewPw(""); setConf(""); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPw.length < 8) { toast.error("La nuova password deve essere di almeno 8 caratteri."); return; }
    if (newPw !== conf)   { toast.error("Le password non coincidono."); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password",
        { old_password: oldPw, new_password: newPw },
        { headers: { ...authHeader() } });
      toast.success("Password aggiornata.");
      reset(); onClose();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Errore";
      toast.error(typeof detail === "string" ? detail : "Errore");
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="bg-[#171717] border border-[#333333] rounded-none text-[#F3F4F6] max-w-md">
        <DialogHeader>
          <div className="font-mono-tech text-[#D92D20] mb-2">Sicurezza</div>
          <DialogTitle className="font-display text-2xl uppercase tracking-tight">
            Cambia password
          </DialogTitle>
          <DialogDescription className="text-[#A1A1AA]">
            Inserisci la password attuale e scegline una nuova (min. 8 caratteri).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <Field label="Password attuale">
            <input
              type="password"
              autoComplete="current-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              required
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            />
          </Field>
          <Field label="Nuova password">
            <input
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              placeholder="min. 8 caratteri"
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            />
          </Field>
          <Field label="Conferma nuova password">
            <input
              type="password"
              autoComplete="new-password"
              value={conf}
              onChange={(e) => setConf(e.target.value)}
              required
              placeholder="ripeti la password"
              className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
            />
          </Field>

          <DialogFooter className="mt-6 gap-2">
            <button
              type="button" onClick={() => { reset(); onClose(); }}
              className="border border-[#333333] bg-transparent hover:bg-[#262626] text-[#F3F4F6] font-bold uppercase tracking-wider px-5 py-3 text-sm"
            >Annulla</button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#D92D20] hover:bg-[#B91C1C] disabled:bg-[#333333] disabled:cursor-not-allowed text-white font-bold uppercase tracking-wider px-5 py-3 text-sm"
            >{loading ? "Salvataggio…" : "Aggiorna password"}</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
