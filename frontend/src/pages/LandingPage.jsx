import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import { BeamsBackground } from "../components/ui/beams-background";


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#F3F4F6]">
      <SiteHeader />

      {/* HERO */}
      <section className="border-b border-[#333333]">
        <BeamsBackground className="min-h-0 h-auto bg-[#0a0a0a]">
          <div className="max-w-6xl mx-auto px-6 py-24 sm:py-36">
            <div className="font-mono-tech text-[#F04438] mb-6" data-testid="hero-tagline">
              Sala prove · est. 2012 · Firenze
            </div>
            <h1
              className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[0.9] max-w-3xl text-[#F3F4F6]"
              data-testid="hero-title"
            >
              Black Dog
              <br />
              <span className="text-[#D92D20]">Sala Prove</span>
            </h1>
            <p className="mt-8 text-base sm:text-lg max-w-md text-[#A1A1AA] leading-relaxed">
              Spazi attrezzati per band, cantautori e produttori. Prenota la tua
              sessione in pochi click. Pagamento solo in caso di no-show.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row sm:flex-wrap gap-4">
              <Link
                to="/prenota"
                data-testid="hero-prenota-button"
                className="bg-[#D92D20] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider px-8 py-4 text-sm transition-colors w-full sm:w-auto text-center"
              >
                Prenota ora
              </Link>
              <a
                href="#info"
                className="border border-[#333333] hover:bg-[#171717] text-[#F3F4F6] font-bold uppercase tracking-wider px-8 py-4 text-sm transition-colors w-full sm:w-auto text-center"
              >
                Scopri di più
              </a>
            </div>
          </div>
        </BeamsBackground>
      </section>

      {/* FEATURES */}
      <section id="info" className="max-w-6xl mx-auto px-6 py-16 sm:py-24">
        <h2 className="font-mono-tech text-[#F04438] mb-12">Come funziona</h2>
        <div className="divide-y divide-[#1e1e1e]">
          <FeatureRow
            num="01"
            title="Sale attrezzate"
            body="Backline completo pronto all'uso: batteria in kit, amplificatori, monitor. Porta solo il tuo strumento."
          />
          <FeatureRow
            num="02"
            title="Prenota in 3 minuti"
            body="Scegli sala, data e orario dalla timeline interattiva. Lasci i dati carta come garanzia; addebito solo in caso di no-show."
          />
          <FeatureRow
            num="03"
            title="Nel cuore di Firenze"
            body="Aperto ogni giorno dalle 10:00 all'1:00 di notte. A piedi dalla stazione SMN in meno di 10 minuti."
          />
        </div>
      </section>

      {/* SALE — gallery (placeholder fino a foto reali) */}
      <section className="border-t border-[#1e1e1e]">
        <div className="max-w-6xl mx-auto px-6 py-16 sm:py-24">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <h2 className="font-mono-tech text-[#F04438]">Le Sale</h2>
            <p className="text-[#A1A1AA] text-sm max-w-md sm:text-right leading-relaxed">
              Tre spazi insonorizzati, ciascuno con backline dedicato. Scegli
              quello giusto per la tua formazione.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#1e1e1e]">
            <PhotoPlaceholder label="Sala A" caption="Live room · fino a 6 musicisti" />
            <PhotoPlaceholder label="Sala B" caption="Recording · cabina regia" />
            <PhotoPlaceholder label="Sala C" caption="Compatta · duo / solisti" />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — policy strip */}
      <section className="border-t border-[#1e1e1e]">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#1e1e1e]">
          <PolicyBlock label="Cancellazione" value="Gratuita entro il limite orario" />
          <PolicyBlock label="No-show" value="Penale addebitata sulla carta" />
          <PolicyBlock label="Pagamento" value="Solo carta a garanzia, nessun anticipo" />
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#333333]">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <div className="font-display text-xl mb-2">BLACK DOG</div>
            <div className="text-[#A1A1AA] leading-relaxed">
              Firenze, Toscana · Italia<br />
              Aperto tutti i giorni 10:00 &ndash; 01:00
            </div>
          </div>
          <div className="sm:text-right font-mono-tech text-[#A1A1AA] flex flex-col sm:items-end gap-2">
            <Link to="/prenota" className="text-[#F04438] hover:text-[#F3F4F6] transition-colors">
              Prenota ora
            </Link>
            <span>© {new Date().getFullYear()} Black Dog Sala Prove</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({ num, title, body }) {
  return (
    <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[80px_1fr] gap-6 sm:gap-12 py-10 sm:py-12">
      <div
        className="font-display text-4xl sm:text-5xl text-[#1e1e1e] select-none leading-none pt-1"
        aria-hidden="true"
      >
        {num}
      </div>
      <div>
        <h3 className="font-display text-xl sm:text-2xl mb-3">{title}</h3>
        <p className="text-[#A1A1AA] leading-relaxed text-sm sm:text-base max-w-xl">{body}</p>
      </div>
    </div>
  );
}

function PhotoPlaceholder({ label, caption }) {
  return (
    <div className="group relative bg-[#0a0a0a] aspect-[4/3] flex flex-col justify-between p-5 overflow-hidden">
      {/* hatch fill — segnaposto finché non arrivano le foto reali */}
      <div
        className="absolute inset-0 opacity-60 transition-opacity group-hover:opacity-90"
        aria-hidden="true"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #141414 0px, #141414 12px, #0f0f0f 12px, #0f0f0f 24px)",
        }}
      />
      <div className="relative font-mono-tech text-[#A1A1AA]">{label}</div>
      <div className="relative flex items-center justify-center flex-1">
        <span className="font-mono-tech text-[#3f3f46]">Foto in arrivo</span>
      </div>
      <div className="relative font-mono-tech text-[#71717A] normal-case tracking-normal text-[0.7rem]">
        {caption}
      </div>
    </div>
  );
}

function PolicyBlock({ label, value }) {
  return (
    <div className="bg-[#0a0a0a] px-6 py-8">
      <div className="font-mono-tech text-[#A1A1AA] mb-2">{label}</div>
      <div className="font-display text-base sm:text-lg text-[#F3F4F6]">{value}</div>
    </div>
  );
}
