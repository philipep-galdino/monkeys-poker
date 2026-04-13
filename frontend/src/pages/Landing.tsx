import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0e13] text-white">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,169,55,0.18), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(26,92,56,0.25), transparent 60%), radial-gradient(ellipse 50% 40% at 10% 90%, rgba(212,169,55,0.08), transparent 60%)",
        }}
      />

      {/* Subtle felt texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #d4a937 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12">
        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-black text-[#0a0e13]"
            style={{
              background:
                "linear-gradient(135deg, #f5d571 0%, #d4a937 50%, #a07c1a 100%)",
              boxShadow: "0 0 20px rgba(212,169,55,0.35)",
            }}
          >
            ♠
          </div>
          <span className="text-lg font-bold tracking-tight">PokerClub</span>
        </div>
        <Link
          to="/owner"
          className="text-sm font-medium text-white/70 transition hover:text-white"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-6xl flex-col items-center justify-center px-6 pb-24 pt-12 text-center md:pt-20">
        <span
          className="mb-6 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-white/70 backdrop-blur"
        >
          Gestão de clubes de poker
        </span>

        <h1 className="mb-6 max-w-4xl text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">
          Seu clube de poker,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #f5d571 0%, #d4a937 50%, #a07c1a 100%)",
            }}
          >
            organizado
          </span>
          <br />
          como nunca antes.
        </h1>

        <p className="mb-10 max-w-2xl text-lg text-white/65 md:text-xl">
          Cadastre jogadores, gerencie fichas, receba pagamentos via Pix e
          acompanhe tudo em tempo real. Feito para donos de clube que levam o
          jogo a sério.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Link
            to="/register"
            className="group relative inline-flex items-center justify-center rounded-full px-8 py-4 text-base font-bold text-[#0a0e13] transition-all hover:scale-[1.03]"
            style={{
              background:
                "linear-gradient(135deg, #f5d571 0%, #d4a937 50%, #a07c1a 100%)",
              boxShadow:
                "0 0 0 1px rgba(245,213,113,0.5), 0 8px 32px rgba(212,169,55,0.35)",
            }}
          >
            Criar meu clube
            <span className="ml-2 transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
          <Link
            to="/owner"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-8 py-4 text-base font-medium text-white/90 backdrop-blur transition hover:bg-white/10"
          >
            Já tenho conta
          </Link>
        </div>

        {/* Feature strip */}
        <div className="mt-24 grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              icon: "♣",
              title: "Pagamentos Pix",
              desc: "Buy-ins e rebuys confirmados automaticamente.",
            },
            {
              icon: "♦",
              title: "Tempo real",
              desc: "Acompanhe fichas, jogadores e sessões ao vivo.",
            },
            {
              icon: "♥",
              title: "Sua marca",
              desc: "Cores, logo e identidade 100% do seu clube.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left backdrop-blur transition hover:border-white/20 hover:bg-white/[0.06]"
            >
              <div
                className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-xl"
                style={{
                  background: "rgba(212,169,55,0.12)",
                  color: "#f5d571",
                }}
              >
                {f.icon}
              </div>
              <h3 className="mb-1 text-base font-bold">{f.title}</h3>
              <p className="text-sm text-white/60">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-6 text-center text-xs text-white/40 md:px-12">
        © {new Date().getFullYear()} PokerClub · Gestão para clubes de poker
      </footer>
    </div>
  );
}
