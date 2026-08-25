import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatKg } from '@/lib/utils';
import { Loader2, Search, RefreshCw, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Movimentacao {
  id: string;
  cod_tid: string;
  materia_prima: string;
  tipo: 'entrada' | 'saida' | 'estorno' | 'ajuste' | 'saldo_inicial';
  quantidade_kg: number;
  saldo_apos: number | null;
  ordem_id: string | null;
  ordem_lote: string | null;
  observacao: string | null;
  criado_por: string | null;
  criado_em: string;
}

type FiltroTipo = 'todos' | 'saida_op' | 'saida_manual' | 'entrada' | 'estorno' | 'ajuste' | 'saldo_inicial';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Classifica a movimentação em categoria para filtro e badge */
function categoria(mov: Movimentacao): FiltroTipo {
  if (mov.tipo === 'saida') return mov.ordem_id ? 'saida_op' : 'saida_manual';
  return mov.tipo as FiltroTipo;
}

interface BadgeProps { mov: Movimentacao }
function TipoBadge({ mov }: BadgeProps) {
  const cat = categoria(mov);
  const map: Record<FiltroTipo, { label: string; cls: string }> = {
    saida_op:     { label: 'Saída (OP)',      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    saida_manual: { label: 'Saída (Manual)',  cls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400' },
    entrada:      { label: 'Entrada',         cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    estorno:      { label: 'Estorno',         cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    ajuste:       { label: 'Ajuste',          cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    saldo_inicial:{ label: 'Saldo inicial',   cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300' },
    todos:        { label: '',                cls: '' },
  };
  const { label, cls } = map[cat];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

const TIPO_OPTIONS: { value: FiltroTipo; label: string }[] = [
  { value: 'todos',         label: 'Todos os tipos' },
  { value: 'saida_op',      label: 'Saída (OP)' },
  { value: 'saida_manual',  label: 'Saída (Manual)' },
  { value: 'entrada',       label: 'Entrada' },
  { value: 'estorno',       label: 'Estorno' },
  { value: 'ajuste',        label: 'Ajuste' },
  { value: 'saldo_inicial', label: 'Saldo inicial' },
];

const PAGE_SIZE = 100;

export default function HistoricoMovimentacoesMP() {
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [dataFim, setDataFim] = useState(() => toInputDate(new Date()));

  // Paginação server-side
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Debounce da busca: 300ms após o usuário parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Quando filtros mudam (exceto page), volta para página 0
  useEffect(() => { setPage(0); }, [dataInicio, dataFim, filtroTipo, debouncedSearch]);

  const fetchMovs = useCallback(async (targetPage: number) => {
    setLoading(true);

    const inicio = dataInicio ? `${dataInicio}T00:00:00` : undefined;
    const fim    = dataFim    ? `${dataFim}T23:59:59`    : undefined;

    let query = (supabase as any)
      .from('estoque_movimentacoes')
      .select('*', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(targetPage * PAGE_SIZE, (targetPage + 1) * PAGE_SIZE - 1);

    // Filtro por tipo: saida_op e saida_manual usam ordem_id IS / IS NOT NULL
    if (filtroTipo === 'saida_op') {
      query = query.eq('tipo', 'saida').not('ordem_id', 'is', null);
    } else if (filtroTipo === 'saida_manual') {
      query = query.eq('tipo', 'saida').is('ordem_id', null);
    } else if (filtroTipo !== 'todos') {
      query = query.eq('tipo', filtroTipo);
    }

    if (inicio) query = query.gte('criado_em', inicio);
    if (fim)    query = query.lte('criado_em', fim);

    const q = debouncedSearch.trim();
    if (q) {
      query = query.or(
        `materia_prima.ilike.%${q}%,cod_tid.ilike.%${q}%,ordem_lote.ilike.%${q}%,observacao.ilike.%${q}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      toast({ title: 'Erro ao carregar histórico', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setMovs((data ?? []) as Movimentacao[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [dataInicio, dataFim, filtroTipo, debouncedSearch]);

  // Rebusca sempre que filtros ou página mudarem
  useEffect(() => { fetchMovs(page); }, [fetchMovs, page]);

  const clearSearch = () => setSearch('');

  return (
    <div className="p-4 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Histórico Geral de Movimentações — MP ZC</h2>
          <p className="text-xs text-muted-foreground">
            {loading ? 'Carregando...' : `${totalCount} registro${totalCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchMovs(page)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* Busca */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar MP, código, lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-8 h-8 text-sm"
          />
          {search && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Tipo */}
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TIPO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Data início */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">De</span>
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Até</span>
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>
      </div>

      {/* Legenda de cores */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 font-semibold">● Saída (OP)</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 px-2 py-0.5 font-semibold">● Saída (Manual)</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 font-semibold">● Entrada</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 font-semibold">● Estorno</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-0.5 font-semibold">● Ajuste</span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : movs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-16">Nenhuma movimentação encontrada.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Matéria-Prima</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Cód. TID</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Qtd (kg)</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Saldo após</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">OP / Lote</th>
                <th className="text-left px-3 py-2 font-medium">Observação</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Por</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((mov) => (
                <tr key={mov.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{fmtDatetime(mov.criado_em)}</td>
                  <td className="px-3 py-1.5"><TipoBadge mov={mov} /></td>
                  <td className="px-3 py-1.5 font-medium max-w-[200px] truncate" title={mov.materia_prima}>{mov.materia_prima}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{mov.cod_tid}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${mov.quantidade_kg >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {mov.quantidade_kg >= 0 ? '+' : ''}{formatKg(mov.quantidade_kg)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {mov.saldo_apos !== null ? formatKg(mov.saldo_apos) : '—'}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                    {mov.ordem_lote ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground max-w-[220px] truncate" title={mov.observacao ?? ''}>
                    {mov.observacao ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                    {mov.criado_por ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Exibindo {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} de {totalCount}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>
              ← Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1 || loading} onClick={() => setPage((p) => p + 1)}>
              Próxima →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
