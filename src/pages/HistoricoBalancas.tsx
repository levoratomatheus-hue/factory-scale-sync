import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatKg, cn } from '@/lib/utils';
import { Loader2, RefreshCw, ChevronDown, Scale, Users, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Sessao {
  id: string;
  ordem_id: string | null;
  operador_nome: string | null;
  balanca: number | null;
  lote: string | null;
  produto: string | null;
  inicio: string;
  fim: string | null;
  bateladas: number | null;
  kg_pesado: number | null;
  kg_nominal: number | null;
  motivo_fim: string | null;
}

interface GrupoOP {
  chave: string;
  ordem_id: string | null;
  produto: string | null;
  lote: string | null;
  balanca: number | null;
  dataInicio: string;
  sessoes: Sessao[];
  totalKgReal: number;
  totalKgNominal: number;
  operadores: string[];
}

interface MetricaGrupo {
  label: string;
  kg: number;
  kgNominal: number;
  tempoMs: number;
  ops: Set<string>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseUtc(iso: string): Date {
  return new Date(/[Z+]/.test(iso) ? iso : iso + 'Z');
}

function fmtData(iso: string) {
  return parseUtc(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fmtHora(iso: string) {
  return parseUtc(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  });
}

function fmtDuracao(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function fmtDuracaoSessao(inicio: string, fim: string | null): string {
  if (!fim) return 'em andamento';
  const diff = parseUtc(fim).getTime() - parseUtc(inicio).getTime();
  return fmtDuracao(diff);
}

function fmtMotivo(motivo: string | null): { label: string; cls: string } {
  if (motivo === 'conclusao') return { label: 'Concluída',    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
  if (motivo === 'pausa')     return { label: 'Pausada',      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' };
  if (motivo === 'forcado')   return { label: 'Forçado',      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
  return                             { label: 'Em andamento', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ── Card expandível por OP ─────────────────────────────────────────────────────

function CardOP({ grupo, onApagar }: { grupo: GrupoOP; onApagar: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [sessaoParaApagar, setSessaoParaApagar] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  return (
    <>
    <div>
      <button
        className="w-full text-left grid grid-cols-[1fr_110px_110px_24px] sm:grid-cols-[1fr_90px_110px_110px_90px_24px] items-center gap-x-3 px-3 py-2 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Produto + Lote + Operador */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate leading-tight">{grupo.produto ?? '—'}</span>
            {grupo.lote && (
              <span className="text-xs text-muted-foreground shrink-0 truncate">· {grupo.lote}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate leading-tight">
            {grupo.operadores.join(', ')}
          </div>
        </div>

        {/* Balança (oculto no mobile) */}
        <div className="hidden sm:block text-xs text-muted-foreground text-right">
          Bal. {grupo.balanca ?? '—'}
        </div>

        {/* Real pesado */}
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums leading-tight">
            {formatKg(grupo.totalKgReal)}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">real</div>
        </div>

        {/* Produção */}
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums leading-tight">
            {formatKg(grupo.totalKgNominal)}
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">prod.</div>
        </div>

        {/* Data (oculto no mobile) */}
        <div className="hidden sm:block text-xs text-muted-foreground text-right">
          {fmtData(grupo.dataInicio)}
        </div>

        {/* Chevron */}
        <div className="flex justify-center">
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          />
        </div>
      </button>

      <div className={cn('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="border-t border-border/40 overflow-x-auto bg-muted/10">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Operador</th>
                  <th className="text-left px-3 py-2 font-medium">Início</th>
                  <th className="text-left px-3 py-2 font-medium">Fim</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Duração</th>
                  <th className="text-right px-3 py-2 font-medium">Bat.</th>
                  <th className="text-right px-3 py-2 font-medium">Real pesado</th>
                  <th className="text-right px-3 py-2 font-medium">Produção</th>
                  <th className="text-left px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {grupo.sessoes.map((s) => {
                  const { label, cls } = fmtMotivo(s.motivo_fim);
                  return (
                    <tr key={s.id} className="border-t border-black/5 dark:border-white/10">
                      <td className="px-3 py-2">{s.operador_nome ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtHora(s.inicio)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.fim ? fmtHora(s.fim) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap hidden sm:table-cell text-muted-foreground">{fmtDuracaoSessao(s.inicio, s.fim)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.bateladas ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{s.kg_pesado != null ? formatKg(s.kg_pesado) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.kg_nominal != null ? formatKg(s.kg_nominal) : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cls}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSessaoParaApagar(s.id); }}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded"
                          title="Apagar registro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <AlertDialog open={!!sessaoParaApagar} onOpenChange={(o) => { if (!o) setSessaoParaApagar(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar registro de pesagem?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso afeta os totais da OP e as análises. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={apagando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={apagando}
            className="bg-destructive hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              if (!sessaoParaApagar) return;
              setApagando(true);
              await onApagar(sessaoParaApagar);
              setApagando(false);
              setSessaoParaApagar(null);
            }}
          >
            {apagando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// ── Seção de análise ──────────────────────────────────────────────────────────

interface RowAnalise {
  label: string;
  kg: number;
  kgNominal: number;
  tempoMs: number;
  nOps: number;
  kgH: number;
}

function toRows(map: Map<string, MetricaGrupo>, labelPrefix = ''): RowAnalise[] {
  return Array.from(map.values())
    .map((g) => ({
      label: labelPrefix ? `${labelPrefix} ${g.label}` : g.label,
      kg: g.kg,
      kgNominal: g.kgNominal,
      tempoMs: g.tempoMs,
      nOps: g.ops.size,
      kgH: g.tempoMs > 0 ? g.kg / (g.tempoMs / 3600000) : 0,
    }))
    .sort((a, b) => b.kg - a.kg);
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  legend?: string;
  accent?: boolean;
}

function KpiCard({ label, value, unit, legend, accent }: KpiCardProps) {
  return (
    <div className={cn(
      'rounded-xl border bg-card p-4 flex flex-col gap-0.5 shadow-sm',
      accent && 'border-primary/40',
    )}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums leading-tight', accent && 'text-primary')}>
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
      {legend && <p className="text-[11px] text-muted-foreground mt-0.5">{legend}</p>}
    </div>
  );
}

// ── Cards por Balança ─────────────────────────────────────────────────────────

function CardsBalanca({ rows }: { rows: RowAnalise[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        Por balança
      </h3>
      <div className="flex flex-wrap gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="rounded-lg border bg-muted/20 dark:bg-muted/10 p-4 flex-1 min-w-[180px] space-y-3"
          >
            {/* Nome + ritmo chip */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-base">{r.label}</span>
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap">
                {r.kgH > 0 ? `${formatKg(r.kgH)} kg/h` : '—'}
              </span>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Real pesado</p>
                <p className="text-xl font-bold tabular-nums text-primary leading-none">{formatKg(r.kg)}</p>
                <p className="text-[10px] text-muted-foreground">kg</p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Produção</p>
                <p className="text-xl font-bold tabular-nums leading-none">{formatKg(r.kgNominal)}</p>
                <p className="text-[10px] text-muted-foreground">kg</p>
              </div>
            </div>

            {/* Tempo + OPs */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground tabular-nums">{fmtDuracao(r.tempoMs)} pesando</span>
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold">
                {r.nOps} OP{r.nOps !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Barras horizontais por Operador ───────────────────────────────────────────

function BarrasOperadores({ rows, titulo }: { rows: RowAnalise[]; titulo: string }) {
  if (rows.length === 0) return null;
  const maxKg = Math.max(...rows.map((r) => r.kg), 1);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
      {/* Cabeçalho + legenda */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {titulo}
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="inline-block w-3 h-2 rounded-sm bg-primary shrink-0" />
            real pesado
          </span>
          <span className="text-[10px] text-muted-foreground">· produção (nominal)</span>
          <span className="text-[10px] text-muted-foreground">· kg/h</span>
        </div>
      </div>

      {/* Linhas de operador */}
      <div className="space-y-4">
        {rows.map((r, i) => {
          const pct = (r.kg / maxKg) * 100;
          const showInside = pct > 28;

          return (
            <div key={r.label}>
              {/* Desktop: posição+nome | barra | kg/h */}
              <div className="hidden sm:grid sm:grid-cols-[160px_1fr_96px] items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                  <span className="text-sm font-medium truncate">{r.label}</span>
                </div>
                <div className="relative h-7">
                  <div className="absolute inset-0 bg-muted/40 rounded-full" />
                  <div
                    className="absolute left-0 top-0 h-full bg-primary rounded-full flex items-center justify-end overflow-hidden transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  >
                    {showInside && (
                      <span className="mr-2 text-[10px] font-bold text-primary-foreground tabular-nums whitespace-nowrap">
                        {formatKg(r.kg)} kg
                      </span>
                    )}
                  </div>
                  {!showInside && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums text-foreground whitespace-nowrap"
                      style={{ left: `calc(${pct}% + 6px)` }}
                    >
                      {formatKg(r.kg)} kg
                    </span>
                  )}
                </div>
                <span className="text-right text-xs tabular-nums font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  {r.kgH > 0 ? `${formatKg(r.kgH)} kg/h` : '—'}
                </span>
              </div>
              <p className="hidden sm:block text-[10px] text-muted-foreground mt-0.5 pl-[172px]">
                Produção {formatKg(r.kgNominal)} kg
              </p>

              {/* Mobile: nome+kg/h em cima, barra embaixo */}
              <div className="sm:hidden space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                    <span className="text-sm font-medium">{r.label}</span>
                  </div>
                  <span className="text-xs tabular-nums font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                    {r.kgH > 0 ? `${formatKg(r.kgH)} kg/h` : '—'}
                  </span>
                </div>
                <div className="relative h-7 w-full">
                  <div className="absolute inset-0 bg-muted/40 rounded-full" />
                  <div
                    className="absolute left-0 top-0 h-full bg-primary rounded-full flex items-center justify-end overflow-hidden transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  >
                    {showInside && (
                      <span className="mr-2 text-[10px] font-bold text-primary-foreground tabular-nums whitespace-nowrap">
                        {formatKg(r.kg)} kg
                      </span>
                    )}
                  </div>
                  {!showInside && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums text-foreground whitespace-nowrap"
                      style={{ left: `calc(${pct}% + 6px)` }}
                    >
                      {formatKg(r.kg)} kg
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">Produção {formatKg(r.kgNominal)} kg</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

type Visao = 'historico' | 'analises';

export default function HistoricoBalancas() {
  const [visao, setVisao] = useState<Visao>('historico');
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroBalanca, setFiltroBalanca] = useState('todas');
  const [filtroOperador, setFiltroOperador] = useState('todos');
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return toInputDate(d);
  });
  const [dataFim, setDataFim] = useState(() => toInputDate(new Date()));

  const fetchSessoes = useCallback(async () => {
    setLoading(true);
    const ini = dataInicio ? `${dataInicio}T00:00:00` : undefined;
    const fim  = dataFim   ? `${dataFim}T23:59:59`    : undefined;

    let query = (supabase as any)
      .from('pesagens')
      .select('id, ordem_id, operador_nome, balanca, lote, produto, inicio, fim, bateladas, kg_pesado, kg_nominal, motivo_fim')
      .order('inicio', { ascending: false });

    if (ini) query = query.gte('inicio', ini);
    if (fim) query = query.lte('inicio', fim);

    const { data } = await query;
    setSessoes(data ?? []);
    setLoading(false);
  }, [dataInicio, dataFim]);

  useEffect(() => { fetchSessoes(); }, [fetchSessoes]);

  // ── Opções dinâmicas ──
  const operadoresDistintos = useMemo(() => {
    const s = new Set<string>();
    sessoes.forEach((x) => { if (x.operador_nome) s.add(x.operador_nome); });
    return Array.from(s).sort();
  }, [sessoes]);

  const balancasDistintas = useMemo(() => {
    const s = new Set<number>();
    sessoes.forEach((x) => { if (x.balanca != null) s.add(x.balanca); });
    return Array.from(s).sort((a, b) => a - b);
  }, [sessoes]);

  // ── Filtragem ──
  const sessoesFiltradas = useMemo(() => sessoes.filter((s) => {
    if (filtroBalanca !== 'todas' && String(s.balanca) !== filtroBalanca) return false;
    if (filtroOperador !== 'todos' && s.operador_nome !== filtroOperador) return false;
    return true;
  }), [sessoes, filtroBalanca, filtroOperador]);

  // ── Agrupamento por OP (Histórico) ──
  const grupos = useMemo<GrupoOP[]>(() => {
    const map = new Map<string, GrupoOP>();
    const asc = [...sessoesFiltradas].reverse();
    asc.forEach((s) => {
      const chave = s.ordem_id ?? `sem-op-${s.lote ?? s.id}`;
      if (!map.has(chave)) {
        map.set(chave, { chave, ordem_id: s.ordem_id, produto: s.produto, lote: s.lote, balanca: s.balanca, dataInicio: s.inicio, sessoes: [], totalKgReal: 0, totalKgNominal: 0, operadores: [] });
      }
      const g = map.get(chave)!;
      g.sessoes.push(s);
      g.totalKgReal    += s.kg_pesado  ?? 0;
      g.totalKgNominal += s.kg_nominal ?? 0;
      if (s.operador_nome && !g.operadores.includes(s.operador_nome)) g.operadores.push(s.operador_nome);
    });
    const list = Array.from(map.values());
    list.forEach((g) => g.sessoes.sort((a, b) => parseUtc(a.inicio).getTime() - parseUtc(b.inicio).getTime()));
    list.sort((a, b) => parseUtc(b.dataInicio).getTime() - parseUtc(a.dataInicio).getTime());
    return list;
  }, [sessoesFiltradas]);

  const totalKgHist = useMemo(() => grupos.reduce((a, g) => a + g.totalKgReal, 0), [grupos]);

  // ── Apagar sessão ──
  const apagarSessao = useCallback(async (id: string) => {
    const { error } = await (supabase as any).from('pesagens').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao apagar registro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Registro apagado' });
    await fetchSessoes();
  }, [fetchSessoes]);

  // ── Análises ──
  const rowsBalanca = useMemo(() => {
    // Sessões fechadas, sem filtro de balança (queremos ver todas as balanças)
    const fechadas = sessoes.filter((s) => s.fim);
    const map = new Map<string, MetricaGrupo>();
    fechadas.forEach((s) => {
      const key = `Balança ${s.balanca ?? '?'}`;
      if (!map.has(key)) map.set(key, { label: key, kg: 0, kgNominal: 0, tempoMs: 0, ops: new Set() });
      const g = map.get(key)!;
      g.kg        += s.kg_pesado  ?? 0;
      g.kgNominal += s.kg_nominal ?? 0;
      g.tempoMs   += Math.max(0, parseUtc(s.fim!).getTime() - parseUtc(s.inicio).getTime());
      if (s.ordem_id) g.ops.add(s.ordem_id);
    });
    return toRows(map);
  }, [sessoes]);

  const rowsOperador = useMemo(() => {
    // Sessões fechadas, aplica filtro de balança
    const fechadas = sessoes.filter((s) => {
      if (!s.fim) return false;
      if (filtroBalanca !== 'todas' && String(s.balanca) !== filtroBalanca) return false;
      return true;
    });
    const map = new Map<string, MetricaGrupo>();
    fechadas.forEach((s) => {
      const key = s.operador_nome ?? '(sem operador)';
      if (!map.has(key)) map.set(key, { label: key, kg: 0, kgNominal: 0, tempoMs: 0, ops: new Set() });
      const g = map.get(key)!;
      g.kg        += s.kg_pesado  ?? 0;
      g.kgNominal += s.kg_nominal ?? 0;
      g.tempoMs   += Math.max(0, parseUtc(s.fim!).getTime() - parseUtc(s.inicio).getTime());
      if (s.ordem_id) g.ops.add(s.ordem_id);
    });
    return toRows(map);
  }, [sessoes, filtroBalanca]);

  const kpiAnalises = useMemo(() => {
    const fechadas = sessoes.filter((s) => s.fim);
    const totalKg      = fechadas.reduce((a, s) => a + (s.kg_pesado  ?? 0), 0);
    const totalNominal = fechadas.reduce((a, s) => a + (s.kg_nominal ?? 0), 0);
    const totalMs      = fechadas.reduce((a, s) => a + Math.max(0, parseUtc(s.fim!).getTime() - parseUtc(s.inicio).getTime()), 0);
    const ops          = new Set(fechadas.map((s) => s.ordem_id).filter(Boolean));
    const totalHoras   = totalMs / 3600000;
    const kgH          = totalHoras > 0 ? totalKg / totalHoras : 0;
    return { totalKg, totalNominal, nOps: ops.size, kgH, totalHoras };
  }, [sessoes]);

  // ── Render ──
  return (
    <div className="space-y-4 w-full pb-16">
      {/* Cabeçalho + alternador */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Histórico de Balanças</h2>
          <p className="text-sm text-muted-foreground">Sessões de pesagem registradas</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Histórico | Análises */}
          <div className="flex rounded-lg border bg-muted/30 p-0.5 gap-0.5">
            {(['historico', 'analises'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  visao === v
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v === 'historico' ? 'Histórico' : 'Análises'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchSessoes} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl border bg-muted/30 dark:bg-muted/10 px-4 py-3 flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período</span>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Select value={filtroBalanca} onValueChange={setFiltroBalanca}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Balança" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as balanças</SelectItem>
            {balancasDistintas.map((b) => (
              <SelectItem key={b} value={String(b)}>Balança {b}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro de operador só no histórico */}
        {visao === 'historico' && (
          <Select value={filtroOperador} onValueChange={setFiltroOperador}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Operador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os operadores</SelectItem>
              {operadoresDistintos.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visao === 'historico' ? (
        <>
          {grupos.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Nenhuma OP encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="max-w-5xl mx-auto rounded-xl border bg-card overflow-hidden divide-y divide-border">
              {grupos.map((g) => <CardOP key={g.chave} grupo={g} onApagar={apagarSessao} />)}
            </div>
          )}
          {grupos.length > 0 && (
            <div className="flex items-center justify-between gap-4 px-1 text-sm text-muted-foreground">
              <span>{grupos.length} OP{grupos.length !== 1 ? 's' : ''}</span>
              <span className="font-medium text-foreground">{formatKg(totalKgHist)} kg pesados (real)</span>
            </div>
          )}
        </>
      ) : (
        /* ── Visão Análises ── */
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Real pesado"
              value={formatKg(kpiAnalises.totalKg)}
              unit="kg"
              legend="soma das pesagens fechadas"
              accent
            />
            <KpiCard
              label="Produção"
              value={formatKg(kpiAnalises.totalNominal)}
              unit="kg"
              legend="soma nominal das OPs"
            />
            <KpiCard
              label="OPs pesadas"
              value={String(kpiAnalises.nOps)}
              legend="ordens distintas no período"
            />
            <KpiCard
              label="Kg/h médio"
              value={kpiAnalises.kgH > 0 ? formatKg(kpiAnalises.kgH) : '—'}
              unit={kpiAnalises.kgH > 0 ? 'kg/h' : undefined}
              legend={`${kpiAnalises.totalHoras.toFixed(1)}h pesando total`}
            />
          </div>

          <CardsBalanca rows={rowsBalanca} />
          <BarrasOperadores
            rows={rowsOperador}
            titulo={filtroBalanca !== 'todas' ? `Por operador — Balança ${filtroBalanca}` : 'Por operador'}
          />

          {rowsBalanca.length === 0 && rowsOperador.length === 0 && (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Nenhuma sessão fechada encontrada no período.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
