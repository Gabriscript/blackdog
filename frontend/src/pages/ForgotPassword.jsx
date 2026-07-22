import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail]   = useState("");
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      toast.error("Errore durante l'invio. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6] flex items-center justify-center px-6">
      <div className="w-full max-w-sm border border-[#333333] bg-[#171717] p-8 space-y-6">
        <div>
          <div className="font-mono-tech text-[#D92D20] mb-2">Admin · Black Dog</div>
          <h1 className="font-display text-3xl">Password dimenticata</h1>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="border border-[#16A34A] bg-[#16A34A]/10 px-4 py-3 font-mono-tech text-sm text-[#16A34A]">
              ✓ Se l'email è registrata, riceverai il link di reset entro pochi minuti.
            </div>
            <p className="text-[#A1A1AA] text-sm">
              Non trovi l'email? Controlla lo spam, o chiedi all'amministratore di
              sistema di verificare i log del backend (se SMTP non è configurato,
              il link appare nella console del server).
            </p>
            <Link
              to="/admin"
              className="block text-center font-mono-tech text-xs text-[#A1A1AA] hover:text-[#D92D20] transition-colors mt-2"
            >
              ← Torna al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <p className="text-[#A1A1AA] text-sm">
              Inserisci l'email dell'account admin. Riceverai un link per reimpostare la password.
            </p>
            <label className="block">
              <span className="font-mono-tech text-[#A1A1AA] block mb-2">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D92D20] hover:bg-[#B91C1C] disabled:bg-[#333333] text-white font-bold uppercase tracking-wider px-6 py-3"
            >
              {loading ? "Invio…" : "Invia link di reset"}
            </button>
            <div className="text-center">
              <Link
                to="/admin"
                className="font-mono-tech text-xs text-[#A1A1AA] hover:text-[#D92D20] transition-colors"
              >
                ← Torna al login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
