import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';
import { Save, Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';

const ordemSchema = z.object({
  lote: z.string().trim().min(1, 'Lote é obrigatório').max(50),
  produto: z.string().trim().min(1, 'Produto é obrigatório').max(200),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva').max(999999),
  linha: z.string().min(1, 'Selecione a linha'),
  balanca: z.string().min(1, 'Selecione a balança'),
});

type OrdemFormValues = z.infer<typeof ordemSchema>;

export default function CriarOrdem() {
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [loteEncontrado, setLoteEncontrado] = useState<boolean | null>(null);
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [quantidadeOP, setQuantidadeOP] = useState<number>(0);
  const [tamanhoBatelada, setTamanhoBatelada] = useState<number | null>(null);

  const form = useForm<OrdemFormValues>({
    resolver: zodResolver(ordemSchema),
    defaultValues: { lote: '', produto: '', quantidade: 0, linha: '', balanca: '' },
  });

  const buscarLote = async () => {
    const lote = form.getValues('lote').trim();
    if (!lote) return;

    setBuscando(true);
    setLoteEncontrado(null);

    const { data, error } = await supabase
      .from('cadastro_lotes')
      .select('*')
      .eq('lote', Number(lote))
      .single();

    setBuscando(false);
    console.log('dados do lote:', JSON.stringify(data));

    if (error || !data) {
      setLoteEncontrado(false);
      toast({ title: 'Lote não encontrado no cadastro', variant: 'destructive' });
      return;
    }

    form.setValue('produto', data.produto);
    form.setValue('quantidade', data.quantidade);
    setFormulaId(data.formula_id ?? null);
    setQuantidadeOP(data.quantidade);
    setTamanhoBatelada(data.tamanho_batelada ?? null);
    setLoteEncontrado(true);
    toast({ title: 'Lote encontrado!', description: row.produto });
  };

  const onSubmit = async (values: OrdemFormValues) => {
    setSaving(true);
    const { error } = await supabase.from('ordens').insert({
      lote: values.lote,
      produto: values.produto,
      quantidade: values.quantidade,
      linha: parseInt(values.linha),
      balanca: parseInt(values.balanca),
      data_programacao: format(new Date(), 'yyyy-MM-dd'),
    });

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Ordem criada com sucesso!' });
      form.reset();
      setLoteEncontrado(null);
      setFormulaId(null);
      setQuantidadeOP(0);
      setTamanhoBatelada(null);
    }
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
                  <Button type="button" variant="outline" size="icon" onClick={buscarLote} disabled={buscando}>
                    {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {loteEncontrado === true && (
                  <p className="text-xs text-status-done">✓ Produto e quantidade preenchidos automaticamente</p>
                )}
                {loteEncontrado === false && (
                  <p className="text-xs text-muted-foreground">Lote não encontrado — preencha manualmente</p>
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
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">Tamanho de Batelada</label>
                  <Input
                    type="number"
                    value={tamanhoBatelada ?? ''}
                    onChange={(e) => setTamanhoBatelada(e.target.value ? Number(e.target.value) : null)}
                    className="mt-1"
                  />
                </div>
                {tamanhoBatelada !== null && tamanhoBatelada > 0 && formulaId && (
                  <p className="text-xs text-muted-foreground">Fórmula: <span className="font-medium text-foreground">{formulaId}</span></p>
                )}
              </div>
            )}

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
