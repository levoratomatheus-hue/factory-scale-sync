import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatKg } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Trash2, Download, Search, FlaskConical, BarChart3, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type Setor = 'laboratorio' | 'producao';
type FiltroSetor = Setor | 'ambos';
type FiltroSetorLista = Setor | 'ambos' | 'sem_setor';

interface MpDepara {
  cod_excel: string;
  descricao: string;
  tipo: string | null;
}

interface ConsumoMpRow {
  id: string;
  cod_mp_excel: string;
  materia_prima: string;
  quantidade_kg: number;
  data_retirada: string;
  observacao: string | null;
  retirado_por: string;
  criado_em: string;
  setor: Setor | null;
}

interface TotalPorMp {
  cod_mp_excel: string;
  cod_tid: string | null;
  materia_prima: string;
  total_kg: number;
  kg_lab: number;
  kg_prod: number;
  num_retiradas: number;
  pct: number;
}

interface Props {
  perfilNome: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string) {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  return r;
}
function endOfWeek(d: Date) {
  const sw = startOfWeek(d);
  const r = new Date(sw);
  r.setDate(sw.getDate() + 6);
  return r;
}

const SETOR_LABEL: Record<Setor, string> = {
  laboratorio: 'Laboratório',
  producao: 'Produção',
};

// ── Inline setor selector ─────────────────────────────────────────────────────

function SetorInline({
  rowId,
  setor,
  atualizando,
  onChange,
}: {
  rowId: string;
  setor: Setor | null;
  atualizando: boolean;
  onChange: (s: Setor) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {atualizando ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground my-auto mx-1" />
      ) : (
        (['laboratorio', 'producao'] as const).map((s) => (
          <button
            key={s}
            onClick={() => { if (setor !== s) onChange(s); }}
            title={SETOR_LABEL[s]}
            className={cn(
              'px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors',
              setor === s
                ? s === 'laboratorio'
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'bg-orange-500 text-white dark:bg-orange-500'
                : 'bg-muted text-muted-foreground hover:bg-muted/60',
            )}
          >
            {s === 'laboratorio' ? 'Lab' : 'Prod'}
          </button>
        ))
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ConsumoMP({ perfilNome }: Props) {

  // ─── Seção 1 – Lançar retirada ─────────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<MpDepara[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const [mpSelecionada, setMpSelecionada] = useState<MpDepara | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(toInputDate(new Date()));
  const [observacao, setObservacao] = useState('');
  const [setor, setSetor] = useState<Setor>('laboratorio');
  const [salvando, setSalvando] = useState(false);
  const [retiradas, setRetiradas] = useState<ConsumoMpRow[]>([]);
  const [carregandoRetiradas, setCarregandoRetiradas] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Filtros da lista de retiradas ─────────────────────────────────────────
  const [filtroSetorLista, setFiltroSetorLista] = useState<FiltroSetorLista>('ambos');
  const [dataInicioLista, setDataInicioLista] = useState('');
  const [dataFimLista, setDataFimLista] = useState('');

  // ─── Edição ────────────────────────────────────────────────────────────────
  const [editRow, setEditRow] = useState<ConsumoMpRow | null>(null);
  const [editSetor, setEditSetor] = useState<Setor>('laboratorio');
  const [editBusca, setEditBusca] = useState('');
  const [editSugestoes, setEditSugestoes] = useState<MpDepara[]>([]);
  const [editShowSugestoes, setEditShowSugestoes] = useState(false);
  const [editMp, setEditMp] = useState<MpDepara | null>(null);
  const [editQtd, setEditQtd] = useState('');
  const [editData, setEditData] = useState('');
  const [editObs, setEditObs] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [atualizandoSetorId, setAtualizandoSetorId] = useState<string | null>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Seção 2 – Relatório ───────────────────────────────────────────────────
  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(toInputDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [dataFim, setDataFim] = useState(toInputDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)));
  const [filtroSetor, setFiltroSetor] = useState<FiltroSetor>('ambos');
  const [relatorio, setRelatorio] = useState<ConsumoMpRow[]>([]);
  const [carregandoRel, setCarregandoRel] = useState(false);
  const [deparaMap, setDeparaMap] = useState<Map<string, string | null>>(new Map());

  // ── Autocomplete (form) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busca.length < 2) { setSugestoes([]); setShowSugestoes(false); return; }
    debounceRef.current = setTimeout(async () => {
      const { data: rows } = await supabase
        .from('mp_depara')
        .select('cod_excel, descricao, tipo')
        .or(`descricao.ilike.%${busca}%,cod_excel.ilike.%${busca}%`)
        .order('descricao')
        .limit(20);
      setSugestoes(rows ?? []);
      setShowSugestoes(true);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  // ── Autocomplete (edit dialog) ──────────────────────────────────────────────
  useEffect(() => {
    if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
    if (editBusca.length < 2) { setEditSugestoes([]); setEditShowSugestoes(false); return; }
    editDebounceRef.current = setTimeout(async () => {
      const { data: rows } = await supabase
        .from('mp_depara')
        .select('cod_excel, descricao, tipo')
        .or(`descricao.ilike.%${editBusca}%,cod_excel.ilike.%${editBusca}%`)
        .order('descricao')
        .limit(20);
      setEditSugestoes(rows ?? []);
      setEditShowSugestoes(true);
    }, 250);
    return () => { if (editDebounceRef.current) clearTimeout(editDebounceRef.current); };
  }, [editBusca]);

  // ── Últimas retiradas (com filtros de data) ─────────────────────────────────
  const fetchRetiradas = useCallback(async () => {
    setCarregandoRetiradas(true);
    let q = (supabase as any)
      .from('consumo_mp')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(500);
    if (dataInicioLista) q = q.gte('data_retirada', dataInicioLista);
    if (dataFimLista) q = q.lte('data_retirada', dataFimLista);
    const { data: rows } = await q;
    setRetiradas((rows ?? []) as ConsumoMpRow[]);
    setCarregandoRetiradas(false);
  }, [dataInicioLista, dataFimLista]);

  useEffect(() => { fetchRetiradas(); }, [fetchRetiradas]);

  // ── Filtro de setor na lista (client-side) ──────────────────────────────────
  const retiradasFiltradas = useMemo(() => {
    if (filtroSetorLista === 'ambos') return retiradas;
    if (filtroSetorLista === 'sem_setor') return retiradas.filter((r) => r.setor === null);
    return retiradas.filter((r) => r.setor === filtroSetorLista);
  }, [retiradas, filtroSetorLista]);

  const contSemSetor = useMemo(() => retiradas.filter((r) => r.setor === null).length, [retiradas]);

  // ── Registrar retirada ──────────────────────────────────────────────────────
  const handleRegistrar = async () => {
    if (!mpSelecionada) { toast({ title: 'Selecione uma matéria-prima', variant: 'destructive' }); return; }
    const qtd = parseFloat(quantidade.replace(',', '.'));
    if (!quantidade || isNaN(qtd) || qtd <= 0) { toast({ title: 'Informe uma quantidade válida (> 0)', variant: 'destructive' }); return; }
    if (!data) { toast({ title: 'Informe a data', variant: 'destructive' }); return; }

    setSalvando(true);
    const { error } = await (supabase as any).from('consumo_mp').insert({
      cod_mp_excel: mpSelecionada.cod_excel,
      materia_prima: mpSelecionada.descricao,
      quantidade_kg: qtd,
      data_retirada: data,
      observacao: observacao.trim() || null,
      retirado_por: perfilNome,
      setor,
    });
    setSalvando(false);

    if (error) {
      toast({ title: 'Erro ao registrar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Retirada registrada com sucesso!' });
    setBusca('');
    setMpSelecionada(null);
    setQuantidade('');
    setData(toInputDate(new Date()));
    setObservacao('');
    setSugestoes([]);
    setShowSugestoes(false);
    fetchRetiradas();
    setTimeout(() => buscaRef.current?.focus(), 100);
  };

  // ── Excluir retirada ────────────────────────────────────────────────────────
  const handleExcluir = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('consumo_mp').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Lançamento excluído' });
    fetchRetiradas();
    fetchRelatorio();
  };

  // ── Atualizar setor inline ──────────────────────────────────────────────────
  const handleAtualizarSetor = useCallback(async (id: string, novoSetor: Setor) => {
    setAtualizandoSetorId(id);
    const { error } = await (supabase as any)
      .from('consumo_mp')
      .update({ setor: novoSetor })
      .eq('id', id);
    setAtualizandoSetorId(null);
    if (error) { toast({ title: 'Erro ao atualizar setor', variant: 'destructive' }); return; }
    toast({ title: `Setor → ${SETOR_LABEL[novoSetor]}` });
    setRetiradas((prev) => prev.map((r) => r.id === id ? { ...r, setor: novoSetor } : r));
    setRelatorio((prev) => prev.map((r) => r.id === id ? { ...r, setor: novoSetor } : r));
  }, []);

  // ── Abrir edição ────────────────────────────────────────────────────────────
  const abrirEdicao = useCallback((row: ConsumoMpRow) => {
    setEditRow(row);
    setEditSetor(row.setor ?? 'laboratorio');
    setEditQtd(String(row.quantidade_kg).replace('.', ','));
    setEditData(row.data_retirada);
    setEditObs(row.observacao ?? '');
    setEditMp({ cod_excel: row.cod_mp_excel, descricao: row.materia_prima, tipo: null });
    setEditBusca('');
    setEditSugestoes([]);
    setEditShowSugestoes(false);
  }, []);

  // ── Salvar edição ───────────────────────────────────────────────────────────
  const handleSalvarEdicao = async () => {
    if (!editRow) return;
    if (!editMp) { toast({ title: 'Selecione uma matéria-prima', variant: 'destructive' }); return; }
    const qtd = parseFloat(editQtd.replace(',', '.'));
    if (isNaN(qtd) || qtd <= 0) { toast({ title: 'Quantidade inválida', variant: 'destructive' }); return; }
    if (!editData) { toast({ title: 'Informe a data', variant: 'destructive' }); return; }
    setSalvandoEdicao(true);
    const { error } = await (supabase as any).from('consumo_mp').update({
      setor: editSetor,
      cod_mp_excel: editMp.cod_excel,
      materia_prima: editMp.descricao,
      quantidade_kg: qtd,
      data_retirada: editData,
      observacao: editObs.trim() || null,
    }).eq('id', editRow.id);
    setSalvandoEdicao(false);
    if (error) { toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Lançamento atualizado com sucesso!' });
    setEditRow(null);
    fetchRetiradas();
    fetchRelatorio();
  };

  // ── Mapa cod_excel → cod_tid ─────────────────────────────────────────────
  useEffect(() => {
    supabase.from('mp_depara').select('cod_excel, cod_tid').then(({ data }) => {
      if (!data) return;
      const m = new Map<string, string | null>();
      for (const row of data) m.set(row.cod_excel, (row as any).cod_tid ?? null);
      setDeparaMap(m);
    });
  }, []);

  // ── Relatório ───────────────────────────────────────────────────────────────
  const fetchRelatorio = useCallback(async () => {
    setCarregandoRel(true);
    const { data: rows } = await (supabase as any)
      .from('consumo_mp')
      .select('*')
      .gte('data_retirada', dataInicio)
      .lte('data_retirada', dataFim)
      .order('data_retirada', { ascending: false });
    setRelatorio((rows ?? []) as ConsumoMpRow[]);
    setCarregandoRel(false);
  }, [dataInicio, dataFim]);

  useEffect(() => { fetchRelatorio(); }, [fetchRelatorio]);

  // ── Filtragem por setor (client-side) ───────────────────────────────────────
  const relatorioFiltrado = useMemo(() => {
    if (filtroSetor === 'ambos') return relatorio;
    return relatorio.filter((r) => r.setor === filtroSetor);
  }, [relatorio, filtroSetor]);

  // ── Totais por MP ───────────────────────────────────────────────────────────
  const totaisPorMp: TotalPorMp[] = useMemo(() => {
    const map = new Map<string, TotalPorMp>();
    for (const r of relatorioFiltrado) {
      const key = r.cod_mp_excel;
      if (!map.has(key)) {
        map.set(key, {
          cod_mp_excel: r.cod_mp_excel,
          cod_tid: deparaMap.get(r.cod_mp_excel) ?? null,
          materia_prima: r.materia_prima,
          total_kg: 0,
          kg_lab: 0,
          kg_prod: 0,
          num_retiradas: 0,
          pct: 0,
        });
      }
      const entry = map.get(key)!;
      entry.total_kg += r.quantidade_kg;
      entry.num_retiradas += 1;
      if (r.setor === 'laboratorio') entry.kg_lab += r.quantidade_kg;
      else if (r.setor === 'producao') entry.kg_prod += r.quantidade_kg;
    }
    const arr = Array.from(map.values()).sort((a, b) => b.total_kg - a.total_kg);
    const total = arr.reduce((s, t) => s + t.total_kg, 0);
    arr.forEach((t) => { t.pct = total > 0 ? (t.total_kg / total) * 100 : 0; });
    return arr;
  }, [relatorioFiltrado, deparaMap]);

  const totalGeralKg = useMemo(() => totaisPorMp.reduce((s, t) => s + t.total_kg, 0), [totaisPorMp]);
  const numMpDistintas = totaisPorMp.length;

  const totalLabKg = useMemo(() => relatorioFiltrado.filter((r) => r.setor === 'laboratorio').reduce((s, r) => s + r.quantidade_kg, 0), [relatorioFiltrado]);
  const totalProdKg = useMemo(() => relatorioFiltrado.filter((r) => r.setor === 'producao').reduce((s, r) => s + r.quantidade_kg, 0), [relatorioFiltrado]);

  // ── Atalhos de período ──────────────────────────────────────────────────────
  const aplicarAtalho = (atalho: 'hoje' | 'semana' | 'mes' | 'ano') => {
    const h = new Date();
    if (atalho === 'hoje') { setDataInicio(toInputDate(h)); setDataFim(toInputDate(h)); }
    else if (atalho === 'semana') { setDataInicio(toInputDate(startOfWeek(h))); setDataFim(toInputDate(endOfWeek(h))); }
    else if (atalho === 'mes') { setDataInicio(toInputDate(new Date(h.getFullYear(), h.getMonth(), 1))); setDataFim(toInputDate(new Date(h.getFullYear(), h.getMonth() + 1, 0))); }
    else if (atalho === 'ano') { setDataInicio(toInputDate(new Date(h.getFullYear(), 0, 1))); setDataFim(toInputDate(new Date(h.getFullYear(), 11, 31))); }
  };

  // ── Exportar CSV ────────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const totalRows = [
      ['Matéria-Prima', 'Cód. Excel', 'Cód. TID', 'Total (kg)', '% do total',
        ...(filtroSetor === 'ambos' ? ['Kg Laboratório', 'Kg Produção'] : [])],
      ...totaisPorMp.map((t) => [
        t.materia_prima,
        t.cod_mp_excel,
        t.cod_tid ?? '',
        t.total_kg.toFixed(3).replace('.', ','),
        t.pct.toFixed(2).replace('.', ',') + '%',
        ...(filtroSetor === 'ambos' ? [
          t.kg_lab.toFixed(3).replace('.', ','),
          t.kg_prod.toFixed(3).replace('.', ','),
        ] : []),
      ]),
    ];

    const detailRows = [
      [],
      ['--- Histórico Detalhado ---'],
      ['Data', 'Setor', 'Cód. Excel', 'Cód. TID', 'Matéria-Prima', 'Quantidade (kg)', 'Retirado por', 'Observação'],
      ...relatorioFiltrado.map((r) => [
        fmt(r.data_retirada),
        r.setor ? SETOR_LABEL[r.setor] : '',
        r.cod_mp_excel,
        deparaMap.get(r.cod_mp_excel) ?? '',
        r.materia_prima,
        String(r.quantidade_kg).replace('.', ','),
        r.retirado_por,
        r.observacao ?? '',
      ]),
    ];

    const all = [...totalRows, ...detailRows];
    const csv = '\ufeff' + all.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumo_mp_${filtroSetor}_${dataInicio}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mostrarColunaSetor = filtroSetor === 'ambos';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Tabs defaultValue="lancar">
        <TabsList className="mb-4">
          <TabsTrigger value="lancar" className="gap-1.5">
            <FlaskConical className="h-4 w-4" />
            Lançar Retirada
          </TabsTrigger>
          <TabsTrigger value="relatorio" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Relatório por Período
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════
            ABA 1 – LANÇAR RETIRADA
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="lancar" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nova Retirada de MP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Busca de MP */}
              <div className="space-y-1.5 relative">
                <Label>Matéria-Prima *</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={buscaRef}
                    placeholder="Buscar por código ou descrição…"
                    value={mpSelecionada ? `${mpSelecionada.cod_excel} – ${mpSelecionada.descricao}` : busca}
                    onChange={e => {
                      if (mpSelecionada) setMpSelecionada(null);
                      setBusca(e.target.value);
                    }}
                    onFocus={() => { if (busca.length >= 2 && !mpSelecionada) setShowSugestoes(true); }}
                    onBlur={() => setTimeout(() => setShowSugestoes(false), 150)}
                    className="pl-8 pr-8"
                  />
                  {(busca || mpSelecionada) && (
                    <button
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setBusca(''); setMpSelecionada(null); setSugestoes([]); setShowSugestoes(false); buscaRef.current?.focus(); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {showSugestoes && sugestoes.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                    {sugestoes.map(mp => (
                      <button
                        key={mp.cod_excel}
                        className="flex items-start gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setMpSelecionada(mp); setBusca(''); setShowSugestoes(false); }}
                      >
                        <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0">{mp.cod_excel}</span>
                        <span className="leading-tight">{mp.descricao}</span>
                        {mp.tipo && <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{mp.tipo}</Badge>}
                      </button>
                    ))}
                  </div>
                )}
                {showSugestoes && busca.length >= 2 && sugestoes.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma MP encontrada para "{busca}"
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Quantidade (kg) *</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,000"
                    value={quantidade}
                    onChange={e => setQuantidade(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input type="date" value={data} onChange={e => setData(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Setor *</Label>
                  <div className="flex rounded-md border overflow-hidden h-10">
                    {(['laboratorio', 'producao'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSetor(s)}
                        className={cn(
                          'flex-1 px-3 text-sm transition-colors',
                          s === 'producao' && 'border-l',
                          setor === s
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {SETOR_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea
                  placeholder="Finalidade, experimento, etc."
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={2}
                />
              </div>

              <Button onClick={handleRegistrar} disabled={salvando} className="w-full sm:w-auto">
                {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Registrar Retirada
              </Button>
            </CardContent>
          </Card>

          {/* ── Gerenciar Retiradas ─────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">Retiradas Registradas</CardTitle>
                {contSemSetor > 0 && (
                  <button
                    onClick={() => setFiltroSetorLista('sem_setor')}
                    className="text-xs text-amber-600 dark:text-amber-400 font-medium hover:underline"
                  >
                    {contSemSetor} sem setor definido
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Filtros da lista */}
              <div className="flex flex-wrap items-end gap-3 pb-3 border-b">
                <div className="space-y-1">
                  <Label className="text-xs">De</Label>
                  <Input
                    type="date"
                    value={dataInicioLista}
                    onChange={e => setDataInicioLista(e.target.value)}
                    className="w-32 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Até</Label>
                  <Input
                    type="date"
                    value={dataFimLista}
                    onChange={e => setDataFimLista(e.target.value)}
                    className="w-32 h-8 text-sm"
                  />
                </div>
                {(dataInicioLista || dataFimLista) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs self-end"
                    onClick={() => { setDataInicioLista(''); setDataFimLista(''); }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpar datas
                  </Button>
                )}
                <div className="flex rounded-md border overflow-hidden self-end">
                  {([
                    { id: 'laboratorio', label: 'Lab' },
                    { id: 'producao', label: 'Prod' },
                    { id: 'ambos', label: 'Ambos' },
                    { id: 'sem_setor', label: 'Sem setor' },
                  ] as const).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFiltroSetorLista(id)}
                      className={cn(
                        'px-2.5 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0',
                        filtroSetorLista === id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground self-end ml-auto">
                  {retiradasFiltradas.length} registro{retiradasFiltradas.length !== 1 ? 's' : ''}
                </span>
              </div>

              {carregandoRetiradas ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : retiradasFiltradas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {retiradas.length === 0
                    ? 'Nenhuma retirada registrada ainda.'
                    : 'Nenhuma retirada para os filtros selecionados.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left pb-2 pr-3 font-medium">Data</th>
                        <th className="text-left pb-2 pr-3 font-medium">Setor</th>
                        <th className="text-left pb-2 pr-3 font-medium">Cód.</th>
                        <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                        <th className="text-right pb-2 pr-3 font-medium">Qtd (kg)</th>
                        <th className="text-left pb-2 pr-3 font-medium">Retirado por</th>
                        <th className="text-left pb-2 pr-3 font-medium">Obs.</th>
                        <th className="pb-2 text-right pr-1 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retiradasFiltradas.map(r => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.data_retirada)}</td>
                          <td className="py-2 pr-3">
                            <SetorInline
                              rowId={r.id}
                              setor={r.setor}
                              atualizando={atualizandoSetorId === r.id}
                              onChange={(s) => handleAtualizarSetor(r.id, s)}
                            />
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.cod_mp_excel}</td>
                          <td className="py-2 pr-3">{r.materia_prima}</td>
                          <td className="py-2 pr-3 text-right font-mono">{formatKg(r.quantidade_kg)}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">{r.retirado_por}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[140px] truncate">{r.observacao ?? '—'}</td>
                          <td className="py-2 text-right">
                            <div className="flex gap-0.5 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => abrirEdicao(r)}
                                title="Editar lançamento"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive/60 hover:text-destructive"
                                onClick={() => handleExcluir(r.id)}
                                title="Excluir lançamento"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════
            ABA 2 – RELATÓRIO POR PERÍODO
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="relatorio" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>De</Label>
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-36" />
                </div>
                <div className="space-y-1.5">
                  <Label>Até</Label>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['hoje', 'semana', 'mes', 'ano'] as const).map(a => (
                    <Button key={a} variant="outline" size="sm" onClick={() => aplicarAtalho(a)}>
                      {a === 'hoje' ? 'Hoje' : a === 'semana' ? 'Esta semana' : a === 'mes' ? 'Este mês' : 'Este ano'}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5 ml-2">
                  <Label>Setor</Label>
                  <div className="flex rounded-md border overflow-hidden">
                    {(['laboratorio', 'producao', 'ambos'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFiltroSetor(s)}
                        className={cn(
                          'px-3 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0',
                          filtroSetor === s
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {s === 'laboratorio' ? 'Laboratório' : s === 'producao' ? 'Produção' : 'Ambos'}
                      </button>
                    ))}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={exportarCSV} className="gap-1.5 ml-auto">
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {carregandoRel ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="col-span-2">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total no período</p>
                    <p className="text-2xl font-bold">{formatKg(totalGeralKg)} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
                    {filtroSetor === 'ambos' && (totalLabKg > 0 || totalProdKg > 0) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="text-blue-600 dark:text-blue-400 font-medium">Lab: {formatKg(totalLabKg)} kg</span>
                        <span className="mx-1.5">·</span>
                        <span className="text-orange-600 dark:text-orange-400 font-medium">Prod: {formatKg(totalProdKg)} kg</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">MPs distintas</p>
                    <p className="text-2xl font-bold">{numMpDistintas}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nº de retiradas</p>
                    <p className="text-2xl font-bold">{relatorioFiltrado.length}</p>
                  </CardContent>
                </Card>
              </div>

              {relatorioFiltrado.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    Nenhuma retirada no período selecionado
                    {filtroSetor !== 'ambos' && ` para o setor ${SETOR_LABEL[filtroSetor]}`}.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Totais por MP */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Totais por Matéria-Prima</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground text-xs">
                              <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                              <th className="text-left pb-2 pr-3 font-medium">Cód. Excel</th>
                              <th className="text-left pb-2 pr-3 font-medium">Cód. TID</th>
                              <th className="text-right pb-2 pr-3 font-medium">Total (kg)</th>
                              {mostrarColunaSetor && <>
                                <th className="text-right pb-2 pr-3 font-medium text-blue-600 dark:text-blue-400">Lab (kg)</th>
                                <th className="text-right pb-2 pr-3 font-medium text-orange-600 dark:text-orange-400">Prod (kg)</th>
                              </>}
                              <th className="text-right pb-2 font-medium">% do total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {totaisPorMp.map((t, i) => (
                              <tr key={t.cod_mp_excel} className={cn('border-b last:border-0 hover:bg-muted/40 transition-colors', i === 0 && 'font-medium')}>
                                <td className="py-2 pr-3">{t.materia_prima}</td>
                                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.cod_mp_excel}</td>
                                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.cod_tid ?? '—'}</td>
                                <td className="py-2 pr-3 text-right font-mono">{formatKg(t.total_kg)}</td>
                                {mostrarColunaSetor && <>
                                  <td className="py-2 pr-3 text-right font-mono text-xs text-blue-600 dark:text-blue-400">
                                    {t.kg_lab > 0 ? formatKg(t.kg_lab) : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="py-2 pr-3 text-right font-mono text-xs text-orange-600 dark:text-orange-400">
                                    {t.kg_prod > 0 ? formatKg(t.kg_prod) : <span className="text-muted-foreground">—</span>}
                                  </td>
                                </>}
                                <td className="py-2 text-right text-muted-foreground text-xs font-mono">{t.pct.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t font-semibold text-xs">
                              <td colSpan={3} className="py-2 pr-3 text-muted-foreground">Total</td>
                              <td className="py-2 pr-3 text-right font-mono">{formatKg(totalGeralKg)}</td>
                              {mostrarColunaSetor && <>
                                <td className="py-2 pr-3 text-right font-mono text-blue-600 dark:text-blue-400">{formatKg(totalLabKg)}</td>
                                <td className="py-2 pr-3 text-right font-mono text-orange-600 dark:text-orange-400">{formatKg(totalProdKg)}</td>
                              </>}
                              <td className="py-2 text-right text-muted-foreground">100%</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Histórico detalhado */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Histórico Detalhado</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground text-xs">
                              <th className="text-left pb-2 pr-3 font-medium">Data</th>
                              <th className="text-left pb-2 pr-3 font-medium">Setor</th>
                              <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                              <th className="text-left pb-2 pr-3 font-medium">Cód. Excel</th>
                              <th className="text-left pb-2 pr-3 font-medium">Cód. TID</th>
                              <th className="text-right pb-2 pr-3 font-medium">Qtd (kg)</th>
                              <th className="text-left pb-2 pr-3 font-medium">Retirado por</th>
                              <th className="text-left pb-2 pr-3 font-medium">Observação</th>
                              <th className="pb-2 text-right pr-1 font-medium">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {relatorioFiltrado.map(r => (
                              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                                <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.data_retirada)}</td>
                                <td className="py-2 pr-3">
                                  <SetorInline
                                    rowId={r.id}
                                    setor={r.setor}
                                    atualizando={atualizandoSetorId === r.id}
                                    onChange={(s) => handleAtualizarSetor(r.id, s)}
                                  />
                                </td>
                                <td className="py-2 pr-3">{r.materia_prima}</td>
                                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.cod_mp_excel}</td>
                                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{deparaMap.get(r.cod_mp_excel) ?? '—'}</td>
                                <td className="py-2 pr-3 text-right font-mono">{formatKg(r.quantidade_kg)}</td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground">{r.retirado_por}</td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[160px] truncate">{r.observacao ?? '—'}</td>
                                <td className="py-2 text-right">
                                  <div className="flex gap-0.5 justify-end">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => abrirEdicao(r)}
                                      title="Editar lançamento"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive/60 hover:text-destructive"
                                      onClick={() => handleExcluir(r.id)}
                                      title="Excluir lançamento"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════
          MODAL DE EDIÇÃO
      ════════════════════════════════════════════════════════ */}
      <Dialog open={!!editRow} onOpenChange={(open) => { if (!open) setEditRow(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Setor */}
            <div className="space-y-1.5">
              <Label>Setor *</Label>
              <div className="flex rounded-md border overflow-hidden h-10">
                {(['laboratorio', 'producao'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditSetor(s)}
                    className={cn(
                      'flex-1 px-3 text-sm transition-colors',
                      s === 'producao' && 'border-l',
                      editSetor === s
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'bg-background text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {SETOR_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Matéria-Prima */}
            <div className="space-y-1.5 relative">
              <Label>Matéria-Prima *</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Buscar por código ou descrição…"
                  value={editMp ? `${editMp.cod_excel} – ${editMp.descricao}` : editBusca}
                  onChange={e => {
                    if (editMp) setEditMp(null);
                    setEditBusca(e.target.value);
                  }}
                  onFocus={() => { if (editBusca.length >= 2 && !editMp) setEditShowSugestoes(true); }}
                  onBlur={() => setTimeout(() => setEditShowSugestoes(false), 150)}
                  className="pl-8 pr-8"
                />
                {(editBusca || editMp) && (
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setEditBusca(''); setEditMp(null); setEditSugestoes([]); setEditShowSugestoes(false); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editShowSugestoes && editSugestoes.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {editSugestoes.map(mp => (
                    <button
                      key={mp.cod_excel}
                      className="flex items-start gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setEditMp(mp); setEditBusca(''); setEditShowSugestoes(false); }}
                    >
                      <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0">{mp.cod_excel}</span>
                      <span className="leading-tight">{mp.descricao}</span>
                      {mp.tipo && <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{mp.tipo}</Badge>}
                    </button>
                  ))}
                </div>
              )}
              {editShowSugestoes && editBusca.length >= 2 && editSugestoes.length === 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">
                  Nenhuma MP encontrada para "{editBusca}"
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Quantidade */}
              <div className="space-y-1.5">
                <Label>Quantidade (kg) *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,000"
                  value={editQtd}
                  onChange={e => setEditQtd(e.target.value)}
                />
              </div>
              {/* Data */}
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={editData} onChange={e => setEditData(e.target.value)} />
              </div>
            </div>

            {/* Observação */}
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Textarea
                placeholder="Finalidade, experimento, etc."
                value={editObs}
                onChange={e => setEditObs(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancelar</Button>
            <Button onClick={handleSalvarEdicao} disabled={salvandoEdicao}>
              {salvandoEdicao && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
