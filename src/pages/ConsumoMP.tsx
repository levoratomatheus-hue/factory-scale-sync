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
import { Loader2, Trash2, Download, Search, FlaskConical, BarChart3, X, Pencil, Save, BookOpen, Eye } from 'lucide-react';
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

// ── Tipos de relatórios salvos ─────────────────────────────────────────────────

interface RelatorioSalvo {
  id: string;
  titulo: string | null;
  data_inicio: string;
  data_fim: string;
  setor: string;
  total_kg: number;
  num_mps: number;
  criado_por: string;
  criado_em: string;
}

interface RelatorioSalvoItem {
  id: string;
  relatorio_id: string;
  materia_prima: string;
  cod_mp_excel: string;
  cod_tid: string | null;
  total_kg: number;
  percentual: number;
  setor: string;
}

// Linha pivotada para exibição (agrupa lab + prod de uma mesma MP)
interface RelatorioSalvoItemDisplay {
  cod_mp_excel: string;
  cod_tid: string | null;
  materia_prima: string;
  total_kg: number;
  kg_lab: number;
  kg_prod: number;
  percentual: number;
}

interface Props {
  perfilNome: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formata porcentagem com 3 casas decimais; valores > 0 mas < 0,0005 exibem "<0,001%". */
function fmtPct(v: number): string {
  if (v === 0) return '0,000%';
  if (v < 0.0005) return '<0,001%';
  return v.toFixed(3).replace('.', ',') + '%';
}

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

function fmtDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const SETOR_LABEL: Record<string, string> = {
  laboratorio: 'Laboratório',
  producao: 'Produção',
  ambos: 'Ambos',
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

  // ─── Salvar relatório ──────────────────────────────────────────────────────
  const [showSalvarDialog, setShowSalvarDialog] = useState(false);
  const [tituloRelatorio, setTituloRelatorio] = useState('');
  const [salvandoRelatorio, setSalvandoRelatorio] = useState(false);

  // ─── Relatórios salvos ─────────────────────────────────────────────────────
  const [relatoriosSalvos, setRelatoriosSalvos] = useState<RelatorioSalvo[]>([]);
  const [carregandoSalvos, setCarregandoSalvos] = useState(false);
  const [filtroSalvosSetor, setFiltroSalvosSetor] = useState<string>('todos');
  const [filtroSalvosInicio, setFiltroSalvosInicio] = useState('');
  const [filtroSalvosFim, setFiltroSalvosFim] = useState('');
  const [relatorioAberto, setRelatorioAberto] = useState<RelatorioSalvo | null>(null);
  const [itensAbertos, setItensAbertos] = useState<RelatorioSalvoItem[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

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

  // ── Exportar CSV (relatório ao vivo) ────────────────────────────────────────
  const exportarCSV = () => {
    const totalRows = [
      ['Matéria-Prima', 'Cód. Excel', 'Cód. TID', 'Total (kg)', '% do total',
        ...(filtroSetor === 'ambos' ? ['Kg Laboratório', 'Kg Produção'] : [])],
      ...totaisPorMp.map((t) => [
        t.materia_prima,
        t.cod_mp_excel,
        t.cod_tid ?? '',
        t.total_kg.toFixed(3).replace('.', ','),
        fmtPct(t.pct),
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
    downloadCsv(all, `consumo_mp_${filtroSetor}_${dataInicio}_${dataFim}.csv`);
  };

  // ── Salvar relatório ────────────────────────────────────────────────────────
  const handleSalvarRelatorio = async () => {
    if (totaisPorMp.length === 0) {
      toast({ title: 'Não há dados para salvar', variant: 'destructive' });
      return;
    }
    setSalvandoRelatorio(true);

    // Inserir cabeçalho
    const { data: cab, error: errCab } = await (supabase as any)
      .from('relatorios_consumo_mp')
      .insert({
        titulo: tituloRelatorio.trim() || null,
        data_inicio: dataInicio,
        data_fim: dataFim,
        setor: filtroSetor,
        total_kg: totalGeralKg,
        num_mps: numMpDistintas,
        criado_por: perfilNome,
      })
      .select('id')
      .single();

    if (errCab || !cab) {
      setSalvandoRelatorio(false);
      toast({ title: 'Erro ao salvar relatório', description: errCab?.message, variant: 'destructive' });
      return;
    }

    // Inserir itens congelados — uma linha por MP×setor
    // Quando filtro = 'ambos', grava lab e prod separadamente (mesmo schema)
    const itens: object[] = [];
    for (const t of totaisPorMp) {
      if (filtroSetor === 'ambos') {
        if (t.kg_lab > 0) {
          itens.push({
            relatorio_id: cab.id,
            materia_prima: t.materia_prima,
            cod_mp_excel: t.cod_mp_excel,
            cod_tid: t.cod_tid ?? null,
            total_kg: t.kg_lab,
            percentual: totalGeralKg > 0 ? (t.kg_lab / totalGeralKg) * 100 : 0,
            setor: 'laboratorio',
          });
        }
        if (t.kg_prod > 0) {
          itens.push({
            relatorio_id: cab.id,
            materia_prima: t.materia_prima,
            cod_mp_excel: t.cod_mp_excel,
            cod_tid: t.cod_tid ?? null,
            total_kg: t.kg_prod,
            percentual: totalGeralKg > 0 ? (t.kg_prod / totalGeralKg) * 100 : 0,
            setor: 'producao',
          });
        }
        // MP sem setor definido — grava como 'ambos' para não perder
        if (t.kg_lab === 0 && t.kg_prod === 0) {
          itens.push({
            relatorio_id: cab.id,
            materia_prima: t.materia_prima,
            cod_mp_excel: t.cod_mp_excel,
            cod_tid: t.cod_tid ?? null,
            total_kg: t.total_kg,
            percentual: t.pct,
            setor: 'ambos',
          });
        }
      } else {
        itens.push({
          relatorio_id: cab.id,
          materia_prima: t.materia_prima,
          cod_mp_excel: t.cod_mp_excel,
          cod_tid: t.cod_tid ?? null,
          total_kg: t.total_kg,
          percentual: t.pct,
          setor: filtroSetor,
        });
      }
    }

    const { error: errItens } = await (supabase as any)
      .from('relatorios_consumo_mp_itens')
      .insert(itens);

    setSalvandoRelatorio(false);

    if (errItens) {
      toast({ title: 'Relatório salvo, mas houve erro nos itens', description: errItens.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Relatório salvo com sucesso!' });
    setShowSalvarDialog(false);
    setTituloRelatorio('');
    fetchRelatoriosSalvos();
  };

  // ── Relatórios salvos – buscar ──────────────────────────────────────────────
  const fetchRelatoriosSalvos = useCallback(async () => {
    setCarregandoSalvos(true);
    let q = (supabase as any)
      .from('relatorios_consumo_mp')
      .select('*')
      .order('criado_em', { ascending: false });
    if (filtroSalvosSetor !== 'todos') q = q.eq('setor', filtroSalvosSetor);
    if (filtroSalvosInicio) q = q.gte('criado_em', filtroSalvosInicio);
    if (filtroSalvosFim) q = q.lte('criado_em', filtroSalvosFim + 'T23:59:59');
    const { data: rows } = await q;
    setRelatoriosSalvos((rows ?? []) as RelatorioSalvo[]);
    setCarregandoSalvos(false);
  }, [filtroSalvosSetor, filtroSalvosInicio, filtroSalvosFim]);

  useEffect(() => { fetchRelatoriosSalvos(); }, [fetchRelatoriosSalvos]);

  // ── Abrir relatório salvo ───────────────────────────────────────────────────
  const abrirRelatorioSalvo = async (rel: RelatorioSalvo) => {
    setRelatorioAberto(rel);
    setCarregandoItens(true);
    const { data: rows } = await (supabase as any)
      .from('relatorios_consumo_mp_itens')
      .select('*')
      .eq('relatorio_id', rel.id)
      .order('total_kg', { ascending: false });
    setItensAbertos((rows ?? []) as RelatorioSalvoItem[]);
    setCarregandoItens(false);
  };

  // ── Excluir relatório salvo ─────────────────────────────────────────────────
  const handleExcluirRelatorio = async (id: string) => {
    if (!confirm('Excluir este relatório salvo? Esta ação não pode ser desfeita.')) return;
    setExcluindoId(id);
    const { error } = await (supabase as any)
      .from('relatorios_consumo_mp')
      .delete()
      .eq('id', id);
    setExcluindoId(null);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Relatório excluído' });
    fetchRelatoriosSalvos();
  };

  // ── Exportar relatório salvo em CSV ─────────────────────────────────────────
  const exportarRelatorioSalvoCSV = (rel: RelatorioSalvo, itens: RelatorioSalvoItem[]) => {
    const mostrarSetores = rel.setor === 'ambos';
    const linhas = mostrarSetores ? pivotarItens(itens) : itens.map((t) => ({
      cod_mp_excel: t.cod_mp_excel,
      cod_tid: t.cod_tid,
      materia_prima: t.materia_prima,
      total_kg: t.total_kg,
      kg_lab: 0,
      kg_prod: 0,
      percentual: t.percentual,
    } as RelatorioSalvoItemDisplay));

    const rows = [
      ['Matéria-Prima', 'Cód. Excel', 'Cód. TID', 'Total (kg)', '% do total',
        ...(mostrarSetores ? ['Kg Laboratório', 'Kg Produção'] : [])],
      ...linhas.map((t) => [
        t.materia_prima,
        t.cod_mp_excel,
        t.cod_tid ?? '',
        t.total_kg.toFixed(3).replace('.', ','),
        fmtPct(t.percentual),
        ...(mostrarSetores ? [
          t.kg_lab.toFixed(3).replace('.', ','),
          t.kg_prod.toFixed(3).replace('.', ','),
        ] : []),
      ]),
    ];
    const setor_label = SETOR_LABEL[rel.setor] ?? rel.setor;
    downloadCsv(rows, `relatorio_${setor_label}_${rel.data_inicio}_${rel.data_fim}.csv`);
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
          <TabsTrigger value="salvos" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Relatórios Salvos
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
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportarCSV}
                    className="gap-1.5"
                    disabled={totaisPorMp.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowSalvarDialog(true)}
                    className="gap-1.5"
                    disabled={totaisPorMp.length === 0}
                  >
                    <Save className="h-4 w-4" />
                    Salvar relatório
                  </Button>
                </div>
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
                                <td className="py-2 text-right text-muted-foreground text-xs font-mono">{fmtPct(t.pct)}</td>
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

        {/* ════════════════════════════════════════════════════════
            ABA 3 – RELATÓRIOS SALVOS
        ════════════════════════════════════════════════════════ */}
        <TabsContent value="salvos" className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Criado de</Label>
                  <Input
                    type="date"
                    value={filtroSalvosInicio}
                    onChange={e => setFiltroSalvosInicio(e.target.value)}
                    className="w-36 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Criado até</Label>
                  <Input
                    type="date"
                    value={filtroSalvosFim}
                    onChange={e => setFiltroSalvosFim(e.target.value)}
                    className="w-36 h-8 text-sm"
                  />
                </div>
                {(filtroSalvosInicio || filtroSalvosFim) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs self-end"
                    onClick={() => { setFiltroSalvosInicio(''); setFiltroSalvosFim(''); }}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpar datas
                  </Button>
                )}
                <div className="flex rounded-md border overflow-hidden self-end">
                  {([
                    { id: 'todos', label: 'Todos' },
                    { id: 'laboratorio', label: 'Lab' },
                    { id: 'producao', label: 'Prod' },
                    { id: 'ambos', label: 'Ambos' },
                  ] as const).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFiltroSalvosSetor(id)}
                      className={cn(
                        'px-2.5 py-1.5 text-xs font-medium transition-colors border-l first:border-l-0',
                        filtroSalvosSetor === id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de relatórios salvos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico de Relatórios</CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoSalvos ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : relatoriosSalvos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum relatório salvo ainda. Use o botão "Salvar relatório" na aba Relatório por Período.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left pb-2 pr-3 font-medium">Título</th>
                        <th className="text-left pb-2 pr-3 font-medium">Período</th>
                        <th className="text-left pb-2 pr-3 font-medium">Setor</th>
                        <th className="text-right pb-2 pr-3 font-medium">Total (kg)</th>
                        <th className="text-right pb-2 pr-3 font-medium">Nº MPs</th>
                        <th className="text-left pb-2 pr-3 font-medium">Criado por</th>
                        <th className="text-left pb-2 pr-3 font-medium">Criado em</th>
                        <th className="pb-2 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatoriosSalvos.map((rel) => (
                        <tr key={rel.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 pr-3 max-w-[200px]">
                            <span className="truncate block">
                              {rel.titulo ?? <span className="text-muted-foreground italic">Sem título</span>}
                            </span>
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                            {fmt(rel.data_inicio)} – {fmt(rel.data_fim)}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="secondary" className="text-[10px]">
                              {SETOR_LABEL[rel.setor] ?? rel.setor}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-xs">{formatKg(rel.total_kg)}</td>
                          <td className="py-2 pr-3 text-right text-xs">{rel.num_mps}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">{rel.criado_por}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDatetime(rel.criado_em)}</td>
                          <td className="py-2 text-right">
                            <div className="flex gap-0.5 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => abrirRelatorioSalvo(rel)}
                                title="Abrir relatório"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={async () => {
                                  const { data: itens } = await (supabase as any)
                                    .from('relatorios_consumo_mp_itens')
                                    .select('*')
                                    .eq('relatorio_id', rel.id)
                                    .order('total_kg', { ascending: false });
                                  exportarRelatorioSalvoCSV(rel, (itens ?? []) as RelatorioSalvoItem[]);
                                }}
                                title="Exportar CSV"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive/60 hover:text-destructive"
                                onClick={() => handleExcluirRelatorio(rel.id)}
                                disabled={excluindoId === rel.id}
                                title="Excluir relatório"
                              >
                                {excluindoId === rel.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Trash2 className="h-3.5 w-3.5" />}
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

      {/* ════════════════════════════════════════════════════════
          MODAL – SALVAR RELATÓRIO
      ════════════════════════════════════════════════════════ */}
      <Dialog open={showSalvarDialog} onOpenChange={(open) => { if (!open) { setShowSalvarDialog(false); setTituloRelatorio(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar Relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md bg-muted px-3 py-2 text-sm space-y-0.5">
              <p><span className="text-muted-foreground">Período:</span> {fmt(dataInicio)} – {fmt(dataFim)}</p>
              <p><span className="text-muted-foreground">Setor:</span> {SETOR_LABEL[filtroSetor] ?? filtroSetor}</p>
              <p><span className="text-muted-foreground">Total:</span> {formatKg(totalGeralKg)} kg · {numMpDistintas} MPs</p>
            </div>
            <div className="space-y-1.5">
              <Label>Título / descrição (opcional)</Label>
              <Input
                placeholder="Ex.: Consumo laboratório 1ª quinzena julho"
                value={tituloRelatorio}
                onChange={e => setTituloRelatorio(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSalvarRelatorio(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowSalvarDialog(false); setTituloRelatorio(''); }}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarRelatorio} disabled={salvandoRelatorio}>
              {salvandoRelatorio && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
          MODAL – VISUALIZAR RELATÓRIO SALVO
      ════════════════════════════════════════════════════════ */}
      <Dialog open={!!relatorioAberto} onOpenChange={(open) => { if (!open) { setRelatorioAberto(null); setItensAbertos([]); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              {relatorioAberto?.titulo ?? 'Relatório salvo'}
            </DialogTitle>
          </DialogHeader>

          {relatorioAberto && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mb-2">
              <span>Período: <strong className="text-foreground">{fmt(relatorioAberto.data_inicio)} – {fmt(relatorioAberto.data_fim)}</strong></span>
              <span>Setor: <strong className="text-foreground">{SETOR_LABEL[relatorioAberto.setor] ?? relatorioAberto.setor}</strong></span>
              <span>Total: <strong className="text-foreground">{formatKg(relatorioAberto.total_kg)} kg</strong></span>
              <span>MPs: <strong className="text-foreground">{relatorioAberto.num_mps}</strong></span>
              <span>Salvo por: <strong className="text-foreground">{relatorioAberto.criado_por}</strong> em {fmtDatetime(relatorioAberto.criado_em)}</span>
            </div>
          )}

          <div className="overflow-y-auto flex-1">
            {carregandoItens ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (() => {
              const isAmbos = relatorioAberto?.setor === 'ambos';
              const linhasDisplay: RelatorioSalvoItemDisplay[] = isAmbos
                ? pivotarItens(itensAbertos)
                : itensAbertos.map((t) => ({
                    cod_mp_excel: t.cod_mp_excel,
                    cod_tid: t.cod_tid,
                    materia_prima: t.materia_prima,
                    total_kg: t.total_kg,
                    kg_lab: 0,
                    kg_prod: 0,
                    percentual: t.percentual,
                  }));
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                        <th className="text-left pb-2 pr-3 font-medium">Cód. Excel</th>
                        <th className="text-left pb-2 pr-3 font-medium">Cód. TID</th>
                        <th className="text-right pb-2 pr-3 font-medium">Total (kg)</th>
                        {isAmbos && <>
                          <th className="text-right pb-2 pr-3 font-medium text-blue-600 dark:text-blue-400">Lab (kg)</th>
                          <th className="text-right pb-2 pr-3 font-medium text-orange-600 dark:text-orange-400">Prod (kg)</th>
                        </>}
                        <th className="text-right pb-2 font-medium">% do total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasDisplay.map((t, i) => (
                        <tr key={t.cod_mp_excel} className={cn('border-b last:border-0 hover:bg-muted/40 transition-colors', i === 0 && 'font-medium')}>
                          <td className="py-2 pr-3">{t.materia_prima}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.cod_mp_excel}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.cod_tid ?? '—'}</td>
                          <td className="py-2 pr-3 text-right font-mono">{formatKg(t.total_kg)}</td>
                          {isAmbos && <>
                            <td className="py-2 pr-3 text-right font-mono text-xs text-blue-600 dark:text-blue-400">
                              {t.kg_lab > 0 ? formatKg(t.kg_lab) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono text-xs text-orange-600 dark:text-orange-400">
                              {t.kg_prod > 0 ? formatKg(t.kg_prod) : <span className="text-muted-foreground">—</span>}
                            </td>
                          </>}
                          <td className="py-2 text-right text-muted-foreground text-xs font-mono">{fmtPct(t.percentual)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold text-xs">
                        <td colSpan={3} className="py-2 pr-3 text-muted-foreground">Total</td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {formatKg(relatorioAberto?.total_kg ?? 0)}
                        </td>
                        {isAmbos && <>
                          <td className="py-2 pr-3 text-right font-mono text-blue-600 dark:text-blue-400">
                            {formatKg(linhasDisplay.reduce((s, t) => s + t.kg_lab, 0))}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-orange-600 dark:text-orange-400">
                            {formatKg(linhasDisplay.reduce((s, t) => s + t.kg_prod, 0))}
                          </td>
                        </>}
                        <td className="py-2 text-right text-muted-foreground">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t mt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => relatorioAberto && exportarRelatorioSalvoCSV(relatorioAberto, itensAbertos)}
              disabled={carregandoItens || itensAbertos.length === 0}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setRelatorioAberto(null); setItensAbertos([]); }}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Pivot: agrupa linhas por MP para exibição quando setor = 'ambos' ──────────

function pivotarItens(itens: RelatorioSalvoItem[]): RelatorioSalvoItemDisplay[] {
  const map = new Map<string, RelatorioSalvoItemDisplay>();
  for (const item of itens) {
    const key = item.cod_mp_excel;
    if (!map.has(key)) {
      map.set(key, {
        cod_mp_excel: item.cod_mp_excel,
        cod_tid: item.cod_tid,
        materia_prima: item.materia_prima,
        total_kg: 0,
        kg_lab: 0,
        kg_prod: 0,
        percentual: 0,
      });
    }
    const entry = map.get(key)!;
    entry.total_kg += item.total_kg;
    entry.percentual += item.percentual;
    if (item.setor === 'laboratorio') entry.kg_lab += item.total_kg;
    else if (item.setor === 'producao') entry.kg_prod += item.total_kg;
  }
  return Array.from(map.values()).sort((a, b) => b.total_kg - a.total_kg);
}

// ── Utilitário CSV ─────────────────────────────────────────────────────────────

function downloadCsv(rows: (string | number)[][], filename: string) {
  const csv = '\ufeff' + rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
