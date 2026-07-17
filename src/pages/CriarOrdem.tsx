import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';
import { Save, Loader2, Search, AlertTriangle, PackageSearch, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useFormula } from '@/hooks/useFormula';
import { formatKg } from '@/lib/utils';
import { getNextPosicao } from '@/lib/recalcularPosicoes';

interface LoteDisponivel {
  lote: number;
  produto: string;
  quantidade: number;
}

// ── Tipos do comparador TID × Excel ──────────────────────────────────────────

interface ComparatorDiffRow {
  materia_prima: string;
  pct_tid: number | null;   // % na escala TID (0–100), null = só no Excel
  pct_excel: number | null; // % na escala TID (excel×100), null = só no TID
  isDiff: boolean;
}

interface ComparatorMpProblem {
  cod_mp: string;
  materia_prima: string;
  motivo: 'sem_depara' | 'ambiguo';
}

type ComparatorStatus = 'idle' | 'loading' | 'ok' | 'divergente' | 'sem_depara' | 'sem_formula_excel';

interface ComparatorState {
  status: ComparatorStatus;
  rows?: ComparatorDiffRow[];
  nDiffs?: number;
  problems?: ComparatorMpProblem[];
}

const COMPARATOR_IDLE: ComparatorState = { status: 'idle' };

const ordemSchema = z.object({
  lote: z.string().trim().min(1, 'Lote é obrigatório').max(50),
  produto: z.string().trim().min(1, 'Produto é obrigatório').max(200),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva').max(999999),
  linha: z.string().min(1, 'Selecione a linha'),
  balanca: z.string().min(1, 'Selecione a balança'),
  marca: z.string().min(1, 'Selecione a marca'),
});

type OrdemFormValues = z.infer<typeof ordemSchema>;

// ── Sub-componente: painel do comparador ─────────────────────────────────────

function ComparatorPanel({ state }: { state: ComparatorState }) {
  const { status, rows, nDiffs, problems } = state;

  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Comparando com fórmula do Excel…
      </div>
    );
  }

  if (status === 'sem_formula_excel') {
    return (
      <p className="text-xs text-muted-foreground">
        ○ Produto sem fórmula no Excel — vinculação pendente no lab.
      </p>
    );
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Fórmula confere — TID e Excel idênticos
      </div>
    );
  }

  if (status === 'sem_depara') {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/20">
          <HelpCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">
            Não foi possível comparar — {problems!.length} MP{problems!.length !== 1 ? 's' : ''} sem de-para
          </span>
        </div>
        <ul className="px-3 py-2 space-y-0.5">
          {problems!.map((p) => (
            <li key={p.cod_mp} className="text-xs text-amber-900 dark:text-amber-300">
              <span className="font-mono">{p.cod_mp}</span> · {p.materia_prima}
              {p.motivo === 'ambiguo' && <span className="ml-1 text-amber-600">(cod_tid ambíguo)</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // status === 'divergente'
  return (
    <div className="rounded-md border border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-red-200 dark:border-red-800 bg-red-100/60 dark:bg-red-900/20">
        <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
        <span className="text-xs font-semibold text-red-800 dark:text-red-400">
          Fórmula diverge do Excel — {nDiffs} diferença{nDiffs !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="max-h-52 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground bg-red-50 dark:bg-red-950/30 sticky top-0">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Matéria-Prima</th>
              <th className="text-right px-3 py-1.5 font-medium w-16">% TID</th>
              <th className="text-right px-3 py-1.5 font-medium w-16">% Excel</th>
              <th className="text-right px-3 py-1.5 font-medium w-16">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {rows!.map((r, i) => {
              const diff = r.pct_tid !== null && r.pct_excel !== null
                ? r.pct_tid - r.pct_excel : null;
              return (
                <tr
                  key={i}
                  className={`border-t ${r.isDiff
                    ? 'bg-red-100/70 dark:bg-red-900/20 text-red-900 dark:text-red-300 font-medium'
                    : 'text-muted-foreground'}`}
                >
                  <td className="px-3 py-1 truncate max-w-[180px]">{r.materia_prima}</td>
                  <td className="px-3 py-1 text-right font-mono">
                    {r.pct_tid !== null ? r.pct_tid.toFixed(2) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-1 text-right font-mono">
                    {r.pct_excel !== null ? r.pct_excel.toFixed(2) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-1 text-right font-mono">
                    {diff !== null
                      ? <span className={Math.abs(diff) > 0.01 ? 'text-red-600' : ''}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                        </span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CriarOrdemProps {
  prefillLote?: number;
  onPrefillConsumed?: () => void;
}

export default function CriarOrdem({ prefillLote, onPrefillConsumed }: CriarOrdemProps = {}) {
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [loteEncontrado, setLoteEncontrado] = useState<boolean | null>(null);
  const [loteJaTemOP, setLoteJaTemOP] = useState(false);
  const [semFormula, setSemFormula] = useState(false);
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [tamanhoBatelada, setTamanhoBatelada] = useState<number | null>(null);
  const [obsItems, setObsItems] = useState([
    { qty: '', mp: '' },
    { qty: '', mp: '' },
    { qty: '', mp: '' },
    { qty: '', mp: '' },
  ]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [tipoOp, setTipoOp] = useState<'venda' | 'estoque'>('venda');
  const [requerMistura, setRequerMistura] = useState(true);
  const [orientacoes, setOrientacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState<string>(new Date().toISOString().split("T")[0]);
  const [dataProgramacao, setDataProgramacao] = useState<string>(new Date().toISOString().split("T")[0]);
  const [lotesDisponiveis, setLotesDisponiveis] = useState<LoteDisponivel[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [buscaLote, setBuscaLote] = useState('');
  const [comparator, setComparator] = useState<ComparatorState>(COMPARATOR_IDLE);

  const { itens, loading: loadingFormula, error: erroFormula, setQuantidade } = useFormula(formulaId, tamanhoBatelada);

  const form = useForm<OrdemFormValues>({
    resolver: zodResolver(ordemSchema),
    defaultValues: { lote: '', produto: '', quantidade: 0, linha: '', balanca: '', marca: '' },
  });

  const fetchLotesDisponiveis = useCallback(async () => {
    setLoadingLotes(true);
    const { data: lotes } = await (supabase as any)
      .from('cadastro_lotes')
      .select('lote, produto, quantidade')
      .eq('status', 'Em Aberto')
      .order('lote', { ascending: true });

    if (!lotes || lotes.length === 0) {
      setLotesDisponiveis([]);
      setLoadingLotes(false);
      return;
    }

    // Busca apenas ordens cujo lote está na lista em aberto — evita trazer toda a tabela
    const loteNums = lotes.map((l: any) => String(l.lote));
    const { data: ordensExistentes } = await (supabase as any)
      .from('ordens')
      .select('lote')
      .in('lote', loteNums);

    const lotesComOP = new Set((ordensExistentes ?? []).map((o: any) => String(o.lote)));
    setLotesDisponiveis(lotes.filter((l: any) => !lotesComOP.has(String(l.lote))));
    setLoadingLotes(false);
  }, []);

  useEffect(() => { fetchLotesDisponiveis(); }, [fetchLotesDisponiveis]);

  const buscarLote = useCallback(async (loteOverride?: number) => {
    const loteStr = loteOverride !== undefined ? String(loteOverride) : form.getValues('lote').trim();
    const loteNum = Number(loteStr.replace(/\./g, ''));
    if (!loteStr || isNaN(loteNum) || loteNum <= 0) return;
    if (loteOverride !== undefined) form.setValue('lote', loteStr);

    setBuscando(true);
    setLoteEncontrado(null);
    setLoteJaTemOP(false);
    setSemFormula(false);
    setNomes({});
    setComparator(COMPARATOR_IDLE);

    const [{ data, error }, { data: ordemExistente }] = await Promise.all([
      supabase.from('cadastro_lotes').select('*').eq('lote', loteNum).single(),
      supabase.from('ordens').select('id').eq('lote', loteStr).maybeSingle(),
    ]);

    setBuscando(false);

    if (ordemExistente) {
      setLoteEncontrado(false);
      setLoteJaTemOP(true);
      toast({ title: 'Este lote já possui uma OP criada.', variant: 'destructive' });
      return;
    }

    if (error || !data) {
      setLoteEncontrado(false);
      toast({ title: 'Lote não encontrado no cadastro', variant: 'destructive' });
      return;
    }

    form.setValue('produto', data.produto);
    form.setValue('quantidade', data.quantidade);
    setFormulaId(data.formula_id ?? null);
    setTamanhoBatelada(data.tamanho_batelada ?? null);
    setSemFormula(!data.formula_id);
    setLoteEncontrado(true);

    if (data.formula_id) {
      const { data: formulaData } = await supabase
        .from('formulas')
        .select('orientacoes')
        .eq('id', data.formula_id)
        .single();
      setOrientacoes((formulaData as any)?.orientacoes ?? '');
    } else {
      setOrientacoes('');
    }

    toast({ title: 'Lote encontrado!', description: data.produto });
    onPrefillConsumed?.();
  }, [form, onPrefillConsumed]);

  useEffect(() => {
    if (prefillLote) buscarLote(prefillLote);
  }, [prefillLote, buscarLote]);

  // ── Comparador TID × Excel ────────────────────────────────────────────────
  const runComparison = useCallback(async (fid: string) => {
    setComparator({ status: 'loading' });
    try {
      // 1. Buscar itens da fórmula no Excel
      const { data: excelItens } = await (supabase as any)
        .from('formulas_excel')
        .select('cod_mp_excel, materia_prima, percentual')
        .eq('formula_id', fid);

      if (!excelItens || excelItens.length === 0) {
        setComparator({ status: 'sem_formula_excel' });
        return;
      }

      // 2. Buscar itens do TID com cod_mp
      const { data: tidItens } = await (supabase as any)
        .from('formulas')
        .select('cod_mp, materia_prima, percentual')
        .eq('formula_id', fid)
        .order('sequencia', { ascending: true });

      if (!tidItens || tidItens.length === 0) {
        setComparator({ status: 'sem_formula_excel' });
        return;
      }

      // 3. Buscar de-para (só MPs com cod_tid preenchido)
      const { data: depara } = await (supabase as any)
        .from('mp_depara')
        .select('cod_excel, cod_tid')
        .not('cod_tid', 'is', null);

      // 4. Montar mapa cod_tid → cod_excel[] (detecta ambiguidade)
      const tidToExcel = new Map<string, string[]>();
      for (const row of depara ?? []) {
        if (!row.cod_tid) continue;
        if (!tidToExcel.has(row.cod_tid)) tidToExcel.set(row.cod_tid, []);
        tidToExcel.get(row.cod_tid)!.push(row.cod_excel);
      }

      // 5. Traduzir cod_mp do TID para cod_excel
      const problems: ComparatorMpProblem[] = [];
      const translated: { cod_excel: string; materia_prima: string; percentual: number }[] = [];

      for (const item of tidItens) {
        const excels = tidToExcel.get(item.cod_mp);
        if (!excels || excels.length === 0) {
          problems.push({ cod_mp: item.cod_mp, materia_prima: item.materia_prima, motivo: 'sem_depara' });
        } else if (excels.length > 1) {
          problems.push({ cod_mp: item.cod_mp, materia_prima: item.materia_prima, motivo: 'ambiguo' });
        } else {
          translated.push({ cod_excel: excels[0], materia_prima: item.materia_prima, percentual: item.percentual });
        }
      }

      if (problems.length > 0) {
        setComparator({ status: 'sem_depara', problems });
        return;
      }

      // 6. Comparar percentuais (Excel × 100 para igualar escala do TID)
      const excelByCode = new Map<string, { pct: number; nome: string }>();
      for (const item of excelItens) {
        excelByCode.set(item.cod_mp_excel, { pct: item.percentual * 100, nome: item.materia_prima });
      }
      const tidByCode = new Map<string, { materia_prima: string; percentual: number }>();
      for (const item of translated) {
        tidByCode.set(item.cod_excel, { materia_prima: item.materia_prima, percentual: item.percentual });
      }

      const allCodes = new Set([...tidByCode.keys(), ...excelByCode.keys()]);
      const rows: ComparatorDiffRow[] = [];
      let nDiffs = 0;

      for (const code of allCodes) {
        const t = tidByCode.get(code);
        const e = excelByCode.get(code);
        const pct_tid = t?.percentual ?? null;
        const pct_excel = e?.pct ?? null;
        const isDiff = pct_tid === null || pct_excel === null
          || Math.abs(pct_tid - pct_excel) > 0.01;
        if (isDiff) nDiffs++;
        rows.push({
          materia_prima: t?.materia_prima ?? e!.nome,
          pct_tid,
          pct_excel,
          isDiff,
        });
      }

      // Diferenças primeiro, depois itens que conferem
      rows.sort((a, b) => (b.isDiff ? 1 : 0) - (a.isDiff ? 1 : 0));

      setComparator(nDiffs > 0
        ? { status: 'divergente', rows, nDiffs }
        : { status: 'ok' }
      );
    } catch {
      setComparator(COMPARATOR_IDLE); // falha silenciosa — não bloqueia a OP
    }
  }, []);

  useEffect(() => {
    if (!formulaId || loteEncontrado !== true) return;
    runComparison(formulaId);
  }, [formulaId, loteEncontrado, runComparison]);

  const onSubmit = async (values: OrdemFormValues) => {
    setSaving(true);

    const linhaNum = parseInt(values.linha);
    const posicao = await getNextPosicao(linhaNum);

    const { data: novaOrdem, error } = await supabase
      .from('ordens')
      .insert({
        lote: values.lote,
        produto: values.produto,
        quantidade: values.quantidade,
        linha: linhaNum,
        balanca: parseInt(values.balanca),
        status: 'pendente',
        posicao,
        data_programacao: dataProgramacao || format(new Date(), 'yyyy-MM-dd'),
        formula_id: formulaId,
        tamanho_batelada: tamanhoBatelada,
        marca: values.marca || null,
        tipo_op: tipoOp,
        obs: (() => {
          const filled = obsItems
            .filter((r) => r.mp.trim() || r.qty.trim())
            .map((r) => ({ qty: parseInt(r.qty) || 0, mp: r.mp.trim() }));
          return filled.length > 0 ? JSON.stringify(filled) : null;
        })(),
        requer_mistura: requerMistura,
        orientacoes: orientacoes.trim() || null,
        data_emissao: dataEmissao || null,
      } as any)
      .select()
      .single();

    if (error || !novaOrdem) {
      setSaving(false);
      toast({ title: 'Erro ao salvar', description: error?.message, variant: 'destructive' });
      return;
    }

    // Update orientacoes on formulas table for future orders
    if (formulaId) {
      await supabase
        .from('formulas')
        .update({ orientacoes: orientacoes.trim() || null } as any)
        .eq('id', formulaId);
    }

    // Save customized formula quantities if the gestor edited them
    if (itens.length > 0) {
      await supabase.from('ordens_formula').insert(
        itens.map((item) => ({
          ordem_id: (novaOrdem as any).id,
          sequencia: item.sequencia,
          materia_prima: nomes[item.id] ?? item.materia_prima,
          quantidade_kg: item.quantidade_kg,
        }))
      );
    }

    // Sync data_emissao back to cadastro_lotes so PainelProgramacao can read it
    const loteNum = Number(values.lote.replace(/\./g, ''));
    if (loteNum > 0 && dataEmissao) {
      await (supabase as any)
        .from('cadastro_lotes')
        .update({ data_emissao: dataEmissao })
        .eq('lote', loteNum);
    }


    setSaving(false);
    toast({ title: 'Ordem criada com sucesso!' });
    fetchLotesDisponiveis();
    form.reset({ lote: '', produto: '', quantidade: 0, linha: '', balanca: '', marca: '' });
    setLoteEncontrado(null);
    setFormulaId(null);
    setComparator(COMPARATOR_IDLE);
    setTamanhoBatelada(null);
    setSemFormula(false);
    setObsItems([{ qty: '', mp: '' }, { qty: '', mp: '' }, { qty: '', mp: '' }, { qty: '', mp: '' }]);
    setNomes({});
    setRequerMistura(true);
    setTipoOp('venda');
    setOrientacoes('');
    setDataEmissao(new Date().toISOString().split("T")[0]);
  };

  const lotesFiltrados = lotesDisponiveis.filter((l) =>
    !buscaLote.trim() ||
    l.produto.toLowerCase().includes(buscaLote.toLowerCase()) ||
    String(l.lote).includes(buscaLote.trim())
  );

  return (
    <div className="max-w-full space-y-6">
      <h1 className="text-2xl font-bold">Criar Nova Ordem</h1>

      <div className="flex gap-4 items-start">
        {/* ── Coluna esquerda: formulário ── */}
        <div className="flex-1 min-w-0 bg-card rounded-lg border p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">

            {/* Lote + Produto */}
            <div className="flex gap-2 items-end">
              <FormField control={form.control} name="lote" render={({ field }) => (
                <FormItem className="w-36 shrink-0">
                  <FormLabel className="text-xs">Lote</FormLabel>
                  <div className="flex gap-1">
                    <FormControl>
                      <Input className="h-8 text-sm" placeholder="31706" {...field}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarLote())} />
                    </FormControl>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => buscarLote()} disabled={buscando}>
                      {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="produto" render={({ field }) => (
                <FormItem className="flex-1 min-w-0">
                  <FormLabel className="text-xs">Produto</FormLabel>
                  <FormControl><Input className="h-8 text-sm" placeholder="Nome do produto" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Feedback do lote */}
            {(loteEncontrado !== null || semFormula) && (
              <div className="space-y-1">
                {loteEncontrado === true && <p className="text-xs text-green-600">✓ Preenchido automaticamente</p>}
                {loteJaTemOP && <p className="text-xs text-destructive font-medium">⚠ Este lote já possui uma OP criada.</p>}
                {loteEncontrado === false && !loteJaTemOP && <p className="text-xs text-muted-foreground">Lote não encontrado — preencha manualmente</p>}
                {semFormula && (
                  <div className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-800">Sem fórmula cadastrada — OP será salva sem matérias-primas.</p>
                  </div>
                )}
              </div>
            )}

            {/* Quantidade + Batelada + Datas */}
            <div className="grid grid-cols-4 gap-2">
              <FormField control={form.control} name="quantidade" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Qtd (kg)</FormLabel>
                  <FormControl><Input className="h-8 text-sm" type="number" onWheel={(e) => e.currentTarget.blur()} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {loteEncontrado === true && (
                <div>
                  <label className="text-xs font-medium">Batelada (kg)</label>
                  <Input className="h-8 text-sm mt-1" type="number" value={tamanhoBatelada ?? ''}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setTamanhoBatelada(e.target.value ? Number(e.target.value) : null)} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium">Dt. Emissão</label>
                <Input className="h-8 text-sm mt-1" type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium">Dt. Programação</label>
                <Input className="h-8 text-sm mt-1" type="date" value={dataProgramacao} onChange={(e) => setDataProgramacao(e.target.value)} />
              </div>
            </div>

            {/* Linha + Balança + Marca + Requer Mistura */}
            <div className="grid grid-cols-4 gap-2 items-end">
              <FormField control={form.control} name="linha" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Linha</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>Linha {n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="balanca" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Balança</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="1">Balança 1</SelectItem>
                      <SelectItem value="2">Balança 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="marca" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Marca</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Pigma">Pigma</SelectItem>
                      <SelectItem value="Zan Collor">Zan Collor</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex items-center justify-between rounded-md border px-2 py-1.5 h-8">
                <span className="text-xs font-medium">Mistura</span>
                <button type="button" role="switch" aria-checked={requerMistura}
                  onClick={() => setRequerMistura((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${requerMistura ? 'bg-primary' : 'bg-input'}`}>
                  <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${requerMistura ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Tipo de OP */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium shrink-0">Tipo de OP:</span>
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setTipoOp('venda')}
                  className={`px-3 py-1 transition-colors ${tipoOp === 'venda' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                  Venda
                </button>
                <button
                  type="button"
                  onClick={() => setTipoOp('estoque')}
                  className={`px-3 py-1 border-l transition-colors ${tipoOp === 'estoque' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                >
                  Estoque
                </button>
              </div>
            </div>

            {/* Fórmula */}
            {loteEncontrado === true && (
              <div className="space-y-2">
                {formulaId && <p className="text-xs text-muted-foreground">Fórmula: <span className="font-medium text-foreground">{formulaId}</span></p>}
                {loadingFormula && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando...</div>}
                {erroFormula && <p className="text-xs text-destructive">{erroFormula}</p>}

                {itens.length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="text-left px-2 py-1 w-px">#</th>
                          <th className="text-left px-2 py-1">Matéria-Prima</th>
                          <th className="text-left px-2 py-1 w-px">Un</th>
                          <th className="text-right px-2 py-1 w-px">%</th>
                          <th className="text-right px-2 py-1 w-px">kg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-2 py-1 text-muted-foreground w-px">{item.sequencia ?? '-'}</td>
                            <td className="px-2 py-1">
                              <textarea value={nomes[item.id] ?? item.materia_prima}
                                onChange={(e) => { setNomes((prev) => ({ ...prev, [item.id]: e.target.value })); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                rows={1}
                                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                                className="w-full rounded border border-transparent bg-transparent px-1 py-0 text-xs resize-none overflow-hidden hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-ring" />
                            </td>
                            <td className="px-2 py-1 text-muted-foreground w-px">{item.unidade ?? '-'}</td>
                            <td className="px-2 py-1 text-right text-muted-foreground w-px">{item.percentual}%</td>
                            <td className="px-2 py-1 w-px">
                              <Input type="number" value={item.quantidade_kg} onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) => setQuantidade(item.id, Number(e.target.value))}
                                className="h-6 w-20 text-right ml-auto text-xs" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t">
                          <td colSpan={4} className="px-2 py-1 text-xs text-muted-foreground/60 text-right">total</td>
                          <td className="px-2 py-1 text-right text-xs text-muted-foreground/60">{formatKg(itens.reduce((s, i) => s + (i.quantidade_kg || 0), 0))} kg</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* ── Comparador TID × Excel ── */}
                <ComparatorPanel state={comparator} />

                <div>
                  <label className="text-xs font-medium">Orientações para Produção</label>
                  <textarea value={orientacoes} onChange={(e) => setOrientacoes(e.target.value)} rows={2}
                    placeholder="Instruções especiais (opcional)"
                    className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>
            )}

            {/* Adições para mistura */}
            <div>
              <label className="text-xs font-medium">Adições para Mistura</label>
              <div className="mt-1 space-y-1">
                {obsItems.map((row, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <input type="text" inputMode="numeric" value={row.qty}
                      onChange={(e) => { const val = e.target.value.replace(/[^0-9]/g, ''); setObsItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r)); }}
                      placeholder="0"
                      className="w-12 rounded-md border border-input bg-background px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-ring" />
                    <span className="text-xs font-semibold text-muted-foreground">x</span>
                    <input type="text" value={row.mp}
                      onChange={(e) => setObsItems((prev) => prev.map((r, j) => j === i ? { ...r, mp: e.target.value.toUpperCase() } : r))}
                      placeholder="Matéria-Prima"
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Ordem
            </Button>
          </form>
        </Form>
        </div>

        {/* ── Coluna direita: lotes disponíveis ── */}
        <div className="w-80 shrink-0 bg-card rounded-lg border overflow-hidden sticky top-4">
          <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-semibold text-sm">Lotes sem OP</h3>
            </div>
            {!loadingLotes && (
              <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5 shrink-0">
                {lotesFiltrados.length}
              </span>
            )}
          </div>

          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar lote ou produto..."
                value={buscaLote}
                onChange={(e) => setBuscaLote(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
            {loadingLotes ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : lotesFiltrados.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                {buscaLote ? 'Nenhum lote encontrado.' : 'Nenhum lote pendente.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b sticky top-0 bg-card">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Lote</th>
                    <th className="text-left px-3 py-2 font-medium">Produto</th>
                    <th className="text-right px-3 py-2 font-medium">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {lotesFiltrados.map((l) => (
                    <tr
                      key={l.lote}
                      onClick={() => {
                        form.setValue('lote', String(l.lote));
                        buscarLote(l.lote);
                      }}
                      className="border-b last:border-0 hover:bg-primary/5 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 font-mono font-semibold">{l.lote}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate text-muted-foreground">{l.produto}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{l.quantidade.toLocaleString('pt-BR')} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
