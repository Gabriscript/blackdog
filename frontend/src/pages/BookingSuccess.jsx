import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import SiteHeader from "../components/SiteHeader";
import { fmtDateLong as fmtDate, fmtTime } from "../lib/slots";

export default function BookingSuccess() {
  const { state } = useLocation();
  const b = state?.booking;

  const cancelUrl = b?.cancel_url_path
    ? `${window.location.origin}${b.cancel_url_path}`
    : null;

  const [copied, setCopied] = useState(false);
  async function copyLink() {
    if (!cancelUrl) return;
    try {
      await navigator.clipboard.writeText(cancelUrl);
      setCopied(true);
      toast.success("Link copiato");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossibile copiare");
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6]">
      <SiteHeader showCta={false} />
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="font-mono-tech text-[#16A34A] mb-4" role="status">
          <span aria-hidden="true">✓ </span>Confermata
        </div>
        <h1 className="font-display text-4xl sm:text-5xl mb-6" data-testid="success-title">
          Prenotazione confermata
        </h1>
        <p className="text-[#A1A1AA] mb-10 max-w-lg">
          Riceverai un'email di conferma a breve con il link per gestire la tua prenotazione.
        </p>

        {b && (
          <div className="border border-[#333333] bg-[#171717] p-6 space-y-3 font-mono-tech text-sm" data-testid="booking-summary">
            <Row label="Codice" value={b.id.slice(0, 8).toUpperCase()} />
            <Row label="Sala" value={b.room_name} />
            <Row label="Data" value={fmtDate(b.start_time)} />
            <Row label="Orario" value={`${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`} />
            <Row label="Nome" value={b.customer_name} />
            <Row label="Email" value={b.email} />
          </div>
        )}

        {cancelUrl && (
          <div className="mt-8 border border-[#D92D20] bg-[#171717] p-6" data-testid="my-booking-link-card">
            <div className="font-mono-tech text-[#D92D20] mb-3">Salva questo link</div>
            <p className="text-sm text-[#A1A1AA] mb-4">
              Da qui potrai vedere o annullare la tua prenotazione (entro il limite previsto).
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={cancelUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 bg-[#0a0a0a] border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-3 py-3 text-xs font-mono"
                data-testid="my-booking-link-input"
              />
              <button
                onClick={copyLink}
                data-testid="my-booking-link-copy"
                className="bg-[#D92D20] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider px-4 py-3 text-xs"
              >
                {copied ? "Copiato" : "Copia"}
              </button>
            </div>
            <Link
              to={b.cancel_url_path}
              className="inline-block mt-4 text-[#D92D20] hover:underline font-mono-tech text-xs"
              data-testid="my-booking-link-go"
              aria-label="Apri la tua prenotazione"
            >
              Apri ora <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}

        <div className="mt-10 flex gap-4">
          <Link
            to="/"
            className="border border-[#333333] hover:bg-[#171717] text-[#F3F4F6] font-bold uppercase tracking-wider px-6 py-3 text-sm"
          >
            Torna alla home
          </Link>
          <Link
            to="/prenota"
            className="bg-[#D92D20] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider px-6 py-3 text-sm"
          >
            Nuova prenotazione
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[#262626] pb-2 last:border-b-0">
      <span className="text-[#A1A1AA]">{label}</span>
      <span className="text-[#F3F4F6] text-right normal-case tracking-normal font-sans">{value}</span>
    </div>
  );
}
