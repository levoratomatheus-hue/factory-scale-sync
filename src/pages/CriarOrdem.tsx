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
import { Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const ordemSchema = z.object({
  lote: z.string().trim().min(1, 'Lote é obrigatório').max(50, 'Máximo 50 caracteres'),
  produto: z.string().trim().min(1, 'Produto é obrigatório').max(200, 'Máximo 200 caracteres'),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva').max(999999, 'Valor muito alto'),
  linha: z.string().min(1, 'Selecione a linha'),
  balanca: z.string().min(1, 'Selecione a balança'),
});

type OrdemFormValues = z.infer<typeof ordemSchema>;

export default function CriarOrdem() {
  const [saving, setSaving] = useState(false);

  const form = useForm<OrdemFormValues>({
    resolver: zodResolver(ordemSchema),
    defaultValues: { lote: '', produto: '', quantidade: 0, linha: '', balanca: '' },
  });

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
                <FormControl><Input placeholder="Ex: 31706" {...field} /></FormControl>
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
