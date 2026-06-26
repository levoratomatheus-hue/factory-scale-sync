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
      className={`${embedded ? "flex-1 h-full" : "min-h-screen"} flex flex-col items-center justify-center relative overflow-hidden select-none transition-opacity duration-500 bg-white dark:bg-gray-900`}
      style={{ opacity: fading ? 0 : 1 }}
    >

      {/* Conteúdo central */}
      <main className="relative z-10 flex flex-col items-center text-center px-6 gap-8">

        {/* Marca */}
        <div className="flex flex-col items-center gap-3">
          <h1
            className="leading-none select-none tracking-tight text-gray-900 dark:text-white"
            style={{ fontSize: "4rem", fontFamily: "Bebas Neue, sans-serif", letterSpacing: "0.04em" }}
          >
            ZAN COLLOR
          </h1>
          <p className="tracking-widest uppercase text-sm text-gray-400 dark:text-gray-500">
            masterbatches
          </p>
        </div>

        {/* Divisor */}
        <div className="w-16 h-px rounded-full bg-gray-200 dark:bg-gray-700" />

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
      <footer className="absolute bottom-6 text-xs tracking-widest uppercase text-gray-400 dark:text-gray-600">
        ZanCollor © 2026
      </footer>
    </div>
  );
}
