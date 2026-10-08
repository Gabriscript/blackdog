import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { api, errorMessage } from "../lib/api";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/login", { email, password }); // sets the session cookie
      toast.success("Accesso effettuato");
      navigate("/admin/dashboard");
    } catch (err) {
      toast.error(errorMessage(err, "Credenziali non valide"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6] flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-[#333333] bg-[#171717] p-8 space-y-6"
      >
        <div>
          <div className="font-mono-tech text-[#D92D20] mb-2">Admin · Black Dog</div>
          <h1 className="font-display text-3xl">Accesso</h1>
        </div>
        <label className="block">
          <span className="font-mono-tech text-[#A1A1AA] block mb-2">Email</span>
          <input
            data-testid="admin-email-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
          />
        </label>
        <label className="block">
          <span className="font-mono-tech text-[#A1A1AA] block mb-2">Password</span>
          <input
            data-testid="admin-password-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-transparent border border-[#333333] text-[#F3F4F6] focus:border-[#D92D20] focus:outline-none px-4 py-3 w-full"
          />
        </label>
        <button
          data-testid="admin-login-button"
          type="submit"
          disabled={loading}
          className="w-full bg-[#D92D20] hover:bg-[#B91C1C] disabled:bg-[#333333] text-white font-bold uppercase tracking-wider px-6 py-3"
        >
          {loading ? "Accesso…" : "Entra"}
        </button>

        <div className="text-center">
          <Link
            to="/admin/forgot-password"
            className="font-mono-tech text-xs text-[#A1A1AA] hover:text-[#D92D20] transition-colors"
          >
            Password dimenticata?
          </Link>
        </div>
      </form>
    </div>
  );
}
