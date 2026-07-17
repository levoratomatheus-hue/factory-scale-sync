import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, AlertCircle, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ── Tipos (espelhados do worker) ──────────────────────────────────────────────

interface MpDepara {
  cod_excel: string;
  cod_tid: string | null;
  tipo: string;
  descricao: string;
}

interface FormulaExcelRow {
  formula_id: string;
  sequencia: number;
  cod_mp: string;
  nome_mp: string;
  percentual: number;
}

interface ImportSummary {
  totalMPs: number;
  mpsComTid: number;
  mpsSemTid: number;
  totalFormulas: number;
  totalItens: number;
  formulaIdsDuplicados: string[];
  codTidDuplicados: string[];
  formulasSomaNaoFecha: string[];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ImportarExcelLab() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [resultado, setResultado] = useState<ImportSummary | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado(null);
    setErro(null);
    setProgress(2);
    setProgressLabel('Lendo arquivo…');

    // Ler o buffer na thread principal (é I/O assíncrono, não bloqueia)
    const buffer = await file.arrayBuffer();
    e.target.value = '';

    // Criar o worker — parse pesado fica fora da thread principal
    const worker = new Worker(
      new URL('./excelImport.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = async (evt: MessageEvent) => {
      const msg = evt.data;

      // ── Progresso vindo do worker ─────────────────────────────────────────
      if (msg.type === 'progress') {
        setProgress(msg.percentual);
        setProgressLabel(msg.etapa);
        return;
      }

      // ── Erro no worker ────────────────────────────────────────────────────
      if (msg.type === 'error') {
        setErro(msg.message);
        setLoading(false);
        worker.terminate();
        return;
      }

      // ── Parse concluído — gravar no Supabase (thread principal) ──────────
      if (msg.type === 'result') {
        const { mps, formulaItems, summary } = msg as {
          mps: MpDepara[];
          formulaItems: FormulaExcelRow[];
          summary: ImportSummary;
        };

        worker.terminate(); // liberar o worker antes dos awaits

        try {
          // Apagar tudo antes de reinserir
          setProgress(59);
          setProgressLabel('Limpando tabelas…');

          const { error: delMpErr } = await (supabase as any)
            .from('mp_depara')
            .delete()
            .not('cod_excel', 'is', null);
          if (delMpErr) throw new Error(`Erro ao limpar mp_depara: ${delMpErr.message}`);

          const { error: delFormErr } = await (supabase as any)
            .from('formulas_excel')
            .delete()
            .not('formula_id', 'is', null);
          if (delFormErr) throw new Error(`Erro ao limpar formulas_excel: ${delFormErr.message}`);

          // Inserir MPs (62→70%)
          setProgress(62);
          setProgressLabel(`Inserindo ${mps.length} matérias-primas…`);
          const BATCH = 500;

          for (let i = 0; i < mps.length; i += BATCH) {
            const { error } = await (supabase as any)
              .from('mp_depara')
              .insert(mps.slice(i, i + BATCH));
            if (error) throw new Error(`Erro ao inserir MPs: ${error.message}`);
            setProgress(62 + Math.round(Math.min((i + BATCH) / mps.length, 1) * 8));
          }

          // Inserir itens de fórmula (70→98%)
          setProgress(70);
          setProgressLabel(`Inserindo ${formulaItems.length} itens de fórmula…`);

          for (let i = 0; i < formulaItems.length; i += BATCH) {
            const { error } = await (supabase as any)
              .from('formulas_excel')
              .insert(formulaItems.slice(i, i + BATCH));
            if (error) throw new Error(`Erro ao inserir fórmulas: ${error.message}`);
            setProgress(70 + Math.round(Math.min((i + BATCH) / formulaItems.length, 1) * 28));
          }

          setProgress(100);
          setProgressLabel('Concluído!');
          setResultado(summary);
          toast({
            title: 'Importação concluída!',
            description: `${summary.totalFormulas} fórmulas · ${summary.totalItens} itens · ${summary.totalMPs} MPs.`,
          });
        } catch (err: any) {
          setErro(err?.message ?? 'Erro ao gravar no banco.');
        }

        setLoading(false);
      }
    };

    worker.onerror = (err) => {
      setErro(`Erro no worker: ${err.message}`);
      setLoading(false);
      worker.terminate();
    };

    // Transferir o buffer para o worker (zero-copy — buffer fica detached aqui)
    worker.postMessage(buffer, [buffer]);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Importar Excel do Lab</h1>

      <div className="bg-card rounded-lg border p-6 space-y-4">
        <p className="text-muted-foreground text-sm">
          Faça o upload do arquivo <strong>CUSTO_INDUSTRIAL_OTIMIZADO.xlsx</strong>.
          O import é <strong>apaga e recarrega</strong> — substitui todo o conteúdo
          de <code>mp_depara</code> e <code>formulas_excel</code> a cada execução.
        </p>

        <label
          className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary transition-colors${loading ? ' pointer-events-none opacity-60' : ''}`}
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {loading ? progressLabel : 'Clique para selecionar o arquivo XLSX'}
          </span>
          <span className="text-xs text-muted-foreground">
            .xlsx · CUSTO_INDUSTRIAL_OTIMIZADO.xlsx
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
            disabled={loading}
          />
        </label>

        {/* Barra de progresso */}
        {loading && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progressLabel}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-status-done-bg border border-status-done/30">
              <CheckCircle2 className="h-5 w-5 text-status-done mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-status-done">Importação concluída!</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{resultado.totalMPs}</span>{' '}
                  matérias-primas —{' '}
                  <span className="font-medium text-foreground">{resultado.mpsComTid}</span> com Cod Tid ·{' '}
                  <span className="font-medium text-foreground">{resultado.mpsSemTid}</span> sem
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{resultado.totalFormulas}</span>{' '}
                  fórmulas ·{' '}
                  <span className="font-medium text-foreground">{resultado.totalItens}</span>{' '}
                  itens importados
                </p>
              </div>
            </div>

            {resultado.formulaIdsDuplicados.length > 0 && (
              <WarningBox
                title={`${resultado.formulaIdsDuplicados.length} formula_id duplicado${resultado.formulaIdsDuplicados.length !== 1 ? 's' : ''} na planilha — mesmo ID em blocos diferentes`}
                items={resultado.formulaIdsDuplicados}
              />
            )}
            {resultado.codTidDuplicados.length > 0 && (
              <WarningBox
                title={`${resultado.codTidDuplicados.length} Cod Tid duplicado${resultado.codTidDuplicados.length !== 1 ? 's' : ''} em MPs diferentes`}
                items={resultado.codTidDuplicados}
              />
            )}
            {resultado.formulasSomaNaoFecha.length > 0 && (
              <WarningBox
                title={`${resultado.formulasSomaNaoFecha.length} fórmula${resultado.formulasSomaNaoFecha.length !== 1 ? 's' : ''} com soma de percentuais fora de 1,00 (tolerância ±0,06)`}
                items={resultado.formulasSomaNaoFecha}
              />
            )}

            {resultado.formulaIdsDuplicados.length === 0 &&
              resultado.codTidDuplicados.length === 0 &&
              resultado.formulasSomaNaoFecha.length === 0 && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-done" />
                  Nenhum alerta — sem duplicatas, todos os percentuais fecham.
                </p>
              )}
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{erro}</p>
          </div>
        )}
      </div>

      {/* Legenda do formato */}
      <div className="bg-card rounded-lg border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Abas processadas:</p>
        <p>
          • <strong>MATÉRIA PRIMA-OK!</strong> → <code>mp_depara</code>
          <br />
          &nbsp;&nbsp;Col A=cod_excel · B=cod_tid · C=tipo · D=descricao
        </p>
        <p>
          • <strong>Formulações Produção-OK!</strong> → <code>formulas_excel</code>
          <br />
          &nbsp;&nbsp;Blocos: "MATÉRIA PRIMA" → itens (col A=cod_mp, B=nome, I=percentual) → "Totalizador" → "CLASSE" → produto (col U=formula_id)
        </p>
        <p>• Parse roda em Web Worker — a UI não congela durante o processamento</p>
        <p>• Importação é sempre apaga-e-recarrega (DELETE + INSERT)</p>
      </div>
    </div>
  );
}

// ── Sub-componente de alerta ──────────────────────────────────────────────────

function WarningBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/20">
        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">{title}</p>
      </div>
      <div className="px-4 py-2.5 max-h-32 overflow-y-auto">
        <p className="text-xs font-mono text-amber-900 dark:text-amber-300 break-all leading-relaxed">
          {items.join(' · ')}
        </p>
      </div>
    </div>
  );
}
