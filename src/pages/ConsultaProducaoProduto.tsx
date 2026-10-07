import { useState, useRef, useCallback, useEffect } from 'react';
import { Search, X, ChevronDown, Package, ShoppingCart, Loader2, Zap } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/StatusBadge';
import { MarcaBadge } from '@/components/MarcaBadge';
import { cn, formatKg, parseHoras } from '@/lib/utils';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Ordem {
  id: string;
  produto: string;
  lote: string;
  quantidade: number;
  quantidade_real: number | null;
  status: string;
  linha: number | null;
  balanca: number | null;
  formula_id: string | null;
  tamanho_batelada: number | null;
  obs: string | null;
  obs_linha: string | null;
  obs_laboratorio: string | null;
  marca: string | null;
  data_programacao: string | null;
  data_emissao: string | null;
  programacao_confirmada: boolean | null;
  criado_em: string;
  motivo_reprovacao: string | null;
  data_reprovacao: string | null;
  tipo_op: string | null;
}

interface RegistroDiario {
  id: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  registro_producao: { qty: number; peso: number }[] | null;
}

interface Acerto {
  id: string;
  cod_tid: string | null;
  materia_prima: string;
  quantidade_kg: number;
  data_retirada: string | null;
  observacao: string | null;
}

interface Detalhes {
  registros: RegistroDiario[];
  acertos: Acerto[];
  infLabFixa: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return '—'; }
}

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return '—'; }
}

function calcKgHora(registros: RegistroDiario[]): { totalKg: number; totalHoras: number; kgHora: number | null } {
  let totalKg = 0;
  let totalHoras = 0;
  for (const r of registros) {
    const items = Array.isArray(r.registro_producao) ? r.registro_producao : [];
    const kg = items.reduce((s, i) => s + (i.qty || 0) * (i.peso || 0), 0);
    const h = parseHoras(r.hora_inicio, r.hora_fim);
    if (h !== null && h > 0) {
      totalKg += kg;
      totalHoras += h;
    }
  }
  return {
    totalKg,
    totalHoras,
    kgHora: totalHoras > 0 && totalKg > 0 ? totalKg / totalHoras : null,
  };
}

// ── Subcomponentes de layout ──────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="font-medium text-foreground text-xs">{value}</dd>
    </div>
  );
}

function ObsRow({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-xs">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}: </span>
      <span className="text-foreground">{text}</span>
    </p>
  );
}

// ── Seção de detalhes carregados sob demanda ──────────────────────────────────

function DetalhesCard({ detalhes }: { detalhes: Detalhes }) {
  const { registros, acertos, infLabFixa } = detalhes;
  const { totalKg, totalHoras, kgHora } = calcKgHora(registros);

  const temRegistros = registros.length > 0;
  const temAcertos   = acertos.length > 0;
  const temLab       = !!infLabFixa;

  if (!temRegistros && !temAcertos && !temLab) {
    return (
      <p className="text-[11px] text-muted-foreground italic">
        Sem registros adicionais para esta OP.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* kg/hora */}
      {kgHora !== null && (
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>
            {kgHora.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg/h
          </span>
          <span className="text-muted-foreground font-normal">
            ({formatKg(totalKg)} kg em {totalHoras.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h)
          </span>
        </div>
      )}

      {/* Registros diários */}
      {temRegistros && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
            Registros de produção ({registros.length})
          </p>
          <div className="space-y-1">
            {registros.map((r) => {
              const items = Array.isArray(r.registro_producao) ? r.registro_producao.filter(i => i.qty || i.peso) : [];
              const kgDia = items.reduce((s, i) => s + (i.qty || 0) * (i.peso || 0), 0);
              const horas = parseHoras(r.hora_inicio, r.hora_fim);
              return (
                <div key={r.id} className="flex items-start gap-2 text-xs rounded-md bg-muted/50 px-2 py-1.5">
                  <span className="tabular-nums text-muted-foreground shrink-0 w-20">{fmtData(r.data)}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {r.hora_inicio ?? '—'}–{r.hora_fim ?? '—'}
                    {horas !== null && ` (${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h)`}
                  </span>
                  {kgDia > 0 && (
                    <span className="font-semibold ml-auto shrink-0">{formatKg(kgDia)} kg</span>
                  )}
                  {items.length > 0 && (
                    <span className="text-muted-foreground shrink-0">
                      {items.map(i => `${i.qty}×${formatKg(i.peso)}`).join(' + ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Acertos de material */}
      {temAcertos && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">
            Acertos de material ({acertos.length})
          </p>
          <div className="space-y-1">
            {acertos.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 px-2 py-1.5">
                <span className="flex-1 font-medium text-foreground">{a.materia_prima}</span>
                <span className="tabular-nums font-semibold shrink-0">{formatKg(a.quantidade_kg)} kg</span>
                <span className="tabular-nums text-muted-foreground shrink-0">{fmtData(a.data_retirada)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inf. lab fixa */}
      {temLab && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Informação de laboratório</p>
          <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed rounded-md bg-muted/50 px-2 py-1.5">
            {infLabFixa}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Card de OP ───────────────────────────────────────────────────────────────

function OrdemCard({ ordem }: { ordem: Ordem }) {
  const [open, setOpen]             = useState(false);
  const [detalhes, setDetalhes]     = useState<Detalhes | null>(null);
  const [loadingDet, setLoadingDet] = useState(false);
  const carregado = useRef(false);

  // Busca detalhes apenas na primeira expansão
  useEffect(() => {
    if (!open || carregado.current) return;
    carregado.current = true;
    setLoadingDet(true);

    const queries: Promise<any>[] = [
      // Registros diários
      (supabase as any)
        .from('registros_diarios')
        .select('id, data, hora_inicio, hora_fim, registro_producao')
        .eq('ordem_id', ordem.id)
        .order('data', { ascending: true }),

      // Acertos de material: vinculados pela fórmula + lote da OP
      ordem.formula_id
        ? (supabase as any)
            .from('consumo_mp')
            .select('id, cod_tid, materia_prima, quantidade_kg, data_retirada, observacao')
            .eq('eh_acerto', true)
            .eq('acerto_formula_id', ordem.formula_id)
            .eq('acerto_lote', ordem.lote)
            .order('data_retirada', { ascending: false })
        : Promise.resolve({ data: [] }),

      // Inf. lab fixa pela fórmula
      ordem.formula_id
        ? (supabase as any)
            .from('inf_lab_fixa')
            .select('texto')
            .eq('formula_id', ordem.formula_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ];

    Promise.all(queries).then(([reg, acert, lab]) => {
      setDetalhes({
        registros : (reg.data   ?? []) as RegistroDiario[],
        acertos   : (acert.data ?? []) as Acerto[],
        infLabFixa: (lab.data as any)?.texto ?? null,
      });
      setLoadingDet(false);
    });
  }, [open, ordem.id, ordem.formula_id, ordem.lote]);

  const reprovado = !!ordem.motivo_reprovacao;
  const concluido = ordem.status === 'concluido';
  const emLinha   = ordem.status === 'em_linha';
  const estoque   = ordem.tipo_op === 'estoque';

  const borderClass = reprovado
    ? 'border-red-300 bg-red-50/60 dark:bg-red-900/20'
    : concluido
    ? 'border-green-400 bg-green-100/80 dark:bg-green-900/40'
    : emLinha
    ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-900/20'
    : estoque
    ? 'border-purple-300 bg-purple-50/50 dark:bg-purple-900/20'
    : 'border-border';

  const dotClass = reprovado
    ? 'bg-red-500'
    : concluido
    ? 'bg-green-500'
    : emLinha
    ? 'bg-blue-500'
    : estoque
    ? 'bg-purple-500'
    : 'bg-orange-400';

  return (
    <div className={cn('rounded-xl border bg-card shadow-sm overflow-hidden', borderClass)}>
      {/* ── Header (sempre visível) ── */}
      <button
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', dotClass)} />

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-snug break-words">{ordem.produto}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Lote {ordem.lote}</p>
          </div>

          {/* Bloco direito: quantidade + data ref + status badge */}
          <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
            <span className="text-xs font-bold tabular-nums">{formatKg(ordem.quantidade)} kg</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {fmtData(ordem.criado_em)}
            </span>
            <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
          </div>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground mt-1 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* ── Body expansível ── */}
      <div className={cn('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-2 space-y-3 border-t border-black/5 dark:border-white/10">

            {/* Marca + tipo_op */}
            <div className="flex items-center gap-2 flex-wrap">
              <MarcaBadge marca={ordem.marca} size="sm" />
              {ordem.tipo_op && (
                <span className={cn(
                  'inline-flex items-center gap-0.5 text-[10px] font-semibold rounded px-1.5 py-0.5 border',
                  ordem.tipo_op === 'estoque'
                    ? 'text-purple-700 bg-purple-50 border-purple-200'
                    : 'text-blue-700 bg-blue-50 border-blue-200',
                )}>
                  {ordem.tipo_op === 'estoque'
                    ? <><Package className="h-2.5 w-2.5 shrink-0" /> Estoque</>
                    : <><ShoppingCart className="h-2.5 w-2.5 shrink-0" /> Venda</>}
                </span>
              )}
            </div>

            {/* Campos fixos da OP */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Field label="Qtd. programada"  value={`${formatKg(ordem.quantidade)} kg`} />
              <Field label="Qtd. real"         value={ordem.quantidade_real != null ? `${formatKg(ordem.quantidade_real)} kg` : '—'} />
              {ordem.formula_id      && <Field label="Fórmula"    value={ordem.formula_id} />}
              {ordem.tamanho_batelada != null && <Field label="Batelada"  value={`${formatKg(ordem.tamanho_batelada)} kg`} />}
              {ordem.linha   != null && <Field label="Linha"    value={String(ordem.linha)} />}
              {ordem.balanca != null && <Field label="Balança"  value={String(ordem.balanca)} />}
              <Field label="Criado em"      value={fmtDataHora(ordem.criado_em)} />
              {ordem.data_emissao     && <Field label="Emissão"   value={fmtData(ordem.data_emissao)} />}
              {ordem.data_programacao && <Field label="Programado" value={fmtData(ordem.data_programacao)} />}
              {ordem.data_reprovacao  && <Field label="Reprovado" value={fmtData(ordem.data_reprovacao)} />}
            </dl>

            {/* Obs */}
            {ordem.obs            && <ObsRow label="Obs. geral"  text={ordem.obs} />}
            {ordem.obs_linha      && <ObsRow label="Obs. linha"  text={ordem.obs_linha} />}
            {ordem.obs_laboratorio && <ObsRow label="Obs. lab"   text={ordem.obs_laboratorio} />}

            {/* Motivo reprovação */}
            {reprovado && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2.5 py-2 text-red-700 dark:text-red-400 text-[11px]">
                <span className="font-semibold">Reprovado:</span> {ordem.motivo_reprovacao}
              </div>
            )}

            {/* ── Divisor + detalhes sob demanda ── */}
            <div className="border-t border-black/5 dark:border-white/10 pt-2">
              {loadingDet && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando registros…
                </div>
              )}
              {!loadingDet && detalhes && <DetalhesCard detalhes={detalhes} />}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Campos de busca na tabela ordens ─────────────────────────────────────────

const FIELDS =
  'id, produto, lote, quantidade, quantidade_real, status, linha, balanca, ' +
  'formula_id, tamanho_batelada, obs, obs_linha, obs_laboratorio, marca, ' +
  'data_programacao, data_emissao, programacao_confirmada, criado_em, ' +
  'motivo_reprovacao, data_reprovacao, tipo_op';

// ── Página principal ─────────────────────────────────────────────────────────

export default function ConsultaProducaoProduto() {
  const [busca, setBusca]         = useState('');
  const [termo, setTermo]         = useState('');
  const [ordens, setOrdens]       = useState<Ordem[]>([]);
  const [loading, setLoading]     = useState(false);
  const [buscado, setBuscado]     = useState(false);

  // Autocomplete
  const [sugestoes, setSugestoes]       = useState<string[]>([]);
  const [showSug, setShowSug]           = useState(false);
  const [loadingSug, setLoadingSug]     = useState(false);
  const [highlighted, setHighlighted]   = useState(-1);

  const inputRef  = useRef<HTMLInputElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const debRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSug(false);
      }
    }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  const buscar = useCallback(async (texto: string) => {
    const q = texto.trim();
    if (q.length < 3) return;
    setShowSug(false);
    setTermo(q);
    setBuscado(true);
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('ordens')
      .select(FIELDS)
      .ilike('produto', `%${q}%`)
      .order('criado_em', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      console.error('[ConsultaProducaoProduto]', error.message);
      setOrdens([]);
      return;
    }
    setOrdens((data as Ordem[]) ?? []);
  }, []);

  const handleBuscaChange = (v: string) => {
    setBusca(v);
    setHighlighted(-1);
    if (debRef.current) clearTimeout(debRef.current);
    if (v.trim().length < 3) { setSugestoes([]); setShowSug(false); return; }
    debRef.current = setTimeout(async () => {
      setLoadingSug(true);
      const { data } = await (supabase as any)
        .from('ordens')
        .select('produto')
        .ilike('produto', `%${v.trim()}%`)
        .order('produto')
        .limit(80); // busca mais do que mostra para deduplicar
      // Deduplica nomes (DISTINCT manual)
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const r of (data ?? [])) {
        if (!seen.has(r.produto)) { seen.add(r.produto); unique.push(r.produto); }
        if (unique.length >= 15) break;
      }
      setSugestoes(unique);
      setShowSug(unique.length > 0);
      setLoadingSug(false);
    }, 300);
  };

  const selecionarSugestao = (produto: string) => {
    setBusca(produto);
    setSugestoes([]);
    setShowSug(false);
    buscar(produto);
  };

  const limpar = () => {
    setBusca('');
    setTermo('');
    setOrdens([]);
    setBuscado(false);
    setSugestoes([]);
    setShowSug(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((v) => Math.min(v + 1, sugestoes.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((v) => Math.max(v - 1, -1));
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && sugestoes[highlighted]) {
        selecionarSugestao(sugestoes[highlighted]);
      } else {
        buscar(busca);
      }
    } else if (e.key === 'Escape') {
      setShowSug(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Consulta por Produto</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Histórico completo de OPs de um produto, da mais recente à mais antiga.
        </p>
      </div>

      {/* Campo de busca com autocomplete */}
      <div className="flex gap-2">
        <div ref={wrapRef} className="relative flex-1">
          {loadingSug
            ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none" />
            : <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          }
          <input
            ref={inputRef}
            type="text"
            value={busca}
            onChange={(e) => handleBuscaChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (sugestoes.length > 0) setShowSug(true); }}
            placeholder="Código ou nome do produto (mín. 3 caracteres)"
            className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="off"
          />
          {busca && (
            <button
              onClick={limpar}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              title="Limpar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Dropdown de sugestões */}
          {showSug && sugestoes.length > 0 && (
            <ul
              role="listbox"
              className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-md border border-border bg-card shadow-lg max-h-52 overflow-y-auto py-1"
            >
              {sugestoes.map((produto, i) => (
                <li
                  key={produto}
                  role="option"
                  aria-selected={highlighted === i}
                  onMouseDown={(e) => { e.preventDefault(); selecionarSugestao(produto); }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={cn(
                    'px-3 py-2 cursor-pointer text-sm transition-colors',
                    highlighted === i ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                  )}
                >
                  {produto}
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={() => buscar(busca)}
          disabled={busca.trim().length < 3 || loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar
        </button>
      </div>

      {/* Contagem / estados */}
      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse">Buscando…</p>
      )}

      {!loading && buscado && ordens.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{ordens.length}</span>{' '}
          {ordens.length === 1 ? 'OP encontrada' : 'OPs encontradas'} para{' '}
          <span className="font-mono font-semibold">"{termo}"</span>
        </p>
      )}

      {!loading && buscado && ordens.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">
            Nenhuma produção encontrada para{' '}
            <span className="font-mono font-semibold">"{termo}"</span>
          </p>
          <p className="text-xs mt-1 opacity-70">Verifique o código/nome e tente novamente.</p>
        </div>
      )}

      {!buscado && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Digite o código ou nome do produto e pressione Enter.</p>
        </div>
      )}

      {/* Lista de cards */}
      {!loading && ordens.length > 0 && (
        <div className="space-y-2">
          {ordens.map((o) => (
            <OrdemCard key={o.id} ordem={o} />
          ))}
        </div>
      )}
    </div>
  );
}
