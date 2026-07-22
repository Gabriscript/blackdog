import { Link } from "react-router-dom";

export default function SiteHeader({ showCta = true }) {
  return (
    <header className="border-b border-[#333333] bg-[#0a0a0a]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
        <Link to="/" className="font-display text-2xl tracking-tight" data-testid="site-logo">
          <span className="text-[#D92D20]" aria-hidden="true">■</span> BLACK DOG
        </Link>
        <div className="flex items-center gap-6">
          <span className="font-mono-tech text-[#A1A1AA] hidden sm:inline">
            Firenze · Toscana
          </span>
          {showCta && (
            <Link
              to="/prenota"
              data-testid="header-prenota-link"
              className="bg-[#D92D20] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider px-5 py-2.5 text-sm"
            >
              Prenota ora
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
