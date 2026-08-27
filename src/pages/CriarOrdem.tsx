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
import { Save, Loader2, Search, AlertTriangle, PackageSearch, Copy, Info } from 'lucide-react';
import { useFormula } from '@/hooks/useFormula';
import { formatKg } from '@/lib/utils';
import { compararFormulas, type ResultadoComparacao } from '@/lib/compararFormulas';
import { ComparatorPanel } from '@/components/ComparatorPanel';
import { baixarEstoqueOP, verificarEstoqueOP, type MpFaltante } from '@/lib/estoqueUtils';
import { useAuth } from '@/hooks/useAuth';

interface LoteDisponivel {
  lote: number;
  produto: string;
  quantidade: number;
}

interface SdrAlerta {
  id: string;
  codigo: string;
  produto_origem: string | null;
  quantidade_material: number;
  quantidade_utilizada: number | null;
  percentual_reaproveitado: number | null;
  criado_em: string;
}

interface AcertoEnriquecido {
  id: string;
  cod_tid: string;
  materia_prima: string;
  quantidade_kg: number;
  observacao: string | null;
  acerto_lote: string | null;
  data_retirada: string;
  // enriquecimento calculado
  op_quantidade: number | null;
  na_formula: boolean;
  pct_base: number | null;
  kg_base: number | null;
  pct_real: number | null;
  kg_real: number | null;
}

function calcProducaoSdr(sdr: SdrAlerta): number | null {
  const qtd = sdr.quantidade_utilizada ?? sdr.quantidade_material;
  const pct = sdr.percentual_reaproveitado;
  if (!pct || pct <= 0 || !qtd || qtd <= 0) return null;
  return qtd / (pct / 100);
}

function diasParado(iso: string): number {
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00Z');
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}


const ordemSchema = z.object({
  lote: z.string().trim().min(1, 'Lote é obrigatório').max(50),
  produto: z.string().trim().min(1, 'Produto é obrigatório').max(200),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva').max(999999),
  marca: z.string().min(1, 'Selecione a marca'),
});

type OrdemFormValues = z.infer<typeof ordemSchema>;


interface CriarOrdemProps {
  prefillLote?: number;
  onPrefillConsumed?: () => void;
}

export default function CriarOrdem({ prefillLote, onPrefillConsumed }: CriarOrdemProps = {}) {
  const { perfil } = useAuth();
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
  const [lotesDisponiveis, setLotesDisponiveis] = useState<LoteDisponivel[]>([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const [buscaLote, setBuscaLote] = useState('');
  const [comparator, setComparator] = useState<ResultadoComparacao | null>(null);
  const [comparatorLoading, setComparatorLoading] = useState(false);
  const [sdrsAlerta, setSdrsAlerta] = useState<SdrAlerta[]>([]);
  const [acertosEnriquecidos, setAcertosEnriquecidos] = useState<AcertoEnriquecido[]>([]);
  const [mpsFaltantes, setMpsFaltantes] = useState<MpFaltante[] | null>(null);
  const [valuesParaForcar, setValuesParaForcar] = useState<OrdemFormValues | null>(null);

  const { itens, loading: loadingFormula, error: erroFormula, setQuantidade, setItens } = useFormula(formulaId, tamanhoBatelada);
  const [itensSdrId, setItensSdrId] = useState<string | null>(null);
  const [copiandoSdr, setCopiandoSdr] = useState(false);

  const form = useForm<OrdemFormValues>({
    resolver: zodResolver(ordemSchema),
    defaultValues: { lote: '', produto: '', quantidade: 0, marca: '' },
  });

  const fetchLotesDisponiveis = useCallback(async () => {
    setLoadingLotes(true);
    // 1) Busca apenas os lotes em aberto
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

    // 2) Busca ordens filtradas somente pelos lotes em aberto (query pequena)
    const loteStrs = (lotes as any[]).map((l) => String(l.lote));
    const { data: ordensExistentes } = await (supabase as any)
      .from('ordens')
      .select('lote')
      .in('lote', loteStrs);

    const lotesComOP = new Set((ordensExistentes ?? []).map((o: any) => String(o.lote)));
    setLotesDisponiveis((lotes as any[]).filter((l) => !lotesComOP.has(String(l.lote))));
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
    setComparator(null);
    setComparatorLoading(false);
    setSdrsAlerta([]);
    setAcertosEnriquecidos([]);
    setItensSdrId(null);

    const [{ data, error }, { data: ordemExistente }] = await Promise.all([
      supabase.from('cadastro_lotes').select('lote, produto, quantidade, formula_id, tamanho_batelada').eq('lote', loteNum).single(),
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
    setOrientacoes(''); // será preenchido pelo useEffect abaixo
    setLoteEncontrado(true);

    toast({ title: 'Lote encontrado!', description: data.produto });
    onPrefillConsumed?.();
  }, [form, onPrefillConsumed]);

  useEffect(() => {
    if (prefillLote) buscarLote(prefillLote);
  }, [prefillLote, buscarLote]);

  // ── Orientações: carrega em paralelo com os demais efeitos ───────────────
  useEffect(() => {
    if (!formulaId || loteEncontrado !== true) { setOrientacoes(''); return; }
    supabase
      .from('formulas')
      .select('orientacoes')
      .eq('id', formulaId)
      .single()
      .then(({ data }) => setOrientacoes((data as any)?.orientacoes ?? ''));
  }, [formulaId, loteEncontrado]);

  // ── Comparador TID × Excel ────────────────────────────────────────────────
  const runComparison = useCallback(async (fid: string) => {
    setComparatorLoading(true);
    setComparator(null);
    try {
      const resultado = await compararFormulas(fid);
      setComparator(resultado);
    } catch {
      // falha silenciosa — não bloqueia a OP
    } finally {
      setComparatorLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!formulaId || loteEncontrado !== true) return;
    runComparison(formulaId);
  }, [formulaId, loteEncontrado, runComparison]);

  // ── Copiar fórmula do SDR ────────────────────────────────────────────────
  const copiarFormulaSdr = useCallback(async (sdr: SdrAlerta) => {
    if (itens.length > 0 && !window.confirm('Isso vai substituir a fórmula atual da OP. Continuar?')) return;

    setCopiandoSdr(true);
    const { data: itensData, error } = await (supabase as any)
      .from('reaproveitamentos_itens')
      .select('id, sequencia, materia_prima, cod_mp_excel, percentual')
      .eq('reaproveitamento_id', sdr.id)
      .order('sequencia', { ascending: true });
    setCopiandoSdr(false);

    if (error || !itensData) return;

    const batelada = tamanhoBatelada ?? 0;
    const novosItens: import('@/hooks/useFormula').FormulaItem[] = [];

    // Linha do material reaproveitado
    if (sdr.percentual_reaproveitado && sdr.percentual_reaproveitado > 0) {
      novosItens.push({
        id: `sdr-reapr-${sdr.id}`,
        sequencia: 0,
        materia_prima: sdr.produto_origem?.trim() || 'Material reaproveitado',
        fornecedor: null,
        unidade: null,
        percentual: sdr.percentual_reaproveitado,
        quantidade_kg: parseFloat(((sdr.percentual_reaproveitado / 100) * batelada).toFixed(3)),
      });
    }

    // Itens adicionais
    for (const item of itensData) {
      novosItens.push({
        id: `sdr-item-${item.id}`,
        sequencia: item.sequencia,
        materia_prima: item.materia_prima,
        fornecedor: null,
        unidade: null,
        percentual: item.percentual,
        quantidade_kg: parseFloat(((item.percentual / 100) * batelada).toFixed(3)),
      });
    }

    setItens(novosItens);
    setNomes({});
    setItensSdrId(sdr.id);
  }, [itens.length, tamanhoBatelada, setItens]);

  useEffect(() => {
    if (!formulaId || loteEncontrado !== true) { setSdrsAlerta([]); return; }
    (supabase as any)
      .from('reaproveitamentos')
      .select('id, codigo, produto_origem, quantidade_material, quantidade_utilizada, percentual_reaproveitado, criado_em')
      .eq('formula_id_destino', formulaId)
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true })
      .then(({ data }: any) => setSdrsAlerta(data ?? []));
  }, [formulaId, loteEncontrado]);

  useEffect(() => {
    if (!formulaId || loteEncontrado !== true) { setAcertosEnriquecidos([]); return; }
    let cancelled = false;
    (async () => {
      // 1. Acertos para esta fórmula
      const { data: acertosRaw } = await (supabase as any)
        .from('consumo_mp')
        .select('id, cod_tid, materia_prima, quantidade_kg, observacao, acerto_lote, data_retirada')
        .eq('eh_acerto', true)
        .eq('acerto_formula_id', formulaId)
        .order('data_retirada', { ascending: false })
        .limit(20);

      if (cancelled) return;
      if (!acertosRaw || acertosRaw.length === 0) { setAcertosEnriquecidos([]); return; }

      const lotes = [...new Set((acertosRaw as any[]).map((a: any) => a.acerto_lote).filter(Boolean))];

      const [formulaItensResult, ordensResult] = await Promise.all([
        supabase.from('formulas').select('cod_mp, materia_prima, percentual').eq('formula_id', formulaId),
        lotes.length > 0
          ? supabase.from('ordens').select('lote, quantidade').in('lote', lotes)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      if (cancelled) return;

      const formulaItens = (formulaItensResult.data ?? []) as { cod_mp: string; materia_prima: string; percentual: number }[];

      const opQtdMap = new Map<string, number>();
      for (const o of (ordensResult.data ?? [])) opQtdMap.set(String(o.lote), (o as any).quantidade);

      // Enriquecer cada acerto
      const enriched: AcertoEnriquecido[] = (acertosRaw as any[]).map((ac) => {
        // Tentar casar por cod_mp (TID) diretamente, depois por nome
        let matched = ac.cod_tid ? formulaItens.find(i => i.cod_mp === ac.cod_tid) : undefined;
        if (!matched) {
          const desc = (ac.materia_prima as string).toLowerCase().trim();
          matched = formulaItens.find(i => i.materia_prima.toLowerCase().trim() === desc)
                 ?? formulaItens.find(i => {
                   const fm = i.materia_prima.toLowerCase().trim();
                   return fm.includes(desc.slice(0, 8)) || desc.includes(fm.slice(0, 8));
                 });
        }

        const op_quantidade = ac.acerto_lote ? opQtdMap.get(String(ac.acerto_lote)) ?? null : null;
        const podeCalc = matched && op_quantidade && op_quantidade > 0;

        if (!podeCalc) {
          return { ...ac, op_quantidade, na_formula: !!matched, pct_base: null, kg_base: null, pct_real: null, kg_real: null };
        }

        const pct_base = matched!.percentual;
        const kg_base = (pct_base / 100) * op_quantidade!;
        const kg_real = kg_base + ac.quantidade_kg;
        const pct_real = (kg_real / op_quantidade!) * 100;
        return { ...ac, op_quantidade, na_formula: true, pct_base, kg_base, pct_real, kg_real };
      });

      if (!cancelled) setAcertosEnriquecidos(enriched);
    })();
    return () => { cancelled = true; };
  }, [formulaId, loteEncontrado]);

  const criarOrdem = async (values: OrdemFormValues) => {
    setSaving(true);

    const { data: novaOrdem, error } = await supabase
      .from('ordens')
      .insert({
        lote: values.lote,
        produto: values.produto,
        quantidade: values.quantidade,
        status: 'pre_programacao',
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

    const ordemId = (novaOrdem as any).id;
    const loteNum = Number(values.lote.replace(/\./g, ''));

    // Tudo que não bloqueia o UX roda em paralelo após o insert
    await Promise.all([
      // Baixa automática de estoque
      formulaId
        ? baixarEstoqueOP(ordemId, formulaId, values.quantidade, values.lote, perfil?.nome).catch((err: any) => {
            toast({ title: 'Aviso: falha ao baixar estoque', description: err?.message ?? 'Erro desconhecido', variant: 'destructive' });
          })
        : Promise.resolve(),

      // Atualiza orientações na tabela formulas para futuras OPs
      formulaId
        ? supabase.from('formulas').update({ orientacoes: orientacoes.trim() || null } as any).eq('id', formulaId)
        : Promise.resolve(),

      // Salva itens customizados da fórmula (quando gestor ajustou quantidades)
      itens.length > 0
        ? supabase.from('ordens_formula').insert(
            itens.map((item) => ({
              ordem_id: ordemId,
              sequencia: item.sequencia,
              materia_prima: nomes[item.id] ?? item.materia_prima,
              quantidade_kg: item.quantidade_kg,
            }))
          )
        : Promise.resolve(),

      // Sincroniza data_emissao no cadastro_lotes
      loteNum > 0 && dataEmissao
        ? (supabase as any).from('cadastro_lotes').update({ data_emissao: dataEmissao }).eq('lote', loteNum)
        : Promise.resolve(),
    ]);

    setSaving(false);
    toast({ title: 'Ordem criada com sucesso! Acesse Pré-Programação para datá-la.' });
    fetchLotesDisponiveis();
    form.reset({ lote: '', produto: '', quantidade: 0, marca: '' });
    setLoteEncontrado(null);
    setFormulaId(null);
    setComparator(null);
    setComparatorLoading(false);
    setTamanhoBatelada(null);
    setSemFormula(false);
    setObsItems([{ qty: '', mp: '' }, { qty: '', mp: '' }, { qty: '', mp: '' }, { qty: '', mp: '' }]);
    setNomes({});
    setRequerMistura(true);
    setTipoOp('venda');
    setOrientacoes('');
    setDataEmissao(new Date().toISOString().split("T")[0]);
    setAcertosEnriquecidos([]);
  };

  const onSubmit = async (values: OrdemFormValues) => {
    if (formulaId) {
      try {
        const faltantes = await verificarEstoqueOP(formulaId, values.quantidade);
        if (faltantes.length > 0) {
          setMpsFaltantes(faltantes);
          setValuesParaForcar(values);
          return; // não cria — abre o dialog
        }
      } catch (e) {
        console.error('Falha ao verificar estoque', e); // fail-open
      }
    }
    await criarOrdem(values);
  };

  const forcarCriacao = async () => {
    if (!valuesParaForcar) return;
    const v = valuesParaForcar;
    setMpsFaltantes(null);
    setValuesParaForcar(null);
    await criarOrdem(v);
  };

  const lotesFiltrados = lotesDisponiveis.filter((l) =>
    !buscaLote.trim() ||
    l.produto.toLowerCase().includes(buscaLote.toLowerCase()) ||
    String(l.lote).includes(buscaLote.trim())
  );

  return (
    <div className="max-w-full space-y-6">
      <h1 className="text-2xl font-bold">Criar Nova Ordem</h1>
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2.5 text-xs text-blue-800 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>A OP criada vai para <strong>Pré-Programação</strong>. Data e linha são definidas lá, antes de entrar no kanban.</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* ── Coluna esquerda: formulário ── */}
        <div className="flex-1 min-w-0 w-full bg-card rounded-lg border p-4">
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

            {/* Quantidade + Batelada + Dt. Emissão */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <FormField control={form.control} name="quantidade" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Qtd (kg)</FormLabel>
                  <FormControl><Input className="h-8 text-sm" type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {loteEncontrado === true && (
                <div>
                  <label className="text-xs font-medium">Batelada (kg)</label>
                  <Input className="h-8 text-sm mt-1" type="number" inputMode="decimal" value={tamanhoBatelada ?? ''}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => { setTamanhoBatelada(e.target.value ? Number(e.target.value) : null); setItensSdrId(null); }} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium">Dt. Emissão</label>
                <Input className="h-8 text-sm mt-1" type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
              </div>
            </div>

            {/* Marca + Requer Mistura */}
            <div className="grid grid-cols-2 gap-2 items-end">
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
                {/* ── Alerta: SDRs pendentes para esta fórmula ── */}
                {sdrsAlerta.length > 0 && (
                  <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        Material reaproveitado pendente para este produto
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {sdrsAlerta.length === 1
                        ? 'Há 1 SDR pendente aguardando uso'
                        : `Há ${sdrsAlerta.length} SDRs pendentes aguardando uso`
                      } — considere reaproveitar antes de produzir do zero.
                    </p>
                    <div className="space-y-1.5">
                      {sdrsAlerta.map((sdr) => {
                        const prod = calcProducaoSdr(sdr);
                        const dias = diasParado(sdr.criado_em);
                        const jaCopiadoEste = itensSdrId === sdr.id;
                        return (
                          <div key={sdr.id} className="rounded border border-amber-300 dark:border-amber-700 bg-amber-100/70 dark:bg-amber-900/30 px-2 py-2 text-xs space-y-1.5">
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
                              <span className="font-mono font-bold text-amber-900 dark:text-amber-200">{sdr.codigo}</span>
                              <span className="text-amber-700 dark:text-amber-400">{formatKg(sdr.quantidade_material)} kg disponíveis</span>
                              {prod !== null && (
                                <span className="text-amber-700 dark:text-amber-400">produção prevista {formatKg(prod)} kg</span>
                              )}
                              <span className={`font-semibold ${dias > 30 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-500'}`}>
                                {dias}d parado
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => copiarFormulaSdr(sdr)}
                              disabled={copiandoSdr}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold transition-colors disabled:opacity-50"
                              style={jaCopiadoEste
                                ? { background: '#d97706', borderColor: '#b45309', color: '#fff' }
                                : { background: '#fef3c7', borderColor: '#d97706', color: '#92400e' }
                              }
                            >
                              {copiandoSdr
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Copy className="h-3 w-3" />
                              }
                              {jaCopiadoEste ? '✓ Fórmula copiada' : 'Copiar fórmula do reaproveitamento'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Alerta: acertos de material registrados para esta fórmula ── */}
                {acertosEnriquecidos.length > 0 && (
                  <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        {acertosEnriquecidos.length === 1
                          ? '1 acerto de material registrado para este produto'
                          : `${acertosEnriquecidos.length} acertos de material registrados para este produto`}
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Verifique se há saldo a descontar antes de incluir na fórmula desta OP.
                    </p>
                    <div className="space-y-1.5">
                      {acertosEnriquecidos.map((ac) => (
                        <div key={ac.id} className="rounded border border-amber-300 dark:border-amber-700 bg-amber-100/70 dark:bg-amber-900/30 px-2 py-2 text-xs space-y-1">
                          {/* Linha 1: material + acerto kg + data */}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-baseline">
                            <span className="font-semibold text-amber-900 dark:text-amber-200">{ac.materia_prima}</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">+{formatKg(ac.quantidade_kg)} kg (acerto)</span>
                            <span className="text-amber-500 dark:text-amber-600 ml-auto tabular-nums">
                              {ac.data_retirada.split('-').reverse().join('/')}
                            </span>
                          </div>
                          {/* Linha 2: lote da OP + quantidade + % a mais */}
                          {ac.acerto_lote && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline text-amber-600 dark:text-amber-500">
                              <span>Lote {ac.acerto_lote}</span>
                              {ac.op_quantidade && (
                                <span>(OP de {formatKg(ac.op_quantidade)} kg)</span>
                              )}
                              {ac.kg_base !== null && ac.kg_base > 0 ? (
                                <span>
                                  · adicionado <strong className="text-amber-700 dark:text-amber-300">+{((ac.quantidade_kg / ac.kg_base) * 100).toFixed(2)}%</strong> a mais deste item
                                </span>
                              ) : !ac.na_formula && ac.op_quantidade ? (
                                <span className="italic text-muted-foreground">não consta na fórmula base</span>
                              ) : null}
                            </div>
                          )}
                          {ac.observacao && (
                            <p className="text-amber-600 dark:text-amber-500 italic">{ac.observacao}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                              <Input type="number" inputMode="decimal" value={item.quantidade_kg} onWheel={(e) => e.currentTarget.blur()}
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

                {/* ── Soma dos percentuais quando fórmula veio de SDR ── */}
                {itensSdrId && itens.length > 0 && (() => {
                  const soma = itens.reduce((s, i) => s + i.percentual, 0);
                  const ok = Math.abs(soma - 100) <= 0.1;
                  return (
                    <p className={`text-xs font-medium ${ok ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {ok ? '✓' : '⚠'} Soma dos percentuais: {soma.toFixed(2)}%
                      {!ok && ' — verifique a fórmula do SDR'}
                    </p>
                  );
                })()}

                {/* ── Comparador TID × Excel ── */}
                <ComparatorPanel resultado={comparator} loading={comparatorLoading} />

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
        <div className="w-full lg:w-80 shrink-0 bg-card rounded-lg border overflow-hidden lg:sticky top-4">
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
      {/* ── Dialog: estoque insuficiente ── */}
      {mpsFaltantes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg mx-3 sm:mx-auto rounded-lg bg-background border shadow-lg p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h2 className="text-base font-semibold">Estoque insuficiente</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              As matérias-primas abaixo ficariam com saldo negativo após a baixa desta OP.
            </p>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Matéria-Prima</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo atual (kg)</th>
                    <th className="px-3 py-2 text-right font-medium">Consumo (kg)</th>
                    <th className="px-3 py-2 text-right font-medium">Ficaria (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {mpsFaltantes.map((mp) => (
                    <tr key={mp.cod_tid} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{mp.materia_prima}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatKg(mp.saldoAtual)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatKg(mp.consumo)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">
                        {formatKg(mp.saldoApos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => { setMpsFaltantes(null); setValuesParaForcar(null); }}
              >
                Cancelar
              </Button>
              {perfil?.papel === 'gestor' && (
                <Button variant="destructive" onClick={forcarCriacao} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Criar mesmo assim
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
