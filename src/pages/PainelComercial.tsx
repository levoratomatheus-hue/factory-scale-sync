import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, PackageSearch, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { cn, formatKg } from '@/lib/utils';
import { feriadosDoAno, proximoDiaUtil, diasUteis, somarDiasUteis, subDias } from '@/lib/diasUteis';

function diasUteisSemanAtual(): string[] {
  const today = new Date();
  const dow = today.getDay();
  const distToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distToMon);
  monday.setHours(12, 0, 0, 0);
  const dias: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const s = format(d, 'yyyy-MM-dd');
    if (!feriadosDoAno(d.getFullYear()).has(s)) dias.push(s);
  }
  return dias;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

const STATUS_VISIVEIS = [
  'pendente', 'aguardando_linha', 'aguardando_mistura',
  'em_pesagem', 'em_mistura', 'em_linha', 'concluido',
];

interface OrdemComercial {
  id: string;
  produto: string;
  lote: string;
  quantidade: number;
  status: string;
  data_programacao: string;
  data_emissao: string | null;
  data_conclusao: string | null;
  quantidade_real: number | null;
  formula_id: string | null;
  programacao_confirmada: boolean | null;
  tipo_op: string | null;
}

function deduplicar(rows: OrdemComercial[]): OrdemComercial[] {
  const byFormula = new Map<string, OrdemComercial>();
  const semFormula: OrdemComercial[] = [];
  for (const op of rows) {
    if (!op.formula_id) { semFormula.push(op); continue; }
    const cur = byFormula.get(op.formula_id);
    if (!cur || op.data_programacao > cur.data_programacao) byFormula.set(op.formula_id, op);
  }
  return [...byFormula.values(), ...semFormula]
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));
}

const SELECT_FIELDS = 'id, produto, lote, quantidade, quantidade_real, status, data_programacao, data_emissao, data_conclusao, formula_id, programacao_confirmada, tipo_op';

// ── Card colapsável — modo busca ───────────────────────────────────────────────

function CardBusca({ op, isOpen, onToggle, hj }: {
  op: OrdemComercial;
  isOpen: boolean;
  onToggle: () => void;
  hj: string;
}) {
  const confirmada = op.programacao_confirmada === true;
  const concluida = op.status === 'concluido' && !!op.data_conclusao;
  const isEstoque = op.tipo_op === 'estoque';

  const borderClass = isEstoque
    ? 'border-purple-300 bg-purple-50/50'
    : (concluida || confirmada)
      ? 'border-green-300 bg-green-50/50'
      : 'border-orange-300 bg-orange-50/50';

  const dotClass = isEstoque
    ? 'bg-purple-500'
    : (concluida || confirmada) ? 'bg-green-500' : 'bg-orange-400';

  const emissaoFmt = op.data_emissao
    ? format(new Date(op.data_emissao + 'T12:00:00'), 'dd/MM/yyyy')
    : '—';
  const conclusaoFmt = op.data_conclusao
    ? format(new Date(op.data_conclusao.substring(0, 10) + 'T12:00:00'), 'dd/MM/yyyy')
    : null;
  const du = op.data_emissao
    ? diasUteis(op.data_emissao, (op.data_conclusao ?? hj).substring(0, 10))
    : null;
  const dispStr = concluida
    ? op.data_conclusao!.substring(0, 10)
    : (confirmada || isEstoque)
      ? proximoDiaUtil(op.data_programacao)
      : op.data_emissao ? somarDiasUteis(op.data_emissao, 7) : null;
  const dispFmt = dispStr
    ? format(new Date(dispStr + 'T12:00:00'), 'dd/MM/yyyy')
    : '—';
  const dispLabel = concluida
    ? 'Disponível'
    : dispStr
      ? dispStr < hj ? 'Disponível desde' : dispStr === hj ? 'Disponível hoje' : 'Disponível em'
      : null;

  return (
    <div className={`rounded-xl border ${borderClass}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
        aria-expanded={isOpen}
      >
        <span className={`mt-0.5 h-2.5 w-2.5 rounded-full shrink-0 self-start ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-snug break-words">{op.produto}</p>
          <p className="text-sm font-bold tabular-nums mt-0.5">{formatKg(op.quantidade)} kg</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 self-center', isOpen && 'rotate-180')} />
      </button>

      <div className={cn('grid transition-[grid-template-rows] duration-200', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-4 pb-3 pt-1.5 space-y-1 border-t border-black/5 dark:border-white/10">
            <p className="text-xs text-muted-foreground">Lote {op.lote}</p>
            {op.quantidade_real != null && (
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                Produzido: {formatKg(op.quantidade_real)} kg
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Emitido {emissaoFmt}
              {du !== null && (
                <span className={cn(
                  'ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-bold leading-4',
                  du <= 5 ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : du <= 10 ? 'bg-orange-100 text-orange-700 border-orange-200'
                    : 'bg-red-100 text-red-700 border-red-200'
                )}>{du}du</span>
              )}
            </p>
            {conclusaoFmt && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                Concluído em {conclusaoFmt}
              </p>
            )}
            {isEstoque && dispStr && (
              <div className="mt-1.5 inline-flex rounded-lg px-2 py-1 bg-purple-50 border border-purple-300">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-purple-700 font-semibold">Estoque</p>
                  <p className="text-xs font-semibold text-purple-800">
                    {dispStr === hj ? 'Disponível hoje' : `Disponível em ${dispFmt}`}
                  </p>
                </div>
              </div>
            )}
            {!isEstoque && dispLabel && (
              <div className={cn('mt-1.5 inline-flex rounded-lg px-2 py-1', concluida && 'bg-green-100 border border-green-300')}>
                <div>
                  <p className={cn('text-[10px] uppercase tracking-wide font-semibold', concluida ? 'text-green-700' : 'text-muted-foreground')}>
                    {dispLabel}
                  </p>
                  {(dispStr !== hj || concluida) && (
                    <p className={cn('text-xs font-semibold', concluida && 'text-green-800')}>{dispFmt}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card colapsável — modo semanal ─────────────────────────────────────────────

function CardSemana({ op, isOpen, onToggle, hj }: {
  op: OrdemComercial;
  isOpen: boolean;
  onToggle: () => void;
  hj: string;
}) {
  const confirmada = op.programacao_confirmada === true;
  const concluida = op.status === 'concluido' && !!op.data_conclusao;
  const isEstoque = op.tipo_op === 'estoque';

  const dotClass = isEstoque ? 'bg-purple-500' : confirmada ? 'bg-green-500' : 'bg-orange-400';

  const emissaoFmt = op.data_emissao
    ? format(new Date(op.data_emissao + 'T12:00:00'), 'dd/MM', { locale: ptBR })
    : '—';
  const conclusaoFmt = op.data_conclusao
    ? format(new Date(op.data_conclusao.substring(0, 10) + 'T12:00:00'), 'dd/MM', { locale: ptBR })
    : null;
  const du = op.data_emissao
    ? diasUteis(op.data_emissao, (op.data_conclusao ?? hj).substring(0, 10))
    : null;
  const duBadge = du !== null
    ? du <= 5
      ? { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: `${du}du` }
      : du <= 10
        ? { cls: 'bg-orange-100 text-orange-700 border-orange-200', label: `${du}du` }
        : { cls: 'bg-red-100 text-red-700 border-red-200', label: `${du}du` }
    : null;

  return (
    <div className={cn('border rounded-lg bg-background', isEstoque && 'border-purple-300')}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-2 text-left"
        aria-expanded={isOpen}
      >
        <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 self-start ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium leading-snug break-words">{op.produto}</p>
          <p className="text-xs font-bold tabular-nums mt-0.5">{formatKg(op.quantidade)} kg</p>
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 self-center ml-1', isOpen && 'rotate-180')} />
      </button>

      <div className={cn('grid transition-[grid-template-rows] duration-200', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-2 pb-2 pt-1.5 space-y-1 border-t border-black/5 dark:border-white/10">
            <p className="text-xs text-muted-foreground">Lote {op.lote}</p>
            {isEstoque && (
              <span className="inline-flex items-center rounded-full border border-purple-300 bg-purple-50 px-1.5 py-0 text-[10px] font-bold leading-4 text-purple-700">
                Estoque
              </span>
            )}
            {op.quantidade_real != null && (
              <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                Produzido: {formatKg(op.quantidade_real)} kg
              </p>
            )}
            {!isEstoque && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-muted-foreground">Emitido {emissaoFmt}</span>
                {duBadge && (
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-bold leading-4 ${duBadge.cls}`}>
                    {duBadge.label}
                  </span>
                )}
              </div>
            )}
            {conclusaoFmt && (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                Concluído {conclusaoFmt}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function PainelComercial() {
  const [busca, setBusca] = useState('');
  const [ordens, setOrdens] = useState<OrdemComercial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const term = busca.trim();
  const modoTexto = term.length >= 3;
  const diasSemana = useMemo(() => diasUteisSemanAtual(), []);
  const hj = format(new Date(), 'yyyy-MM-dd');

  const toggleCard = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const delay = modoTexto ? 350 : 0;

    const timer = setTimeout(async () => {
      setLoading(true);
      setErro(null);
      try {
        let rows: OrdemComercial[] = [];

        if (modoTexto) {
          const { data, error } = await supabase
            .from('ordens')
            .select(SELECT_FIELDS)
            .in('status', STATUS_VISIVEIS)
            .or(`produto.ilike.%${term}%,lote.ilike.%${term}%`)
            .order('data_programacao', { ascending: false })
            .limit(300);
          if (error) throw new Error(error.message);
          rows = deduplicar((data as OrdemComercial[]) ?? []);
        } else {
          const weekStart = diasSemana[0];
          const weekEnd = diasSemana[diasSemana.length - 1];
          const dataMinProg = subDias(weekStart, 10);
          const dataMinEmissao = subDias(weekStart, 14);
          const diasSet = new Set(diasSemana);

          const [{ data: dataProg, error: errProg }, { data: dataEmissao, error: errEmissao }] = await Promise.all([
            supabase
              .from('ordens')
              .select(SELECT_FIELDS)
              .in('status', STATUS_VISIVEIS)
              .or('programacao_confirmada.eq.true,tipo_op.eq.estoque')
              .gte('data_programacao', dataMinProg)
              .lte('data_programacao', weekEnd)
              .order('produto', { ascending: true })
              .limit(500),
            supabase
              .from('ordens')
              .select(SELECT_FIELDS)
              .in('status', STATUS_VISIVEIS)
              .neq('programacao_confirmada', true)
              .neq('tipo_op', 'estoque')
              .gte('data_emissao', dataMinEmissao)
              .lte('data_emissao', weekEnd)
              .order('produto', { ascending: true })
              .limit(500),
          ]);

          if (errProg) throw new Error(errProg.message);
          if (errEmissao) throw new Error(errEmissao.message);

          const confirmadas = ((dataProg as OrdemComercial[]) ?? [])
            .filter(op => {
              if (op.status === 'concluido' && op.data_conclusao)
                return diasSet.has(op.data_conclusao.substring(0, 10));
              return diasSet.has(proximoDiaUtil(op.data_programacao) ?? '');
            });
          const naoConfirmadas = ((dataEmissao as OrdemComercial[]) ?? [])
            .filter(op => op.data_emissao && diasSet.has(somarDiasUteis(op.data_emissao, 7)));

          rows = [...confirmadas, ...naoConfirmadas];
        }

        if (!cancelled) setOrdens(rows);
      } catch (e) {
        if (!cancelled) {
          setErro(e instanceof Error ? e.message : 'Erro ao buscar dados.');
          setOrdens([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);

    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  // Agrupa OPs por dia de disponibilidade (apenas no modo semanal)
  const ordPorDia = useMemo(() => {
    const map = new Map<string, OrdemComercial[]>();
    if (!ordens || modoTexto) return map;
    for (const op of ordens) {
      const confirmada = op.programacao_confirmada === true;
      const isEstoque = op.tipo_op === 'estoque';
      const dia = op.status === 'concluido' && op.data_conclusao
        ? op.data_conclusao.substring(0, 10)
        : (confirmada || isEstoque)
          ? proximoDiaUtil(op.data_programacao)
          : (op.data_emissao ? somarDiasUteis(op.data_emissao, 7) : null);
      if (!dia) continue;
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(op);
    }
    const dedup = new Map<string, OrdemComercial[]>();
    for (const [dia, ops] of map) dedup.set(dia, deduplicar(ops));
    return dedup;
  }, [ordens, modoTexto]);

  // Resultados de busca (apenas no modo texto)
  const resultadosBusca = useMemo(() => {
    if (!ordens || !modoTexto) return [];
    return ordens;
  }, [ordens, modoTexto]);

  return (
    /* Ocupa a altura disponível entre o header do app e o fim da viewport */
    <div className="flex flex-col h-[calc(100dvh-3.75rem)] sm:h-[calc(100dvh-4.5rem)] max-w-5xl mx-auto">

      {/* ── Cabeçalho fixo ───────────────────────────────────────────────── */}
      <div className="shrink-0 pb-3 space-y-3 bg-background z-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consulta de Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {modoTexto ? 'Resultados da busca em todas as datas' : 'Disponibilidade da semana atual'}
          </p>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por produto ou lote (mín. 3 letras)…"
            className="w-full rounded-xl border bg-background pl-9 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
            Confirmado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
            Estimado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-500" />
            Estoque
          </span>
        </div>
      </div>

      {/* ── Área rolável ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0">

        {/* Erro */}
        {erro && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {erro}
          </div>
        )}

        {/* Carregando */}
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && modoTexto && (
          /* ── Modo busca: lista vertical de cards colapsáveis ── */
          resultadosBusca.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <PackageSearch className="h-10 w-10" />
              <p className="text-sm">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="space-y-1.5 pb-4">
              {resultadosBusca.map((op) => (
                <CardBusca
                  key={op.id}
                  op={op}
                  isOpen={openIds.has(op.id)}
                  onToggle={() => toggleCard(op.id)}
                  hj={hj}
                />
              ))}
              <p className="text-xs text-muted-foreground text-right pt-1">
                {resultadosBusca.length} produto{resultadosBusca.length !== 1 ? 's' : ''}
              </p>
            </div>
          )
        )}

        {!loading && !modoTexto && (
          /* ── Modo semanal: colunas por dia com header sticky ── */
          <div className="flex gap-4 pb-4 min-w-max">
            {diasSemana.map((dia) => {
              const ops = ordPorDia.get(dia) ?? [];
              const isHoje = dia === hj;
              const nomeDia = capitalize(
                format(new Date(dia + 'T12:00:00'), 'EEEE', { locale: ptBR })
              );
              const dataDia = format(new Date(dia + 'T12:00:00'), 'dd/MM');

              return (
                <div
                  key={dia}
                  className={cn(
                    'w-[220px] shrink-0 rounded-xl border shadow-sm flex flex-col',
                    isHoje ? 'border-primary/60 bg-primary/5' : 'border-border bg-card'
                  )}
                >
                  {/* Cabeçalho da coluna — sticky dentro da área rolável */}
                  <div
                    className={cn(
                      'sticky top-0 z-10 px-3 py-2.5 border-b flex items-center justify-between gap-2 rounded-t-xl',
                      isHoje
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-card'
                    )}
                  >
                    <span className={cn('font-semibold text-sm', isHoje && 'text-primary')}>
                      {nomeDia}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{dataDia}</span>
                  </div>

                  {/* Lista de cards colapsáveis */}
                  <div className="px-2 py-2 space-y-1.5 flex-1">
                    {ops.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1 py-1">
                        Nenhum produto previsto
                      </p>
                    ) : (
                      ops.map((op) => (
                        <CardSemana
                          key={op.id}
                          op={op}
                          isOpen={openIds.has(op.id)}
                          onToggle={() => toggleCard(op.id)}
                          hj={hj}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
