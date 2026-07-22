import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { fmtDateLong as fmtDate, fmtTime } from "../lib/slots";
import SiteHeader from "../components/SiteHeader";
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

const STATUS_LABEL = {
  confirmed: "Confermata",
  cancelled: "Annullata",
  "no-show": "No-show",
};
const STATUS_COLOR = {
  confirmed: "text-[#16A34A]",
  cancelled: "text-[#A1A1AA]",
  "no-show": "text-[#DC2626]",
};

export default function MyBooking() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/bookings/by-token/${token}`);
      setBooking(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Prenotazione non trovata");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function doCancel() {
    setCancelling(true);
    try {
      await api.post(`/bookings/by-token/${token}/cancel`);
      toast.success("Prenotazione annullata. Nessun addebito.");
      setConfirmOpen(false);
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Errore";
      toast.error(typeof detail === "string" ? detail : "Errore");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6]">
      <SiteHeader showCta={false} />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="font-mono-tech text-[#D92D20] mb-4">La tua prenotazione</div>
        <h1 className="font-display text-4xl sm:text-5xl mb-8" data-testid="my-booking-title">
          Black Dog <span className="text-[#D92D20]">Sala Prove</span>
        </h1>

        {loading && (
          <div className="text-[#A1A1AA] font-mono-tech" role="status" aria-live="polite">Caricamento…</div>
        )}

        {!loading && error && (
          <div className="border border-[#DC2626] bg-[#171717] p-6" data-testid="my-booking-error" role="alert">
            <div className="font-mono-tech text-[#DC2626] mb-2">Errore</div>
            <div className="text-[#F3F4F6]">{error}</div>
            <Link
              to="/"
              className="inline-block mt-6 border border-[#333333] hover:bg-[#262626] text-[#F3F4F6] font-bold uppercase tracking-wider px-5 py-2 text-sm"
            >
              Torna alla home
            </Link>
          </div>
        )}

        {!loading && booking && (
          <>
            <div className="border border-[#333333] bg-[#171717] p-6 space-y-3 font-mono-tech text-sm" data-testid="my-booking-card">
              <Row label="Stato">
                <span className={`font-bold uppercase ${STATUS_COLOR[booking.status] || ""}`} data-testid="my-booking-status">
                  {STATUS_LABEL[booking.status] || booking.status}
                </span>
              </Row>
              <Row label="Codice" value={booking.id.slice(0, 8).toUpperCase()} />
              <Row label="Sala" value={booking.room_name} />
              <Row label="Data" value={fmtDate(booking.start_time)} />
              <Row label="Orario" value={`${fmtTime(booking.start_time)} – ${fmtTime(booking.end_time)}`} />
              <Row label="Nome" value={booking.customer_name} />
              <Row label="Email" value={booking.email} />
            </div>

            {booking.status === "confirmed" && booking.can_cancel && (
              <div className="mt-8 border border-[#333333] bg-[#171717] p-6">
                <div className="font-mono-tech text-[#A1A1AA] mb-3">Annulla la prenotazione</div>
                <p className="text-sm text-[#A1A1AA] mb-4">
                  Puoi annullare gratuitamente fino a{" "}
                  <span className="text-[#F3F4F6] font-bold">
                    {booking.cancel_cutoff_hours} ore
                  </span>{" "}
                  prima dell'inizio dello slot. Nessun addebito verrà effettuato.
                </p>
                <button
                  data-testid="my-booking-cancel-button"
                  onClick={() => setConfirmOpen(true)}
                  className="border border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-bold uppercase tracking-wider px-5 py-3 text-sm"
                >
                  Annulla prenotazione
                </button>
              </div>
            )}

            {booking.status === "confirmed" && !booking.can_cancel && (
              <div className="mt-8 border border-[#333333] bg-[#171717] p-6" data-testid="my-booking-cutoff-passed">
                <div className="font-mono-tech text-[#A1A1AA] mb-3">Annullamento online non disponibile</div>
                <p className="text-sm text-[#A1A1AA]">
                  L'annullamento online è permesso fino a{" "}
                  <span className="text-[#F3F4F6] font-bold">
                    {booking.cancel_cutoff_hours} ore
                  </span>{" "}
                  prima dello slot. Per annullare adesso contatta direttamente lo studio.
                </p>
              </div>
            )}

            {booking.status === "cancelled" && (
              <div className="mt-8 border border-[#333333] bg-[#171717] p-6 text-sm text-[#A1A1AA]" data-testid="my-booking-cancelled">
                Questa prenotazione è stata annullata. Nessun addebito è stato effettuato.
              </div>
            )}

            {booking.status === "no-show" && (
              <div className="mt-8 border border-[#DC2626] bg-[#171717] p-6 text-sm text-[#A1A1AA]" data-testid="my-booking-no-show">
                Questa prenotazione è stata segnata come no-show ed è stata addebitata la penale prevista.
              </div>
            )}

            <div className="mt-8 flex gap-4">
              <Link
                to="/"
                className="border border-[#333333] hover:bg-[#262626] text-[#F3F4F6] font-bold uppercase tracking-wider px-5 py-3 text-sm"
              >
                Torna alla home
              </Link>
              <Link
                to="/prenota"
                className="bg-[#D92D20] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider px-5 py-3 text-sm"
              >
                Nuova prenotazione
              </Link>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          className="bg-[#171717] border border-[#333333] rounded-none text-[#F3F4F6] max-w-md"
          data-testid="my-booking-confirm-dialog"
        >
          <AlertDialogHeader>
            <div className="font-mono-tech text-[#A1A1AA] mb-2">Conferma</div>
            <AlertDialogTitle className="font-display text-2xl uppercase tracking-tight">
              Annullare la prenotazione?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#A1A1AA] mt-3">
              Lo slot tornerà disponibile. <span className="text-[#16A34A] font-bold">Nessun addebito</span> verrà effettuato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="border border-[#333333] bg-transparent hover:bg-[#262626] text-[#F3F4F6] rounded-none font-bold uppercase tracking-wider">
              Indietro
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="my-booking-confirm-cancel"
              onClick={doCancel}
              disabled={cancelling}
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded-none font-bold uppercase tracking-wider"
            >
              {cancelling ? "Annullamento…" : "Sì, annulla"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, children }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[#262626] pb-2 last:border-b-0">
      <span className="text-[#A1A1AA]">{label}</span>
      <span className="text-[#F3F4F6] text-right normal-case tracking-normal font-sans">
        {children ?? value}
      </span>
    </div>
  );
}
