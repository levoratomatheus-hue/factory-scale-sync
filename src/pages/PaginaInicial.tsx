import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface PaginaInicialProps {
  /** Se fornecido, o botão chama onEnter em vez de navegar para /app (apenas na landing externa) */
  onEnter?: () => void;
  /** Ativa transição de fade-out */
  fading?: boolean;
  /** Modo embutido: ocupa a área disponível, sem botão de ação */
  embedded?: boolean;
}

export default function PaginaInicial({ onEnter, fading, embedded }: PaginaInicialProps) {
  return (
    <div
      className={`${embedded ? "flex-1 h-full" : "min-h-screen"} flex flex-col items-center justify-center relative overflow-hidden select-none transition-opacity duration-500`}
      style={{
        background: "hsl(220, 22%, 7%)",
        opacity: fading ? 0 : 1,
      }}
    >
      {/* Glow de fundo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 38%, hsl(220,65%,22%) 0%, transparent 70%)",
          opacity: 0.45,
        }}
      />

      {/* Conteúdo central */}
      <main className="relative z-10 flex flex-col items-center text-center px-6 gap-7">

        {/* Marca */}
        <div className="space-y-2">
          <h1
            className="text-5xl sm:text-6xl font-black tracking-[0.28em] uppercase leading-none"
            style={{ color: "hsl(220, 10%, 93%)" }}
          >
            ZAN COLLOR
          </h1>
          <p
            className="text-xs font-semibold tracking-[0.55em] uppercase"
            style={{ color: "hsl(220, 60%, 62%)" }}
          >
            masterbatches
          </p>
        </div>

        {/* Divisor */}
        <div
          className="w-10 h-px rounded-full"
          style={{ background: "hsl(220, 25%, 28%)" }}
        />

        {/* Subtítulo */}
        <p
          className="text-sm font-light tracking-widest uppercase"
          style={{ color: "hsl(220, 10%, 48%)" }}
        >
          Sistema de Gestão de Produção
        </p>

        {/* Botão apenas na versão splash (não embutida) */}
        {!embedded && (
          onEnter ? (
            <button
              onClick={onEnter}
              className="group mt-1 inline-flex items-center gap-2.5 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-95"
              style={{
                background: "hsl(220, 68%, 50%)",
                color: "hsl(0, 0%, 100%)",
                boxShadow: "0 0 24px hsl(220,68%,50%,0.35)",
              }}
            >
              Entrar
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          ) : (
            <Link
              to="/app"
              className="group mt-1 inline-flex items-center gap-2.5 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-95"
              style={{
                background: "hsl(220, 68%, 50%)",
                color: "hsl(0, 0%, 100%)",
                boxShadow: "0 0 24px hsl(220,68%,50%,0.35)",
              }}
            >
              Acessar Sistema
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          )
        )}
      </main>

      {/* Rodapé */}
      <footer
        className="absolute bottom-6 text-xs tracking-widest uppercase"
        style={{ color: "hsl(220, 10%, 30%)" }}
      >
        ZanCollor © 2026
      </footer>
    </div>
  );
}
