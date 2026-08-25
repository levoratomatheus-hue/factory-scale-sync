import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { formatKg } from '@/lib/utils';
import {
  Loader2, Search, PackageOpen, ArrowDownToLine, SlidersHorizontal,
  History, FileUp, Download, AlertTriangle, RefreshCw, Pencil,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EstoqueItem {
  id: string;
  cod_tid: string;
  materia_prima: string;
  saldo_kg: number;
  minimo_kg: number;
  atualizado_em: string;
}

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

function tipoBadge(mov: Movimentacao) {
  const isManual = mov.tipo === 'saida' && !mov.ordem_id;
  const map: Record<string, { label: string; cls: string }> = {
    entrada:       { label: 'Entrada',         cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
    saida_op:      { label: 'Saída (OP)',       cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    saida_manual:  { label: 'Saída (Manual)',   cls: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400' },
    estorno:       { label: 'Estorno',          cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    ajuste:        { label: 'Ajuste',           cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    saldo_inicial: { label: 'Saldo inicial',    cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300' },
  };
  const key = mov.tipo === 'saida' ? (isManual ? 'saida_manual' : 'saida_op') : mov.tipo;
  const { label, cls } = map[key] ?? { label: mov.tipo, cls: '' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function fmtDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function EstoqueMP({ perfilNome, papel }: Props) {
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBelowMin, setFilterBelowMin] = useState(false);

  // Modais
  const [entradaItem, setEntradaItem] = useState<EstoqueItem | null>(null);
  const [ajusteItem, setAjusteItem] = useState<EstoqueItem | null>(null);
  const [minimoItem, setMinimoItem] = useState<EstoqueItem | null>(null);
  const [historicoItem, setHistoricoItem] = useState<EstoqueItem | null>(null);
  const [importarOpen, setImportarOpen] = useState(false);

  // Forms
  const [entradaQty, setEntradaQty] = useState('');
  const [entradaObs, setEntradaObs] = useState('');
  const [ajusteNovoSaldo, setAjusteNovoSaldo] = useState('');
  const [ajusteObs, setAjusteObs] = useState('');
  const [minimoValue, setMinimoValue] = useState('');

  // Saving flags
  const [savingEntrada, setSavingEntrada] = useState(false);
  const [savingAjuste, setSavingAjuste] = useState(false);
  const [savingMinimo, setSavingMinimo] = useState(false);

  // Histórico
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Import
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importando, setImportando] = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    const { data: estoqueData, error } = await (supabase as any)
      .from('estoque_mp')
      .select('*')
      .order('materia_prima');

    if (error) {
      toast({ title: 'Erro ao carregar estoque', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    if (!estoqueData || estoqueData.length === 0) {
      setEstoque([]);
      setLoading(false);
      return;
    }

    setEstoque((estoqueData ?? []) as EstoqueItem[]);
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
          e.cod_tid.toLowerCase().includes(q),
      );
    }
    if (filterBelowMin) {
      list = list.filter((e) => situacao(e) !== 'ok');
    }
    return list;
  }, [estoque, search, filterBelowMin]);

  // ── Summary ─────────────────────────────────────────────────────────────────

  const { totalMPs, totalAbaixo, totalNegativo } = useMemo(() => ({
    totalMPs:     estoque.length,
    totalAbaixo:  estoque.filter((e) => situacao(e) === 'abaixo').length,
    totalNegativo: estoque.filter((e) => situacao(e) === 'negativo').length,
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
      .from('estoque_mp')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('id', entradaItem.id);

    if (error) {
      toast({ title: 'Erro ao registrar entrada', description: error.message, variant: 'destructive' });
      setSavingEntrada(false); return;
    }

    await (supabase as any).from('estoque_movimentacoes').insert({
      cod_tid: entradaItem.cod_tid,
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
      .from('estoque_mp')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('id', ajusteItem.id);

    if (error) {
      toast({ title: 'Erro ao ajustar saldo', description: error.message, variant: 'destructive' });
      setSavingAjuste(false); return;
    }

    await (supabase as any).from('estoque_movimentacoes').insert({
      cod_tid: ajusteItem.cod_tid,
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
      .from('estoque_mp')
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
    setHistorico([]);
    setLoadingHistorico(true);
    const { data, error } = await (supabase as any)
      .from('estoque_movimentacoes')
      .select('*')
      .eq('cod_tid', item.cod_tid)
      .order('criado_em', { ascending: false })
      .limit(200);
    if (error) {
      toast({ title: 'Erro ao carregar histórico', description: error.message, variant: 'destructive' });
    }
    setHistorico((data ?? []) as Movimentacao[]);
    setLoadingHistorico(false);
  }, []);

  // ── Importar ─────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFile(file);
    setImportPreview([]);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // Remove cabeçalho (primeira linha)
        const preview = rows.slice(1).filter((r: any[]) => r[0]).map((r: any[]) => ({
          cod_tid: String(r[0] ?? '').trim(),
          materia_prima: String(r[1] ?? '').trim(),
          saldo_kg: parseFloat(String(r[2] ?? '0').replace(',', '.')) || 0,
          minimo_kg: parseFloat(String(r[3] ?? '0').replace(',', '.')) || 0,
        }));
        setImportPreview(preview);
      } catch {
        toast({ title: 'Erro ao ler planilha', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportar = async () => {
    if (importPreview.length === 0) return;
    setImportando(true);

    let ok = 0;
    for (const row of importPreview) {
      if (!row.cod_tid) continue;

      // Upsert estoque_mp
      await (supabase as any).from('estoque_mp').upsert(
        {
          cod_tid: row.cod_tid,
          materia_prima: row.materia_prima || row.cod_tid,
          saldo_kg: row.saldo_kg,
          minimo_kg: row.minimo_kg,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'cod_tid' },
      );

      // Movimentação saldo_inicial
      await (supabase as any).from('estoque_movimentacoes').insert({
        cod_tid: row.cod_tid,
        materia_prima: row.materia_prima || row.cod_tid,
        tipo: 'saldo_inicial',
        quantidade_kg: row.saldo_kg,
        saldo_apos: row.saldo_kg,
        observacao: 'Importação de saldo inicial',
        criado_por: perfilNome,
      });

      ok++;
    }

    toast({ title: `${ok} MP(s) importada(s) com sucesso` });
    setImportando(false);
    setImportarOpen(false);
    setImportFile(null);
    setImportPreview([]);
    fetchEstoque();
  };

  // ── Exportar ─────────────────────────────────────────────────────────────────

  const handleExportar = () => {
    const rows = estoque.map((e) => ({
      'Matéria-Prima': e.materia_prima,
      'Cód. TID': e.cod_tid,
      'Saldo (kg)': e.saldo_kg,
      'Mínimo (kg)': e.minimo_kg,
      'Situação': situacao(e) === 'negativo' ? 'Negativo' : situacao(e) === 'abaixo' ? 'Abaixo do mínimo' : 'OK',
      'Atualizado em': fmtDatetime(e.atualizado_em),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque MP');
    XLSX.writeFile(wb, `estoque_mp_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Estoque MP ZC</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchEstoque()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportarOpen(true)}>
            <FileUp className="h-3.5 w-3.5 mr-1.5" />
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportar} disabled={estoque.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Exportar
          </Button>
        </div>
      </div>

      {/* ── Resumo ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Total de MPs</p>
          <p className="text-2xl font-bold mt-0.5">{totalMPs}</p>
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
            placeholder="Buscar por nome ou código..."
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
          <p className="text-sm">Nenhuma matéria-prima cadastrada no estoque.</p>
          <p className="text-xs">Importe os saldos iniciais pela planilha.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Matéria-Prima</th>
                <th className="text-left px-3 py-2 font-medium w-24">Cód. TID</th>
                <th className="text-right px-3 py-2 font-medium w-28">Saldo (kg)</th>
                <th className="text-right px-3 py-2 font-medium w-28">Mínimo (kg)</th>
                <th className="text-center px-3 py-2 font-medium w-32">Situação</th>
                <th className="text-center px-3 py-2 font-medium w-44">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum resultado encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-medium">{item.materia_prima}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{item.cod_tid}</td>
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

      {/* ── Modal Entrada ── */}
      <Dialog open={!!entradaItem} onOpenChange={(open) => !open && setEntradaItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entrada de Material</DialogTitle>
          </DialogHeader>
          {entradaItem && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{entradaItem.materia_prima}</p>
                <p className="text-xs text-muted-foreground">
                  Saldo atual: <span className="font-medium text-foreground">{formatKg(entradaItem.saldo_kg)} kg</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Quantidade (kg)</label>
                <Input
                  type="number"
                  inputMode="decimal"
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

      {/* ── Modal Ajuste ── */}
      <Dialog open={!!ajusteItem} onOpenChange={(open) => !open && setAjusteItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste de Saldo</DialogTitle>
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
                  inputMode="decimal"
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
            <DialogTitle>Editar Estoque Mínimo</DialogTitle>
          </DialogHeader>
          {minimoItem && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">{minimoItem.materia_prima}</p>
              <div>
                <label className="text-xs font-medium">Mínimo (kg)</label>
                <Input
                  type="number"
                  inputMode="decimal"
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
            <DialogTitle>
              Histórico — {historicoItem?.materia_prima}
            </DialogTitle>
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
                      <td className="px-3 py-1.5">{tipoBadge(mov)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${mov.quantidade_kg >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {mov.quantidade_kg >= 0 ? '+' : ''}{formatKg(mov.quantidade_kg)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {mov.saldo_apos !== null ? formatKg(mov.saldo_apos) : '—'}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">
                        {mov.ordem_lote ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[180px] truncate" title={mov.observacao ?? ''}>
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

      {/* ── Modal Importar ── */}
      <Dialog open={importarOpen} onOpenChange={(open) => { if (!open) { setImportarOpen(false); setImportFile(null); setImportPreview([]); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importar Saldos Iniciais</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">Formato esperado da planilha (a partir da 2ª linha):</p>
              <p>Coluna A: Código TID (ex.: <code>000141</code>)</p>
              <p>Coluna B: Nome da matéria-prima</p>
              <p>Coluna C: Saldo em kg</p>
              <p>Coluna D: Estoque mínimo em kg (opcional)</p>
            </div>

            <div>
              <label className="text-xs font-medium">Selecionar arquivo (.xlsx, .xls, .csv)</label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="mt-1 h-8 text-xs"
              />
            </div>

            {importPreview.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">{importPreview.length} linha(s) encontrada(s) — pré-visualização:</p>
                <div className="rounded border overflow-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1">Cód. TID</th>
                        <th className="text-left px-2 py-1">Matéria-Prima</th>
                        <th className="text-right px-2 py-1">Saldo (kg)</th>
                        <th className="text-right px-2 py-1">Mínimo (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1 font-mono">{row.cod_tid}</td>
                          <td className="px-2 py-1">{row.materia_prima || '—'}</td>
                          <td className="px-2 py-1 text-right">{formatKg(row.saldo_kg)}</td>
                          <td className="px-2 py-1 text-right">{formatKg(row.minimo_kg)}</td>
                        </tr>
                      ))}
                      {importPreview.length > 20 && (
                        <tr>
                          <td colSpan={4} className="px-2 py-1 text-center text-muted-foreground italic">
                            ... e mais {importPreview.length - 20} linha(s)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportarOpen(false); setImportFile(null); setImportPreview([]); }}>
              Cancelar
            </Button>
            <Button onClick={handleImportar} disabled={importPreview.length === 0 || importando}>
              {importando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Importar {importPreview.length > 0 ? `(${importPreview.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
