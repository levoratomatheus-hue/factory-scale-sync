import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, AlertCircle, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface LoteRow {
  lote: number;
  produto: string;
  quantidade: number;
  classe: string;
}

export default function ImportarProgramacao() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado(null);
    setErro(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      const ws = wb.Sheets['DADOS'];
      if (!ws) {
        setErro('Aba "DADOS" não encontrada no arquivo Excel.');
        setLoading(false);
        return;
      }

      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 0 });

      const lotes: LoteRow[] = rows
        .filter(r => r['LOTE'] && r['PRODUTO'] && r['QTD SOLIC'])
        .map(r => ({
          lote: Number(r['LOTE']),
          produto: String(r['PRODUTO']).trim(),
          quantidade: Number(r['QTD SOLIC']),
          classe: r['CLASSE'] ? String(r['CLASSE']).trim() : '',
        }))
        .filter(r => !isNaN(r.lote) && !isNaN(r.quantidade));

      if (lotes.length === 0) {
        setErro('Nenhum dado válido encontrado na aba DADOS.');
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from('cadastro_lotes' as any)
        .upsert(lotes, { onConflict: 'lote' });

      if (error) {
        setErro(`Erro ao salvar: ${error.message}`);
        setLoading(false);
        return;
      }

      setResultado({ total: lotes.length });
      toast({ title: `${lotes.length} lotes importados com sucesso!` });
    } catch (err) {
      setErro('Erro ao ler o arquivo. Verifique se é um Excel válido.');
    }

    setLoading(false);
    e.target.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Importar Programação</h1>

      <div className="bg-card rounded-lg border p-6 space-y-4">
        <p className="text-muted-foreground text-sm">
          Faça o upload do arquivo Excel. O sistema vai ler a aba DADOS e
          atualizar o cadastro de lotes automaticamente.
        </p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary transition-colors">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {loading ? 'Processando...' : 'Clique para selecionar o arquivo Excel'}
          </span>
          <span className="text-xs text-muted-foreground">.xlsx ou .xls</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
            disabled={loading}
          />
        </label>

        {resultado && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-status-done-bg border border-status-done/30">
            <CheckCircle2 className="h-5 w-5 text-status-done mt-0.5" />
            <div>
              <p className="font-semibold text-status-done">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">
                {resultado.total} lotes importados/atualizados.
              </p>
            </div>
          </div>
        )}

        {erro && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{erro}</p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como funciona:</p>
        <p>• Lotes novos são inseridos automaticamente</p>
        <p>• Lotes já existentes são atualizados com os dados mais recentes</p>
        <p>• O arquivo precisa ter uma aba chamada <strong>DADOS</strong></p>
        <p>• Colunas necessárias: <strong>LOTE</strong>, <strong>PRODUTO</strong>, <strong>QTD SOLIC</strong></p>
      </div>
    </div>
  );
}
