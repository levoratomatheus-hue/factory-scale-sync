/**
 * PainelConsultaFormula — consulta e comparação de fórmulas TID × Excel.
 *
 * Busca por:
 *   - formula_id numérico
 *   - número do lote (resolve via cadastro_lotes → formula_id)
 *   - nome do produto (busca parcial ≥ 3 chars; lista candidatos se > 1 resultado)
 *
 * Exibe:
 *   - Painel de 4 estados (ok / divergente / sem_depara / sem_excel)
 *   - Tabela completa: matéria-prima | % TID | % Excel | diferença
 *   - Chave do produto no Excel (quando disponível)
 *   - Botão "Conferir todas" — roda comparação em batch nas fórmulas do Excel
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, ChevronRight, BarChart2, CheckCircle2, AlertCircle, HelpCircle, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ComparatorPanel } from '@/components/ComparatorPanel';
import {
  compararFormulas,
  conferirTodasFormulas,
  type ResultadoComparacao,
  type ResultadoConferirTodas,
} from '@/lib/compararFormulas';

interface Candidato {
  formula_id: string;
  produto: string;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function PainelConsultaFormula() {
  const [busca, setBusca] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [formulaAtual, setFormulaAtual] = useState<Candidato | null>(null);
  const [comparatorLoading, setComparatorLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoComparacao | null>(null);

  // Conferir todas
  const [conferindo, setConferindo] = useState(false);
  const [progConferencia, setProgConferencia] = useState(0);
  const [totalConferencia, setTotalConferencia] = useState(0);
  const [resultadoConferencia, setResultadoConferencia] = useState<ResultadoConferirTodas | null>(null);
  const [showConferencia, setShowConferencia] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Selecionar uma fórmula e rodar comparação ─────────────────────────────

  const selecionarFormula = useCallback(async (candidato: Candidato) => {
    setFormulaAtual(candidato);
    setCandidatos([]);
    setComparatorLoading(true);
    setResultado(null);
    try {
      const r = await compararFormulas(candidato.formula_id);
      setResultado(r);
    } catch {
      setResultado(null);
    } finally {
      setComparatorLoading(false);
    }
  }, []);

  // ── Resolver a busca (debounced) ──────────────────────────────────────────

  const resolverBusca = useCallback(async (termo: string) => {
    const t = termo.trim();
    if (!t) {
      setCandidatos([]);
      setFormulaAtual(null);
      setResultado(null);
      return;
    }

    setSearching(true);
    setCandidatos([]);
    setFormulaAtual(null);
    setResultado(null);

    const isNumeric = /^\d+$/.test(t);

    if (isNumeric) {
      // Tenta como número de lote
      const loteNum = parseInt(t, 10);
      const { data: loteData } = await (supabase as any)
        .from('cadastro_lotes')
        .select('formula_id, produto')
        .eq('lote', loteNum)
        .maybeSingle();

      if (loteData?.formula_id) {
        setSearching(false);
        await selecionarFormula({ formula_id: loteData.formula_id, produto: loteData.produto });
        return;
      }

      // Tenta como formula_id direto
      const { data: fData } = await (supabase as any)
        .from('formulas')
        .select('formula_id, produto')
        .eq('formula_id', t)
        .eq('sequencia', 1)
        .maybeSingle();

      if (fData) {
        setSearching(false);
        await selecionarFormula({ formula_id: fData.formula_id, produto: fData.produto });
        return;
      }

      setSearching(false);
      setCandidatos([]);
      return;
    }

    // Busca por nome de produto (mínimo 3 chars)
    if (t.length >= 3) {
      const { data } = await (supabase as any)
        .from('formulas')
        .select('formula_id, produto')
        .ilike('produto', `%${t}%`)
        .eq('sequencia', 1)
        .order('formula_id')
        .limit(60);

      const deduped: Candidato[] = [];
      const seen = new Set<string>();
      for (const r of data ?? []) {
        if (seen.has(r.formula_id)) continue;
        seen.add(r.formula_id);
        deduped.push({ formula_id: r.formula_id, produto: r.produto });
      }

      setSearching(false);
      if (deduped.length === 1) {
        await selecionarFormula(deduped[0]);
      } else {
        setCandidatos(deduped);
      }
      return;
    }

    setSearching(false);
  }, [selecionarFormula]);

  const handleBuscaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setBusca(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => resolverBusca(v), 380);
  };

  const limpar = () => {
    setBusca('');
    setCandidatos([]);
    setFormulaAtual(null);
    setResultado(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  // ── Conferir todas ────────────────────────────────────────────────────────

  const handleConferirTodas = async () => {
    setConferindo(true);
    setResultadoConferencia(null);
    setProgConferencia(0);
    setTotalConferencia(0);
    setShowConferencia(true);

    try {
      const r = await conferirTodasFormulas((done, total) => {
        setProgConferencia(done);
        setTotalConferencia(total);
      });
      setResultadoConferencia(r);
    } catch {
      // silencioso
    } finally {
      setConferindo(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Consulta de Fórmula</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowConferencia((v) => !v)}
        >
          <BarChart2 className="h-4 w-4" />
          Conferir todas
        </Button>
      </div>

      {/* ── Painel "Conferir todas" ─────────────────────────────────────────── */}
      {showConferencia && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Conferência em lote — TID × Excel</p>
            <button onClick={() => setShowConferencia(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!conferindo && !resultadoConferencia && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Compara todas as fórmulas do Excel com as do TID de uma vez.
                Pode levar alguns segundos dependendo do volume de dados.
              </p>
              <Button size="sm" onClick={handleConferirTodas}>
                Iniciar conferência
              </Button>
            </div>
          )}

          {conferindo && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verificando {progConferencia} de {totalConferencia || '…'} fórmulas…
              </div>
              {totalConferencia > 0 && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.round((progConferencia / totalConferencia) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {resultadoConferencia && !conferindo && (
            <ResultadoConferencia
              r={resultadoConferencia}
              onSelecionarFormula={async (fid) => {
                setBusca(fid);
                setShowConferencia(false);
                await selecionarFormula({ formula_id: fid, produto: '' });
              }}
              onRenovar={handleConferirTodas}
            />
          )}
        </div>
      )}

      {/* ── Campo de busca ──────────────────────────────────────────────────── */}
      <div className="relative">
        {searching ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          className="pl-9 pr-8"
          placeholder="Fórmula, lote ou nome do produto…"
          value={busca}
          onChange={handleBuscaChange}
        />
        {busca && (
          <button
            onClick={limpar}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Lista de candidatos ─────────────────────────────────────────────── */}
      {candidatos.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <p className="px-4 py-2 text-xs text-muted-foreground border-b">
            {candidatos.length} fórmula{candidatos.length !== 1 ? 's' : ''} encontrada{candidatos.length !== 1 ? 's' : ''} — escolha uma:
          </p>
          <ul className="divide-y">
            {candidatos.map((c) => (
              <li key={c.formula_id}>
                <button
                  onClick={() => { setBusca(c.formula_id); selecionarFormula(c); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <span className="font-mono text-sm font-semibold text-primary w-16 shrink-0">
                    {c.formula_id}
                  </span>
                  <span className="text-sm text-muted-foreground truncate">{c.produto}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Sem resultados ──────────────────────────────────────────────────── */}
      {!searching && busca.trim() && !formulaAtual && candidatos.length === 0 && !comparatorLoading && (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-lg">
          Nenhuma fórmula encontrada para "{busca.trim()}"
        </p>
      )}

      {/* ── Placeholder vazio ───────────────────────────────────────────────── */}
      {!busca.trim() && !formulaAtual && (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-lg">
          Digite uma fórmula, lote ou nome do produto para consultar
        </p>
      )}

      {/* ── Resultado da fórmula selecionada ────────────────────────────────── */}
      {(formulaAtual || comparatorLoading) && (
        <div className="space-y-3">
          {formulaAtual && (
            <div className="flex items-start gap-3 pb-1 border-b">
              <div>
                <p className="text-xs text-muted-foreground">Fórmula</p>
                <p className="font-mono font-bold text-lg leading-tight">{formulaAtual.formula_id}</p>
              </div>
              {formulaAtual.produto && (
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Produto</p>
                  <p className="text-sm font-medium truncate">{formulaAtual.produto}</p>
                </div>
              )}
            </div>
          )}

          <ComparatorPanel
            resultado={resultado}
            loading={comparatorLoading}
            tabelaCompleta
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-componente: resultado da conferência em lote ─────────────────────────

function ResultadoConferencia({
  r,
  onSelecionarFormula,
  onRenovar,
}: {
  r: ResultadoConferirTodas;
  onSelecionarFormula: (fid: string) => void;
  onRenovar: () => void;
}) {
  const [expanded, setExpanded] = useState<'divergentes' | 'semDepara' | null>('divergentes');

  return (
    <div className="space-y-3">
      {/* Resumo */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded-md border p-2">
          <p className="text-muted-foreground">Verificadas</p>
          <p className="text-lg font-bold">{r.totalVerificadas}</p>
        </div>
        <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 p-2">
          <p className="text-green-700 dark:text-green-400">Conferem</p>
          <p className="text-lg font-bold text-green-700 dark:text-green-400">{r.ok}</p>
        </div>
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-2">
          <p className="text-red-700 dark:text-red-400">Divergentes</p>
          <p className="text-lg font-bold text-red-700 dark:text-red-400">{r.divergentes.length}</p>
        </div>
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2">
          <p className="text-amber-700 dark:text-amber-400">Sem de-para</p>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{r.semDepara.length}</p>
        </div>
      </div>

      {r.semFórmulaTid > 0 && (
        <p className="text-xs text-muted-foreground">
          + {r.semFórmulaTid} fórmula{r.semFórmulaTid !== 1 ? 's' : ''} no Excel sem correspondente no TID
        </p>
      )}

      {/* Divergentes */}
      {r.divergentes.length > 0 && (
        <div className="rounded-md border border-red-300 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === 'divergentes' ? null : 'divergentes')}
            className="w-full flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/20 text-left"
          >
            <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
            <span className="text-xs font-semibold text-red-800 dark:text-red-400 flex-1">
              {r.divergentes.length} fórmula{r.divergentes.length !== 1 ? 's' : ''} divergentes
            </span>
            <span className="text-xs text-muted-foreground">{expanded === 'divergentes' ? '▲' : '▼'}</span>
          </button>
          {expanded === 'divergentes' && (
            <ul className="divide-y max-h-60 overflow-y-auto">
              {r.divergentes.map((d) => (
                <li key={d.formula_id}>
                  <button
                    onClick={() => onSelecionarFormula(d.formula_id)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-3 text-xs"
                  >
                    <span className="font-mono font-semibold text-foreground w-14 shrink-0">{d.formula_id}</span>
                    <span className="text-red-600">
                      {d.nDiffs} diferença{d.nDiffs !== 1 ? 's' : ''}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sem de-para */}
      {r.semDepara.length > 0 && (
        <div className="rounded-md border border-amber-300 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === 'semDepara' ? null : 'semDepara')}
            className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 text-left"
          >
            <HelpCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex-1">
              {r.semDepara.length} fórmula{r.semDepara.length !== 1 ? 's' : ''} com MPs sem de-para
            </span>
            <span className="text-xs text-muted-foreground">{expanded === 'semDepara' ? '▲' : '▼'}</span>
          </button>
          {expanded === 'semDepara' && (
            <ul className="divide-y max-h-60 overflow-y-auto">
              {r.semDepara.map((d) => (
                <li key={d.formula_id}>
                  <button
                    onClick={() => onSelecionarFormula(d.formula_id)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-3 text-xs"
                  >
                    <span className="font-mono font-semibold text-foreground w-14 shrink-0">{d.formula_id}</span>
                    <span className="text-amber-700">
                      {d.nMpsSemDepara} MP{d.nMpsSemDepara !== 1 ? 's' : ''} sem de-para
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {r.divergentes.length === 0 && r.semDepara.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Todas as fórmulas conferem — TID e Excel idênticos!
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={onRenovar} className="text-xs text-muted-foreground">
        Rodar novamente
      </Button>
    </div>
  );
}
