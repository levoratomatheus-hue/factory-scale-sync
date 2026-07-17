/**
 * Painel compartilhado de resultado da comparação TID × Excel.
 *
 * Usado por CriarOrdem.tsx e PainelConsultaFormula.tsx.
 * Props:
 *   resultado        — resultado de compararFormulas(); null = nada a exibir
 *   loading          — true enquanto aguarda a comparação
 *   tabelaCompleta   — se true, exibe tabela completa mesmo no estado 'ok'
 */

import { Loader2, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import type { ResultadoComparacao } from '@/lib/compararFormulas';

interface ComparatorPanelProps {
  resultado: ResultadoComparacao | null;
  loading?: boolean;
  tabelaCompleta?: boolean;
}

export function ComparatorPanel({ resultado, loading, tabelaCompleta }: ComparatorPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Comparando com fórmula do Excel…
      </div>
    );
  }

  if (!resultado) return null;

  const { status, itens, nDiffs, mpsSemDepara, produtoChaveExcel } = resultado;

  const chaveHeader = tabelaCompleta && produtoChaveExcel ? (
    <p className="text-xs text-muted-foreground">
      Chave Excel:{' '}
      <span className="font-mono font-medium text-foreground">{produtoChaveExcel}</span>
    </p>
  ) : null;

  // ── Sem fórmula no Excel ───────────────────────────────────────────────────
  if (status === 'sem_excel') {
    return (
      <div className="space-y-1">
        {chaveHeader}
        <p className="text-xs text-muted-foreground">
          ○ Produto sem fórmula no Excel — vinculação pendente no lab.
        </p>
      </div>
    );
  }

  // ── MPs sem de-para ────────────────────────────────────────────────────────
  if (status === 'sem_depara') {
    return (
      <div className="space-y-1.5">
        {chaveHeader}
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/20">
            <HelpCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">
              Não foi possível comparar —{' '}
              {mpsSemDepara.length} MP{mpsSemDepara.length !== 1 ? 's' : ''} sem de-para
            </span>
          </div>
          <ul className="px-3 py-2 space-y-0.5 max-h-40 overflow-y-auto">
            {mpsSemDepara.map((p) => (
              <li key={p.cod_mp} className="text-xs text-amber-900 dark:text-amber-300">
                <span className="font-mono">{p.cod_mp}</span> · {p.materia_prima}
                {p.motivo === 'ambiguo' && (
                  <span className="ml-1 text-amber-600">(cod_tid ambíguo)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // ── Ok sem tabela completa ─────────────────────────────────────────────────
  if (status === 'ok' && !tabelaCompleta) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Fórmula confere — TID e Excel idênticos
      </div>
    );
  }

  // ── Tabela (divergente, ou ok com tabelaCompleta) ─────────────────────────
  const isDivergente = status === 'divergente';

  return (
    <div className="space-y-1.5">
      {chaveHeader}
      <div
        className={`rounded-md border overflow-hidden ${
          isDivergente
            ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800'
            : 'border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800'
        }`}
      >
        {/* Cabeçalho do painel */}
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b ${
            isDivergente
              ? 'border-red-200 dark:border-red-800 bg-red-100/60 dark:bg-red-900/20'
              : 'border-green-200 dark:border-green-800 bg-green-100/60 dark:bg-green-900/20'
          }`}
        >
          {isDivergente ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
          )}
          <span
            className={`text-xs font-semibold ${
              isDivergente
                ? 'text-red-800 dark:text-red-400'
                : 'text-green-800 dark:text-green-400'
            }`}
          >
            {isDivergente
              ? `Fórmula diverge do Excel — ${nDiffs} diferença${nDiffs !== 1 ? 's' : ''}`
              : 'Fórmula confere — TID e Excel idênticos'}
          </span>
        </div>

        {/* Tabela de itens */}
        <div className={tabelaCompleta ? 'overflow-x-auto' : 'max-h-52 overflow-y-auto'}>
          <table className="w-full text-xs">
            <thead
              className={`text-muted-foreground sticky top-0 ${
                isDivergente
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : 'bg-green-50 dark:bg-green-950/30'
              }`}
            >
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Matéria-Prima</th>
                <th className="text-right px-3 py-1.5 font-medium w-16">% TID</th>
                <th className="text-right px-3 py-1.5 font-medium w-16">% Excel</th>
                <th className="text-right px-3 py-1.5 font-medium w-16">Dif.</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((r, i) => {
                const diff =
                  r.pct_tid !== null && r.pct_excel !== null
                    ? r.pct_tid - r.pct_excel
                    : null;
                return (
                  <tr
                    key={i}
                    className={`border-t ${
                      r.isDiff
                        ? 'bg-red-100/70 dark:bg-red-900/20 text-red-900 dark:text-red-300 font-medium'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <td className="px-3 py-1 truncate max-w-[220px]">{r.materia_prima}</td>
                    <td className="px-3 py-1 text-right font-mono">
                      {r.pct_tid !== null ? (
                        r.pct_tid.toFixed(2)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right font-mono">
                      {r.pct_excel !== null ? (
                        r.pct_excel.toFixed(2)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1 text-right font-mono">
                      {diff !== null ? (
                        <span className={Math.abs(diff) > 0.01 ? 'text-red-600' : ''}>
                          {diff > 0 ? '+' : ''}
                          {diff.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
