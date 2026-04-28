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
import { Save, Loader2, Search, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useFormula } from '@/hooks/useFormula';
import { formatKg } from '@/lib/utils';
import { recalcularPosicoes } from '@/lib/recalcularPosicoes';

const ordemSchema = z.object({
  lote: z.string().trim().min(1, 'Lote é obrigatório').max(50),
  produto: z.string().trim().min(1, 'Produto é obrigatório').max(200),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva').max(999999),
  linha: z.string().min(1, 'Selecione a linha'),
  balanca: z.string().min(1, 'Selecione a balança'),
  marca: z.string().min(1, 'Selecione a marca'),
});

type OrdemFormValues = z.infer<typeof ordemSchema>;

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
  const [requerMistura, setRequerMistura] = useState(true);
  const [orientacoes, setOrientacoes] = useState('');
  const [dataEmissao, setDataEmissao] = useState<string>(new Date().toISOString().split("T")[0]);

  const { itens, loading: loadingFormula, error: erroFormula, setQuantidade } = useFormula(formulaId, tamanhoBatelada);

  const form = useForm<OrdemFormValues>({
    resolver: zodResolver(ordemSchema),
    defaultValues: { lote: '', produto: '', quantidade: 0, linha: '', balanca: '', marca: '' },
  });

  const buscarLote = useCallback(async (loteOverride?: number) => {
    const loteStr = loteOverride !== undefined ? String(loteOverride) : form.getValues('lote').trim();
    const loteNum = Number(loteStr.replace(/\./g, ''));
    if (!loteStr || isNaN(loteNum) || loteNum <= 0) return;
    if (loteOverride !== undefined) form.setValue('lote', loteStr);

    setBuscando(true);
    setLoteEncontrado(null);
    setLoteJaTemOP(false);
    setSemFormula(false);

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

  const onSubmit = async (values: OrdemFormValues) => {
    setSaving(true);

    const { data: novaOrdem, error } = await supabase
      .from('ordens')
      .insert({
        lote: values.lote,
        produto: values.produto,
        quantidade: values.quantidade,
        linha: parseInt(values.linha),
        balanca: parseInt(values.balanca),
        status: 'pendente',
        data_programacao: format(new Date(), 'yyyy-MM-dd'),
        formula_id: formulaId,
        tamanho_batelada: tamanhoBatelada,
        marca: values.marca || null,
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
          materia_prima: item.materia_prima,
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

    await recalcularPosicoes(parseInt(values.linha));

    setSaving(false);
    toast({ title: 'Ordem criada com sucesso!' });
    form.reset({ lote: '', produto: '', quantidade: 0, linha: '', balanca: '', marca: '' });
    setLoteEncontrado(null);
    setFormulaId(null);
    setTamanhoBatelada(null);
    setSemFormula(false);
    setObsItems([{ qty: '', mp: '' }, { qty: '', mp: '' }, { qty: '', mp: '' }, { qty: '', mp: '' }]);
    setRequerMistura(true);
    setOrientacoes('');
    setDataEmissao(new Date().toISOString().split("T")[0]);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Criar Nova Ordem</h1>

      <div className="bg-card rounded-lg border p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="lote" render={({ field }) => (
              <FormItem>
                <FormLabel>Lote</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input
                      placeholder="Ex: 31706"
                      {...field}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), buscarLote())}
                    />
                  </FormControl>
                  <Button type="button" variant="outline" size="icon" onClick={() => buscarLote()} disabled={buscando}>
                    {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {loteEncontrado === true && (
                  <p className="text-xs text-status-done">✓ Produto e quantidade preenchidos automaticamente</p>
                )}
                {loteJaTemOP && (
                  <p className="text-xs text-destructive font-medium">⚠ Este lote já possui uma OP criada.</p>
                )}
                {loteEncontrado === false && !loteJaTemOP && (
                  <p className="text-xs text-muted-foreground">Lote não encontrado — preencha manualmente</p>
                )}
                {semFormula && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 mt-1">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-amber-800">
                      Este lote não possui fórmula cadastrada. A ordem será salva sem fórmula e sem lista de matérias-primas.
                    </p>
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="produto" render={({ field }) => (
              <FormItem>
                <FormLabel>Produto</FormLabel>
                <FormControl><Input placeholder="Ex: MBG-10-3810 VERDE LIMÃO-A" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {loteEncontrado === true && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Tamanho de Batelada</label>
                  <Input
                    type="number"
                    value={tamanhoBatelada ?? ''}
                    onChange={(e) => setTamanhoBatelada(e.target.value ? Number(e.target.value) : null)}
                    className="mt-1"
                  />
                </div>

                {formulaId && (
                  <p className="text-xs text-muted-foreground">
                    Fórmula: <span className="font-medium text-foreground">{formulaId}</span>
                  </p>
                )}

                {loadingFormula && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando matérias-primas...
                  </div>
                )}

                {erroFormula && (
                  <p className="text-sm text-destructive">{erroFormula}</p>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Orientações para Produção</label>
                  <textarea
                    value={orientacoes}
                    onChange={(e) => setOrientacoes(e.target.value)}
                    rows={3}
                    placeholder="Instruções especiais para a linha de produção (opcional)"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  {formulaId && (
                    <p className="text-xs text-muted-foreground">Será salvo na fórmula e pré-preenchido nas próximas OPs deste produto.</p>
                  )}
                </div>

                {itens.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Matérias-Primas</label>
                    <p className="text-xs text-muted-foreground">Edite as quantidades para customizar esta ordem.</p>
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Seq</th>
                            <th className="text-left px-3 py-2">Matéria-Prima</th>
                            <th className="text-left px-3 py-2">Un</th>
                            <th className="text-right px-3 py-2">%</th>
                            <th className="text-right px-3 py-2">Qtd (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((item) => (
                            <tr key={item.id} className="border-t">
                              <td className="px-3 py-2 text-muted-foreground">{item.sequencia ?? '-'}</td>
                              <td className="px-3 py-2">{item.materia_prima}</td>
                              <td className="px-3 py-2 text-muted-foreground">{item.unidade ?? '-'}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{item.percentual}%</td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  value={item.quantidade_kg}
                                  onChange={(e) => setQuantidade(item.id, Number(e.target.value))}
                                  className="h-7 w-24 text-right ml-auto"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t">
                            <td colSpan={4} className="px-3 py-1.5 text-xs text-muted-foreground/60 text-right">total fórmula</td>
                            <td className="px-3 py-1.5 text-right text-xs text-muted-foreground/60">
                              {formatKg(itens.reduce((s, i) => s + (i.quantidade_kg || 0), 0))} kg
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data de Emissão</label>
              <Input
                type="date"
                value={dataEmissao}
                onChange={(e) => setDataEmissao(e.target.value)}
              />
            </div>

            <FormField control={form.control} name="quantidade" render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade (kg)</FormLabel>
                <FormControl><Input type="number" placeholder="Ex: 500" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="linha" render={({ field }) => (
                <FormItem>
                  <FormLabel>Linha</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="1">Linha 1</SelectItem>
                      <SelectItem value="2">Linha 2</SelectItem>
                      <SelectItem value="3">Linha 3</SelectItem>
                      <SelectItem value="4">Linha 4</SelectItem>
                      <SelectItem value="5">Linha 5</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="balanca" render={({ field }) => (
                <FormItem>
                  <FormLabel>Balança</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="1">Balança 1</SelectItem>
                      <SelectItem value="2">Balança 2</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="marca" render={({ field }) => (
              <FormItem>
                <FormLabel>Marca</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione a marca" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="Pigma">Pigma</SelectItem>
                    <SelectItem value="Zan Collor">Zan Collor</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Requer Mistura</p>
                <p className="text-xs text-muted-foreground">
                  {requerMistura ? 'Pesagem → Mistura → Linha' : 'Pesagem → Linha (sem mistura)'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={requerMistura}
                onClick={() => setRequerMistura((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${requerMistura ? 'bg-primary' : 'bg-input'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${requerMistura ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Adições para Mistura</label>
              <div className="space-y-1.5">
                {obsItems.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.qty}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setObsItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                      }}
                      placeholder="0"
                      className="w-14 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm font-semibold text-muted-foreground shrink-0">x</span>
                    <input
                      type="text"
                      value={row.mp}
                      onChange={(e) => setObsItems((prev) => prev.map((r, j) => j === i ? { ...r, mp: e.target.value.toUpperCase() } : r))}
                      placeholder="Matéria-Prima"
                      className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
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
    </div>
  );
}
