/**
 * PainelConsultaFormula — consulta e comparação de fórmulas TID × Excel.
 *
 * Campo de busca com autocomplete: formula_id, lote, nome do produto ou chave Excel.
 * Cada sugestão já indica se existe vínculo em formulas_excel (badge 🔗/🚫).
 * Botão "Conferir todas" roda batch nas fórmulas do Excel.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Loader2, BarChart2, CheckCircle2, AlertCircle, HelpCircle,
  X, ChevronRight, Link2, Unlink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComparatorPanel } from '@/components/ComparatorPanel';
import {
  compararFormulas,
  conferirTodasFormulas,
  type ResultadoComparacao,
  type ResultadoConferirTodas,
} from '@/lib/compararFormulas';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Sugestao {
  formula_id: string;
  produto: string;
  hasExcel: boolean;
  lote?: number; // quando encontrado via cadastro_lotes
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function PainelConsultaFormula() {
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [sugestoesLoading, setSugestoesLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const [formulaAtual, setFormulaAtual] = useState<{ formula_id: string; produto: string } | null>(null);
  const [comparatorLoading, setComparatorLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoComparacao | null>(null);

  // Conferir todas
  const [conferindo, setConferindo] = useState(false);
  const [progConferencia, setProgConferencia] = useState(0);
  const [totalConferencia, setTotalConferencia] = useState(0);
  const [resultadoConferencia, setResultadoConferencia] = useState<ResultadoConferirTodas | null>(null);
  const [showConferencia, setShowConferencia] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Buscar sugestões ────────────────────────────────────────────────────────

  const buscarSugestoes = useCallback(async (texto: string) => {
    const t = texto.trim();
    if (t.length < 3) {
      setSugestoes([]);
      setDropdownOpen(false);
      setSugestoesLoading(false);
      return;
    }

    setSugestoesLoading(true);
    const isNumeric = /^\d+$/.test(t);

    // ── Queries em paralelo ───────────────────────────────────────────────────

    const [formulaExata, formulaNome, excelChave, loteExato] = await Promise.all([
      // formula_id exato (só se numérico)
      isNumeric
        ? (supabase as any).from('formulas').select('formula_id, produto').eq('formula_id', t).eq('sequencia', 1).limit(1)
        : Promise.resolve({ data: [] }),

      // produto ilike
      (supabase as any).from('formulas').select('formula_id, produto').ilike('produto', `%${t}%`).eq('sequencia', 1).order('formula_id').limit(15),

      // produto_chave ilike no Excel (coluna pode não existir ainda — silencioso)
      (async () => {
        try {
          const { data } = await (supabase as any)
            .from('formulas_excel')
            .select('formula_id, produto_chave')
            .ilike('produto_chave', `%${t}%`)
            .eq('sequencia', 1)
            .limit(10);
          return data ?? [];
        } catch { return []; }
      })(),

      // lote exato (só se numérico)
      isNumeric
        ? (supabase as any).from('cadastro_lotes').select('lote, formula_id, produto').eq('lote', parseInt(t, 10)).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // ── Combinar e deduplicar por formula_id ──────────────────────────────────

    const combined = new Map<string, Sugestao>();

    const add = (formula_id: string, produto: string, hasExcel: boolean, lote?: number) => {
      if (!formula_id) return;
      if (combined.has(formula_id)) {
        if (hasExcel) combined.get(formula_id)!.hasExcel = true;
      } else {
        combined.set(formula_id, { formula_id, produto, hasExcel, lote });
      }
    };

    // formula_id exato vem primeiro
    for (const r of formulaExata?.data ?? []) add(r.formula_id, r.produto, false);
    // lote (prioridade alta — usuário digitou o lote)
    const ld = loteExato?.data;
    if (ld?.formula_id) add(ld.formula_id, ld.produto, false, ld.lote);
    // produto_chave do Excel — já sabemos que hasExcel = true
    for (const r of excelChave ?? []) add(r.formula_id, r.produto_chave ?? '', true);
    // produto por nome
    for (const r of formulaNome?.data ?? []) add(r.formula_id, r.produto, false);

    let lista = [...combined.values()].slice(0, 15);

    // Verificar hasExcel para os que ainda não têm (batch único)
    const semExcelCheck = lista.filter((s) => !s.hasExcel).map((s) => s.formula_id);
    if (semExcelCheck.length > 0) {
      const { data: excelCheck } = await (supabase as any)
        .from('formulas_excel')
        .select('formula_id')
        .in('formula_id', semExcelCheck)
        .eq('sequencia', 1);
      const excelSet = new Set((excelCheck ?? []).map((r: any) => r.formula_id));
      lista = lista.map((s) => ({ ...s, hasExcel: s.hasExcel || excelSet.has(s.formula_id) }));
    }

    setSugestoes(lista);
    setDropdownOpen(lista.length > 0);
    setHighlighted(-1);
    setSugestoesLoading(false);
  }, []);

  const handleBuscaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setBusca(v);
    setDropdownOpen(false);
    setSugestoesLoading(v.trim().length >= 3);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscarSugestoes(v), 300);
  };

  // ── Selecionar sugestão ─────────────────────────────────────────────────────

  const selecionarSugestao = useCallback(async (s: Sugestao) => {
    setDropdownOpen(false);
    setSugestoes([]);
    setBusca(s.formula_id);
    setFormulaAtual({ formula_id: s.formula_id, produto: s.produto });
    setComparatorLoading(true);
    setResultado(null);
    try {
      const r = await compararFormulas(s.formula_id);
      setResultado(r);
    } catch {
      setResultado(null);
    } finally {
      setComparatorLoading(false);
    }
  }, []);

  // ── Navegação por teclado ───────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || sugestoes.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, sugestoes.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0) selecionarSugestao(sugestoes[highlighted]);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
      setHighlighted(-1);
    }
  };

  const limpar = () => {
    setBusca('');
    setSugestoes([]);
    setDropdownOpen(false);
    setFormulaAtual(null);
    setResultado(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    inputRef.current?.focus();
  };

  // ── Conferir todas ──────────────────────────────────────────────────────────

  const handleConferirTodas = async () => {
    setConferindo(true);
    setResultadoConferencia(null);
    setProgConferencia(0);
    setTotalConferencia(0);
    try {
      const r = await conferirTodasFormulas((done, total) => {
        setProgConferencia(done);
        setTotalConferencia(total);
      });
      setResultadoConferencia(r);
    } catch { /* silencioso */ } finally {
      setConferindo(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

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
              </p>
              <Button size="sm" onClick={handleConferirTodas}>Iniciar conferência</Button>
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
              onSelecionarFormula={(fid) => {
                setBusca(fid);
                setShowConferencia(false);
                selecionarSugestao({ formula_id: fid, produto: '', hasExcel: true });
              }}
              onRenovar={handleConferirTodas}
            />
          )}
        </div>
      )}

      {/* ── Campo de busca com autocomplete ────────────────────────────────── */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          {sugestoesLoading ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={busca}
            onChange={handleBuscaChange}
            onKeyDown={handleKeyDown}
            onFocus={() => sugestoes.length > 0 && setDropdownOpen(true)}
            placeholder="Fórmula, lote, produto ou chave Excel (MBG-10-…)"
            className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="off"
          />
          {busca && (
            <button
              onClick={limpar}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown de sugestões */}
        {dropdownOpen && sugestoes.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
            <ul role="listbox">
              {sugestoes.map((s, i) => (
                <li
                  key={s.formula_id}
                  role="option"
                  aria-selected={highlighted === i}
                  onMouseDown={(e) => { e.preventDefault(); selecionarSugestao(s); }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm border-b last:border-0 transition-colors ${
                    highlighted === i ? 'bg-accent' : 'hover:bg-accent/60'
                  }`}
                >
                  {/* formula_id em destaque */}
                  <span className="font-mono font-bold text-primary shrink-0 w-12 text-right">
                    {s.formula_id}
                  </span>

                  {/* lote badge se aplicável */}
                  {s.lote && (
                    <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded px-1 py-0.5 shrink-0">
                      lote {s.lote}
                    </span>
                  )}

                  {/* nome do produto */}
                  <span className="flex-1 truncate text-muted-foreground">{s.produto}</span>

                  {/* badge Excel */}
                  {s.hasExcel ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded px-1.5 py-0.5 shrink-0">
                      <Link2 className="h-2.5 w-2.5" />
                      Excel
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 shrink-0">
                      <Unlink className="h-2.5 w-2.5" />
                      sem Excel
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Dica inicial */}
      {!busca && !formulaAtual && (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-lg">
          Digite ≥ 3 caracteres — fórmula, lote, produto ou chave Excel
        </p>
      )}

      {/* Sem resultados */}
      {busca.trim().length >= 3 && !sugestoesLoading && sugestoes.length === 0 && !formulaAtual && !dropdownOpen && (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-lg">
          Nenhuma fórmula encontrada para "{busca.trim()}"
        </p>
      )}

      {/* ── Resultado da fórmula selecionada ──────────────────────────────── */}
      {(formulaAtual || comparatorLoading) && (
        <div className="space-y-3">
          {formulaAtual && (
            <div className="flex items-baseline gap-3 pb-2 border-b">
              <span className="font-mono font-bold text-2xl text-primary leading-none">
                {formulaAtual.formula_id}
              </span>
              {formulaAtual.produto && (
                <span className="text-sm text-muted-foreground truncate">{formulaAtual.produto}</span>
              )}
            </div>
          )}
          <ComparatorPanel resultado={resultado} loading={comparatorLoading} tabelaCompleta />
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
                    <span className="font-mono font-semibold text-primary w-14 shrink-0">{d.formula_id}</span>
                    <span className="text-red-600">{d.nDiffs} diferença{d.nDiffs !== 1 ? 's' : ''}</span>
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
                    <span className="font-mono font-semibold text-primary w-14 shrink-0">{d.formula_id}</span>
                    <span className="text-amber-700">{d.nMpsSemDepara} MP{d.nMpsSemDepara !== 1 ? 's' : ''} sem de-para</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {r.divergentes.length === 0 && r.semDepara.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
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
