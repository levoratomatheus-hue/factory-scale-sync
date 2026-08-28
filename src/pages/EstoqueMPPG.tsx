import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { formatKg } from '@/lib/utils';
import {
  Loader2, Search, PackageOpen, ArrowDownToLine, ArrowUpToLine, SlidersHorizontal,
  History, Download, AlertTriangle, RefreshCw, Pencil, TrendingUp,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EstoqueItem {
  id: string;
  cod_pg: string;
  materia_prima: string;
  saldo_kg: number;
  minimo_kg: number;
  atualizado_em: string;
}

interface Movimentacao {
  id: string;
  cod_pg: string;
  materia_prima: string;
  tipo: 'entrada' | 'saida' | 'ajuste' | 'saldo_inicial' | 'estorno';
  quantidade_kg: number;
  saldo_apos: number | null;
  ordem_id: string | null;
  ordem_lote: string | null;
  observacao: string | null;
  criado_por: string | null;
  criado_em: string;
}

interface Props {
  perfilNome: string;
  papel: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function situacao(item: EstoqueItem): 'negativo' | 'abaixo' | 'ok' {
  if (item.saldo_kg < 0) return 'negativo';
  if (item.saldo_kg <= item.minimo_kg) return 'abaixo';
  return 'ok';
}

function SituacaoBadge({ item }: { item: EstoqueItem }) {
  const s = situacao(item);
  if (s === 'negativo')
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
        Negativo
      </span>
    );
  if (s === 'abaixo')
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        Abaixo do mínimo
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
      OK
    </span>
  );
}

function tipoBadge(tipo: Movimentacao['tipo']) {
  const map: Record<Movimentacao['tipo'], { label: string; cls: string }> = {
    entrada:       { label: 'Entrada',       cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    saida:         { label: 'Saída',          cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    estorno:       { label: 'Estorno',        cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
    ajuste:        { label: 'Ajuste',         cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    saldo_inicial: { label: 'Saldo inicial',  cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300' },
  };
  const { label, cls } = map[tipo] ?? { label: tipo, cls: '' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function parseUtc(iso: string): Date {
  return new Date(/[Z+]/.test(iso) ? iso : iso + 'Z');
}

function fmtDatetime(iso: string) {
  return parseUtc(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// ── Paginação ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function PaginacaoBar({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-2 px-1 text-xs text-muted-foreground">
      <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
      <div className="flex gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 0}
          className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors">‹ Ant.</button>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-muted transition-colors">Próx. ›</button>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EstoqueMPPG({ perfilNome }: Props) {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBelowMin, setFilterBelowMin] = useState(false);

  // Modais
  const [entradaItem, setEntradaItem] = useState<EstoqueItem | null>(null);
  const [saidaItem, setSaidaItem] = useState<EstoqueItem | null>(null);
  const [ajusteItem, setAjusteItem] = useState<EstoqueItem | null>(null);
  const [minimoItem, setMinimoItem] = useState<EstoqueItem | null>(null);
  const [historicoItem, setHistoricoItem] = useState<EstoqueItem | null>(null);

  // Forms
  const [entradaQty, setEntradaQty] = useState('');
  const [entradaObs, setEntradaObs] = useState('');
  const [saidaQty, setSaidaQty] = useState('');
  const [saidaObs, setSaidaObs] = useState('');
  const [ajusteNovoSaldo, setAjusteNovoSaldo] = useState('');
  const [ajusteObs, setAjusteObs] = useState('');
  const [minimoValue, setMinimoValue] = useState('');

  // Saving flags
  const [savingEntrada, setSavingEntrada] = useState(false);
  const [savingSaida, setSavingSaida] = useState(false);
  const [savingAjuste, setSavingAjuste] = useState(false);
  const [savingMinimo, setSavingMinimo] = useState(false);

  // Histórico
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Paginação
  const [page, setPage] = useState(0);

  // Atualizar Mínimo
  const [atualizarMinimoOpen, setAtualizarMinimoOpen] = useState(false);
  const [atualizandoMinimo, setAtualizandoMinimo] = useState(false);

  const handleAtualizarMinimo = async () => {
    setAtualizandoMinimo(true);
    try {
      const hoje = new Date();
      const dozeMesesAtras = new Date(hoje);
      dozeMesesAtras.setMonth(hoje.getMonth() - 12);
      const piso = new Date('2026-05-01T00:00:00');
      const inicio = dozeMesesAtras > piso ? dozeMesesAtras : piso;
      const dataInicio = inicio.toISOString().split('T')[0];
      const dataFim = hoje.toISOString().split('T')[0];

      const { fetchAllFormulas } = await import('@/lib/formulasCache');
      function diaSeguinte(d: string) {
        const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + 1);
        return dt.toISOString().split('T')[0];
      }
      const { data: ordensData } = await (supabase as any)
        .from('ordens')
        .select('id, lote, produto, quantidade, formula_id, marca, linha, criado_em')
        .gte('criado_em', dataInicio)
        .lt('criado_em', diaSeguinte(dataFim))
        .limit(2000);

      if (!ordensData) { toast({ title: 'Erro ao buscar OPs', variant: 'destructive' }); return; }

      const fRows = await fetchAllFormulas();
      // PG: usa cod_pg — as fórmulas guardam cod_mp (campo genérico); para PG casamos
      // pelo mesmo campo cod_mp pois os códigos PG são distintos dos ZC.
      const fIndex = new Map<string, Array<{ cod_mp: string | null; fracao: number }>>();
      for (const r of fRows) {
        const key = String(r.formula_id);
        if (!fIndex.has(key)) fIndex.set(key, []);
        fIndex.get(key)!.push({ cod_mp: r.cod_mp ?? null, fracao: (r.percentual ?? 0) / 100 });
      }

      const totalPorCod = new Map<string, number>();
      const opsPorMes: Record<string, number> = {};
      for (const op of ordensData as any[]) {
        const mes = (op.criado_em ?? '').slice(0, 7);
        if (mes.length === 7) opsPorMes[mes] = (opsPorMes[mes] ?? 0) + 1;
        if (!op.formula_id) continue;
        const items = fIndex.get(String(op.formula_id));
        if (!items) continue;
        for (const it of items) {
          if (!it.cod_mp) continue;
          totalPorCod.set(it.cod_mp, (totalPorCod.get(it.cod_mp) ?? 0) + it.fracao * (op.quantidade ?? 0));
        }
      }
      const numMeses = Object.keys(opsPorMes).length || 1;

      const updates = estoque.map((item) => {
        const total = totalPorCod.get(item.cod_pg) ?? 0;
        const media = total / numMeses;
        return { cod_pg: item.cod_pg, minimo_kg: parseFloat((media * 1.5).toFixed(3)) };
      });

      // Aplica em lote — 1 upsert no lugar de N updates
      await (supabase as any)
        .from('estoque_mp_pg')
        .upsert(updates, { onConflict: 'cod_pg' });

      toast({ title: `${updates.length} mínimos atualizados` });
      fetchEstoque();
    } finally {
      setAtualizandoMinimo(false);
      setAtualizarMinimoOpen(false);
    }
  };

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('estoque_mp_pg')
      .select('id, cod_pg, materia_prima, saldo_kg, minimo_kg, atualizado_em')
      .order('materia_prima')
      .limit(2000);

    if (error) {
      toast({ title: 'Erro ao carregar estoque PG', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setEstoque((data ?? []) as EstoqueItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = estoque;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.materia_prima.toLowerCase().includes(q) ||
          e.cod_pg.toLowerCase().includes(q),
      );
    }
    if (filterBelowMin) {
      list = list.filter((e) => situacao(e) !== 'ok');
    }
    return list;
  }, [estoque, search, filterBelowMin]);

  useEffect(() => { setPage(0); }, [search, filterBelowMin]);
  const pagina = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  // ── Summary ─────────────────────────────────────────────────────────────────

  const { totalMPs, totalAbaixo, totalNegativo, saldoTotal } = useMemo(() => ({
    totalMPs:      estoque.length,
    totalAbaixo:   estoque.filter((e) => situacao(e) === 'abaixo').length,
    totalNegativo: estoque.filter((e) => situacao(e) === 'negativo').length,
    saldoTotal:    estoque.reduce((s, e) => s + e.saldo_kg, 0),
  }), [estoque]);

  // ── Entrada ─────────────────────────────────────────────────────────────────

  const handleEntrada = async () => {
    if (!entradaItem) return;
    const qty = parseFloat(entradaQty.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      toast({ title: 'Informe uma quantidade válida', variant: 'destructive' }); return;
    }
    setSavingEntrada(true);

    const novoSaldo = entradaItem.saldo_kg + qty;

    const { error } = await (supabase as any)
      .from('estoque_mp_pg')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('id', entradaItem.id);

    if (error) {
      toast({ title: 'Erro ao registrar entrada', description: error.message, variant: 'destructive' });
      setSavingEntrada(false); return;
    }

    await (supabase as any).from('estoque_movimentacoes_pg').insert({
      cod_pg: entradaItem.cod_pg,
      materia_prima: entradaItem.materia_prima,
      tipo: 'entrada',
      quantidade_kg: qty,
      saldo_apos: novoSaldo,
      observacao: entradaObs.trim() || null,
      criado_por: perfilNome,
    });

    toast({ title: `Entrada registrada: +${formatKg(qty)} kg` });
    setSavingEntrada(false);
    setEntradaItem(null);
    setEntradaQty(''); setEntradaObs('');
    fetchEstoque();
  };

  // ── Saída ───────────────────────────────────────────────────────────────────

  const handleSaida = async () => {
    if (!saidaItem) return;
    const qty = parseFloat(saidaQty.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      toast({ title: 'Informe uma quantidade válida', variant: 'destructive' }); return;
    }
    setSavingSaida(true);

    const novoSaldo = saidaItem.saldo_kg - qty;

    const { error } = await (supabase as any)
      .from('estoque_mp_pg')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('id', saidaItem.id);

    if (error) {
      toast({ title: 'Erro ao registrar saída', description: error.message, variant: 'destructive' });
      setSavingSaida(false); return;
    }

    await (supabase as any).from('estoque_movimentacoes_pg').insert({
      cod_pg: saidaItem.cod_pg,
      materia_prima: saidaItem.materia_prima,
      tipo: 'saida',
      quantidade_kg: -qty,
      saldo_apos: novoSaldo,
      observacao: saidaObs.trim() || null,
      criado_por: perfilNome,
    });

    toast({ title: `Saída registrada: -${formatKg(qty)} kg` });
    setSavingSaida(false);
    setSaidaItem(null);
    setSaidaQty(''); setSaidaObs('');
    fetchEstoque();
  };

  // ── Ajuste ──────────────────────────────────────────────────────────────────

  const handleAjuste = async () => {
    if (!ajusteItem) return;
    const novoSaldo = parseFloat(ajusteNovoSaldo.replace(',', '.'));
    if (isNaN(novoSaldo)) {
      toast({ title: 'Informe o novo saldo', variant: 'destructive' }); return;
    }
    if (!ajusteObs.trim()) {
      toast({ title: 'Observação obrigatória para ajuste', variant: 'destructive' }); return;
    }
    setSavingAjuste(true);

    const diferenca = novoSaldo - ajusteItem.saldo_kg;

    const { error } = await (supabase as any)
      .from('estoque_mp_pg')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('id', ajusteItem.id);

    if (error) {
      toast({ title: 'Erro ao ajustar saldo', description: error.message, variant: 'destructive' });
      setSavingAjuste(false); return;
    }

    await (supabase as any).from('estoque_movimentacoes_pg').insert({
      cod_pg: ajusteItem.cod_pg,
      materia_prima: ajusteItem.materia_prima,
      tipo: 'ajuste',
      quantidade_kg: diferenca,
      saldo_apos: novoSaldo,
      observacao: ajusteObs.trim(),
      criado_por: perfilNome,
    });

    toast({ title: 'Saldo ajustado com sucesso' });
    setSavingAjuste(false);
    setAjusteItem(null);
    setAjusteNovoSaldo(''); setAjusteObs('');
    fetchEstoque();
  };

  // ── Mínimo ──────────────────────────────────────────────────────────────────

  const handleMinimo = async () => {
    if (!minimoItem) return;
    const min = parseFloat(minimoValue.replace(',', '.'));
    if (isNaN(min) || min < 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' }); return;
    }
    setSavingMinimo(true);

    const { error } = await (supabase as any)
      .from('estoque_mp_pg')
      .update({ minimo_kg: min })
      .eq('id', minimoItem.id);

    if (error) {
      toast({ title: 'Erro ao salvar mínimo', description: error.message, variant: 'destructive' });
      setSavingMinimo(false); return;
    }

    toast({ title: 'Estoque mínimo atualizado' });
    setSavingMinimo(false);
    setMinimoItem(null);
    setMinimoValue('');
    fetchEstoque();
  };

  // ── Histórico ────────────────────────────────────────────────────────────────

  const abrirHistorico = useCallback(async (item: EstoqueItem) => {
    setHistoricoItem(item);
    setLoadingHistorico(true);

    const codPg = String(item.cod_pg);

    const [resPg, resGeral] = await Promise.all([
      (supabase as any)
        .from('estoque_movimentacoes_pg')
        .select('*')
        .eq('cod_pg', codPg)
        .order('criado_em', { ascending: false })
        .limit(200),
      (supabase as any)
        .from('estoque_movimentacoes')
        .select('id, cod_tid, materia_prima, tipo, quantidade_kg, saldo_apos, ordem_id, ordem_lote, observacao, criado_por, criado_em')
        .eq('cod_tid', codPg)
        .order('criado_em', { ascending: false })
        .limit(200),
    ]);

    const fromPg: Movimentacao[] = (resPg.data ?? []).map((r: any) => ({
      ...r,
      ordem_id: null,
      ordem_lote: null,
    }));

    const fromGeral: Movimentacao[] = (resGeral.data ?? []).map((r: any) => ({
      id: r.id,
      cod_pg: r.cod_tid,
      materia_prima: r.materia_prima,
      tipo: r.tipo,
      quantidade_kg: r.quantidade_kg,
      saldo_apos: r.saldo_apos ?? null,
      ordem_id: r.ordem_id ?? null,
      ordem_lote: r.ordem_lote ?? null,
      observacao: r.observacao ?? null,
      criado_por: r.criado_por ?? null,
      criado_em: r.criado_em,
    }));

    const merged = [...fromPg, ...fromGeral].sort(
      (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
    );

    setHistorico(merged);
    setLoadingHistorico(false);
  }, []);

  // ── Exportar ─────────────────────────────────────────────────────────────────

  const handleExportar = () => {
    const rows = estoque.map((e) => ({
      'Matéria-Prima': e.materia_prima,
      'Cód. PG': e.cod_pg,
      'Saldo (kg)': e.saldo_kg,
      'Mínimo (kg)': e.minimo_kg,
      'Situação': situacao(e) === 'negativo' ? 'Negativo' : situacao(e) === 'abaixo' ? 'Abaixo do mínimo' : 'OK',
      'Atualizado em': fmtDatetime(e.atualizado_em),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque MP PG');
    XLSX.writeFile(wb, `estoque_mp_pg_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Estoque de MP — PG</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Unidade Pigma · tabelas independentes do ZC</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchEstoque()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportar} disabled={estoque.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAtualizarMinimoOpen(true)}
            disabled={atualizandoMinimo || estoque.length === 0}
          >
            {atualizandoMinimo
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <TrendingUp className="h-3.5 w-3.5 mr-1.5" />}
            Atualizar Mínimo
          </Button>
        </div>
      </div>

      <AlertDialog open={atualizarMinimoOpen} onOpenChange={setAtualizarMinimoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar estoque mínimo?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai recalcular o estoque mínimo de todas as matérias-primas com base no
              consumo médio mensal (× 1,5) desde 01/05/2026. Matérias-primas sem consumo no
              período terão o mínimo zerado. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={atualizandoMinimo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAtualizarMinimo} disabled={atualizandoMinimo}>
              {atualizandoMinimo && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total de MPs</p>
          <p className="text-2xl font-bold mt-0.5">{totalMPs}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Saldo total</p>
          <p className="text-2xl font-bold mt-0.5">{formatKg(saldoTotal)} kg</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${totalAbaixo > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800' : 'bg-card'}`}>
          <p className="text-xs text-muted-foreground">Abaixo do mínimo</p>
          <p className={`text-2xl font-bold mt-0.5 ${totalAbaixo > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>{totalAbaixo}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${totalNegativo > 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800' : 'bg-card'}`}>
          <p className="text-xs text-muted-foreground">Saldo negativo</p>
          <p className={`text-2xl font-bold mt-0.5 ${totalNegativo > 0 ? 'text-red-700 dark:text-red-400' : ''}`}>{totalNegativo}</p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por nome ou código PG..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button
          variant={filterBelowMin ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterBelowMin((v) => !v)}
          className="h-8 text-xs"
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Só abaixo do mínimo
        </Button>
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : estoque.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <PackageOpen className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma matéria-prima cadastrada no estoque PG.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Matéria-Prima</th>
                <th className="text-left px-3 py-2 font-medium w-28">Cód. PG</th>
                <th className="text-right px-3 py-2 font-medium w-28">Saldo (kg)</th>
                <th className="text-right px-3 py-2 font-medium w-28">Mínimo (kg)</th>
                <th className="text-center px-3 py-2 font-medium w-32">Situação</th>
                <th className="text-center px-3 py-2 font-medium w-44">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pagina.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum resultado encontrado.
                  </td>
                </tr>
              ) : (
                pagina.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{item.materia_prima}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{item.cod_pg}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${item.saldo_kg < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {formatKg(item.saldo_kg)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatKg(item.minimo_kg)}</td>
                    <td className="px-3 py-2 text-center">
                      <SituacaoBadge item={item} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => { setEntradaItem(item); setEntradaQty(''); setEntradaObs(''); }}
                          title="Entrada de material"
                        >
                          <ArrowDownToLine className="h-3 w-3 mr-1" />
                          Entrada
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/30"
                          onClick={() => { setSaidaItem(item); setSaidaQty(''); setSaidaObs(''); }}
                          title="Saída manual de material"
                        >
                          <ArrowUpToLine className="h-3 w-3 mr-1" />
                          Saída
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => { setAjusteItem(item); setAjusteNovoSaldo(String(item.saldo_kg)); setAjusteObs(''); }}
                          title="Ajuste de saldo"
                        >
                          <SlidersHorizontal className="h-3 w-3 mr-1" />
                          Ajuste
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => { setMinimoItem(item); setMinimoValue(String(item.minimo_kg)); }}
                          title="Editar mínimo"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => abrirHistorico(item)}
                          title="Histórico"
                        >
                          <History className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <PaginacaoBar page={page} total={filtered.length} onChange={setPage} />

      {/* ── Modal Entrada ── */}
      <Dialog open={!!entradaItem} onOpenChange={(open) => !open && setEntradaItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entrada de Material — PG</DialogTitle>
          </DialogHeader>
          {entradaItem && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{entradaItem.materia_prima}</p>
                <p className="text-xs text-muted-foreground">
                  Cód. PG: <span className="font-mono">{entradaItem.cod_pg}</span> · Saldo atual:{' '}
                  <span className="font-medium text-foreground">{formatKg(entradaItem.saldo_kg)} kg</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Quantidade (kg)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={entradaQty}
                  onChange={(e) => setEntradaQty(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 h-8 text-sm"
                  placeholder="0,000"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium">Observação (NF, fornecedor...)</label>
                <Input
                  value={entradaObs}
                  onChange={(e) => setEntradaObs(e.target.value)}
                  className="mt-1 h-8 text-sm"
                  placeholder="Ex.: NF 12345, Fornecedor ABC"
                />
              </div>
              {entradaQty && !isNaN(parseFloat(entradaQty)) && (
                <p className="text-xs text-muted-foreground">
                  Novo saldo:{' '}
                  <span className="font-semibold text-foreground">
                    {formatKg(entradaItem.saldo_kg + parseFloat(entradaQty.replace(',', '.')))} kg
                  </span>
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntradaItem(null)}>Cancelar</Button>
            <Button onClick={handleEntrada} disabled={savingEntrada}>
              {savingEntrada && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Registrar Entrada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Saída ── */}
      <Dialog open={!!saidaItem} onOpenChange={(open) => !open && setSaidaItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar saída — {saidaItem?.materia_prima}</DialogTitle>
          </DialogHeader>
          {saidaItem && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{saidaItem.materia_prima}</p>
                <p className="text-xs text-muted-foreground">
                  Cód. PG: <span className="font-mono">{saidaItem.cod_pg}</span> · Saldo atual:{' '}
                  <span className="font-medium text-foreground">{formatKg(saidaItem.saldo_kg)} kg</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Quantidade a retirar (kg)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  value={saidaQty}
                  onChange={(e) => setSaidaQty(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 h-8 text-sm"
                  placeholder="0,000"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium">Observação</label>
                <Input
                  value={saidaObs}
                  onChange={(e) => setSaidaObs(e.target.value)}
                  className="mt-1 h-8 text-sm"
                  placeholder="Motivo da saída (opcional)"
                />
              </div>
              {saidaQty && !isNaN(parseFloat(saidaQty)) && (() => {
                const novoSaldo = saidaItem.saldo_kg - parseFloat(saidaQty.replace(',', '.'));
                return (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Novo saldo:{' '}
                      <span className={`font-semibold ${novoSaldo < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                        {formatKg(novoSaldo)} kg
                      </span>
                    </p>
                    {novoSaldo < 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">⚠ Saldo ficará negativo.</p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaidaItem(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleSaida}
              disabled={savingSaida}
            >
              {savingSaida && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar Saída
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Ajuste ── */}
      <Dialog open={!!ajusteItem} onOpenChange={(open) => !open && setAjusteItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste de Saldo — PG</DialogTitle>
          </DialogHeader>
          {ajusteItem && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{ajusteItem.materia_prima}</p>
                <p className="text-xs text-muted-foreground">
                  Saldo atual: <span className="font-medium text-foreground">{formatKg(ajusteItem.saldo_kg)} kg</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Novo saldo (kg)</label>
                <Input
                  type="number"
                  step="0.001"
                  value={ajusteNovoSaldo}
                  onChange={(e) => setAjusteNovoSaldo(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 h-8 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium">Observação <span className="text-destructive">*</span></label>
                <Input
                  value={ajusteObs}
                  onChange={(e) => setAjusteObs(e.target.value)}
                  className="mt-1 h-8 text-sm"
                  placeholder="Motivo do ajuste (inventário, correção...)"
                />
              </div>
              {ajusteNovoSaldo !== '' && !isNaN(parseFloat(ajusteNovoSaldo)) && (
                <p className="text-xs text-muted-foreground">
                  Diferença:{' '}
                  <span className={`font-semibold ${parseFloat(ajusteNovoSaldo) - ajusteItem.saldo_kg >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {parseFloat(ajusteNovoSaldo) - ajusteItem.saldo_kg >= 0 ? '+' : ''}
                    {formatKg(parseFloat(ajusteNovoSaldo) - ajusteItem.saldo_kg)} kg
                  </span>
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteItem(null)}>Cancelar</Button>
            <Button onClick={handleAjuste} disabled={savingAjuste}>
              {savingAjuste && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Mínimo ── */}
      <Dialog open={!!minimoItem} onOpenChange={(open) => !open && setMinimoItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Estoque Mínimo — PG</DialogTitle>
          </DialogHeader>
          {minimoItem && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{minimoItem.materia_prima}</p>
              <div>
                <label className="text-xs font-medium">Mínimo (kg)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={minimoValue}
                  onChange={(e) => setMinimoValue(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 h-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMinimoItem(null)}>Cancelar</Button>
            <Button onClick={handleMinimo} disabled={savingMinimo}>
              {savingMinimo && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Histórico ── */}
      <Dialog open={!!historicoItem} onOpenChange={(open) => !open && setHistoricoItem(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico — {historicoItem?.materia_prima}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingHistorico ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : historico.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma movimentação registrada.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Data</th>
                    <th className="text-left px-3 py-2 font-medium">Tipo</th>
                    <th className="text-right px-3 py-2 font-medium">Qtd (kg)</th>
                    <th className="text-right px-3 py-2 font-medium">Saldo após</th>
                    <th className="text-left px-3 py-2 font-medium">OP / Lote</th>
                    <th className="text-left px-3 py-2 font-medium">Observação</th>
                    <th className="text-left px-3 py-2 font-medium">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((mov) => (
                    <tr key={mov.id} className="border-t">
                      <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{fmtDatetime(mov.criado_em)}</td>
                      <td className="px-3 py-1.5">{tipoBadge(mov.tipo)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${mov.quantidade_kg >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {mov.quantidade_kg >= 0 ? '+' : ''}{formatKg(mov.quantidade_kg)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {mov.saldo_apos !== null ? formatKg(mov.saldo_apos) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap font-mono text-[10px]">
                        {mov.ordem_id
                          ? <span title={mov.ordem_id}>{mov.ordem_lote ?? mov.ordem_id}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={mov.observacao ?? ''}>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
