import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";

export default function ResetPassword() {
  const [searchParams]  = useSearchParams();
  const token           = searchParams.get("token") ?? "";
  const navigate        = useNavigate();

  const [password, setPassword]     = useState("");
  const [confirm,  setConfirm]      = useState("");
  const [loading,  setLoading]      = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La password deve essere di almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      toast.error("Le password non coincidono.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      toast.success("Password reimpostata. Puoi accedere ora.");
      navigate("/admin");
    } catch (err) {
      toast.error(errorMessage(err, "Link non valido o scaduto."));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6] flex items-center justify-center px-6">
        <div className="w-full max-w-sm border border-[#DC2626] bg-[#171717] p-8 space-y-4">
          <div className="font-mono-tech text-[#DC2626]">Link non valido</div>
          <p className="text-[#A1A1AA] text-sm">
            Il link è mancante o corrotto. Richiedi un nuovo reset dalla pagina di login.
          </p>
          <Link
            to="/admin/forgot-password"
            className="block font-mono-tech text-xs text-[#D92D20] hover:underline"
          >
            Richiedi nuovo link →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6] flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-[#333333] bg-[#171717] p-8 space-y-6"
      >
        <div>
          <div className="font-mono-tech text-[#D92D20] mb-2">Admin · Black Dog</div>
          <h1 className="font-display text-3xl">Nuova password</h1>
        </div>

        <label className="block">
          <span className="font-mono-tech text-[#A1A1AA] block mb-2">Nuova password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="min. 8 caratteri"
            className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
          />
        </label>

        <label className="block">
          <span className="font-mono-tech text-[#A1A1AA] block mb-2">Conferma password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="ripeti la password"
            className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#D92D20] hover:bg-[#B91C1C] disabled:bg-[#333333] text-white font-bold uppercase tracking-wider px-6 py-3"
        >
          {loading ? "Salvataggio…" : "Imposta nuova password"}
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
    </div>
  );
}
