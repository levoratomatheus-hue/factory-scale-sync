import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, AlertCircle, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ── Tipos internos ────────────────────────────────────────────────────────────

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

interface ImportResult {
  totalMPs: number;
  mpsComTid: number;
  mpsSemTid: number;
  totalFormulas: number;
  totalItens: number;
  formulaIdsDuplicados: string[];
  codTidDuplicados: string[];
  formulasSomaNaoFecha: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove pontos de milhar e zeros à esquerda. "000142" → "142", "5.478" → "5478". */
function normalizeCode(v: unknown): string {
  const s = String(v ?? '').trim().replace(/\./g, '');
  return s.replace(/^0+/, '') || '0';
}

/** Retorna true para célula vazia, #N/A ou qualquer erro Excel (#REF!, #VALUE!, etc.). */
function isBlankOrError(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return !s || s.startsWith('#');
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ImportarExcelLab() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /** Permite que o React re-renderize entre operações síncronas pesadas. */
  const yield_ = () => new Promise<void>((r) => setTimeout(r, 0));

  const setStep = async (pct: number, label: string) => {
    setProgress(pct);
    setProgressLabel(label);
    await yield_();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado(null);
    setErro(null);
    setProgress(0);

    try {
      // ── Leitura do workbook ─────────────────────────────────────────────
      await setStep(5, 'Lendo arquivo…');
      const buffer = await file.arrayBuffer();

      await setStep(10, 'Abrindo planilha…');
      const wb = XLSX.read(buffer, { type: 'array', cellText: false });

      // ── 2.1  MATÉRIA PRIMA-OK! → mp_depara ─────────────────────────────
      await setStep(15, 'Lendo matérias-primas…');

      const wsMP = wb.Sheets['MATÉRIA PRIMA-OK!'];
      if (!wsMP) throw new Error('Aba "MATÉRIA PRIMA-OK!" não encontrada na planilha.');

      const mpRaws = XLSX.utils.sheet_to_json<any[]>(wsMP, { header: 1, defval: '' });
      const mps: MpDepara[] = [];

      // Linha 0 = cabeçalho; dados a partir da linha 1
      for (let i = 1; i < mpRaws.length; i++) {
        const row = mpRaws[i];
        const colA = String(row[0] ?? '').trim();
        if (isBlankOrError(colA)) continue; // col A vazia → pular

        const colB = String(row[1] ?? '').trim();
        const cod_tid = (!colB || isBlankOrError(colB)) ? null : normalizeCode(colB);

        mps.push({
          cod_excel: normalizeCode(colA),
          cod_tid,
          tipo:      String(row[2] ?? '').trim(),
          descricao: String(row[3] ?? '').trim(),
        });
      }

      await setStep(30, `${mps.length} MPs lidas. Parseando fórmulas…`);

      // ── 2.2  Formulações Produção-OK! → formulas_excel ─────────────────
      const wsForm = wb.Sheets['Formulações Produção-OK!'];
      if (!wsForm) throw new Error('Aba "Formulações Produção-OK!" não encontrada na planilha.');

      const formRaws = XLSX.utils.sheet_to_json<any[]>(wsForm, { header: 1, defval: '' });

      const formulaItems: FormulaExcelRow[] = [];
      // Quantas vezes cada formula_id apareceu como produto (detecta duplicatas de bloco)
      const formulaIdCount = new Map<string, number>();

      type State = 'SCAN' | 'IN_ITEMS' | 'AWAIT_CLASSE' | 'IN_PRODUCTS';
      let state: State = 'SCAN';

      let blockItems: { cod_mp: string; nome_mp: string; percentual: number }[] = [];
      let blockProducts: string[] = []; // formula_ids do bloco atual

      const flushBlock = () => {
        if (blockItems.length === 0 || blockProducts.length === 0) return;
        for (const fid of blockProducts) {
          formulaIdCount.set(fid, (formulaIdCount.get(fid) ?? 0) + 1);
          for (let si = 0; si < blockItems.length; si++) {
            formulaItems.push({
              formula_id: fid,
              sequencia:  si + 1,
              cod_mp:     blockItems[si].cod_mp,
              nome_mp:    blockItems[si].nome_mp,
              percentual: blockItems[si].percentual,
            });
          }
        }
      };

      for (const row of formRaws) {
        const colB = String(row[1] ?? '').trim();

        // ── Início de novo bloco ─────────────────────────────────────────
        if (colB === 'MATÉRIA PRIMA') {
          // Fechar bloco anterior (se estávamos coletando produtos)
          if (state === 'IN_PRODUCTS') flushBlock();
          // Zerar para o novo bloco — crítico para blocos #N/A não vazar itens
          blockItems   = [];
          blockProducts = [];
          state = 'IN_ITEMS';
          continue;
        }

        // ── Coleta de itens ──────────────────────────────────────────────
        if (state === 'IN_ITEMS') {
          if (colB === 'Totalizador') {
            state = 'AWAIT_CLASSE';
            continue;
          }
          const colA = String(row[0] ?? '').trim();
          if (isBlankOrError(colA)) continue; // célula vazia ou #N/A → ignorar item
          const percentual = parseFloat(String(row[8] ?? '0')); // col I (índice 8)
          if (isNaN(percentual)) continue;
          blockItems.push({ cod_mp: normalizeCode(colA), nome_mp: colB, percentual });
          continue;
        }

        // ── Aguardando cabeçalho "CLASSE" ────────────────────────────────
        if (state === 'AWAIT_CLASSE') {
          if (colB === 'CLASSE') {
            state = 'IN_PRODUCTS';
          }
          // Ignorar linhas até aparecer "CLASSE"
          continue;
        }

        // ── Coleta de produtos (linhas com formula_id) ───────────────────
        if (state === 'IN_PRODUCTS') {
          const colU = String(row[20] ?? '').trim(); // col U (índice 20)
          if (isBlankOrError(colU)) continue;        // sem formula_id → ignorar silenciosamente
          const fid = normalizeCode(colU);
          if (!fid || fid === '0') continue;
          blockProducts.push(fid);
        }
      }

      // Flush do último bloco
      if (state === 'IN_PRODUCTS') flushBlock();

      await setStep(55, 'Calculando resumo…');

      // ── Resumo e alertas ────────────────────────────────────────────────
      const mpsComTid = mps.filter((m) => m.cod_tid !== null).length;

      // formula_ids que apareceram em mais de um bloco (bug de bloco duplicado na planilha)
      const formulaIdsDuplicados = [...formulaIdCount.entries()]
        .filter(([, n]) => n > 1)
        .map(([id]) => id)
        .sort();

      // cod_tid duplicados (mesmo código TID em duas MPs diferentes)
      const tidCount = new Map<string, number>();
      for (const mp of mps) {
        if (mp.cod_tid) tidCount.set(mp.cod_tid, (tidCount.get(mp.cod_tid) ?? 0) + 1);
      }
      const codTidDuplicados = [...tidCount.entries()]
        .filter(([, n]) => n > 1)
        .map(([tid]) => tid)
        .sort();

      // Fórmulas cuja soma de percentuais não fecha 1,00 (tolerância ±0,06)
      const sumByFormula = new Map<string, number>();
      for (const r of formulaItems) {
        sumByFormula.set(r.formula_id, (sumByFormula.get(r.formula_id) ?? 0) + r.percentual);
      }
      const formulasSomaNaoFecha = [...sumByFormula.entries()]
        .filter(([, s]) => Math.abs(s - 1) > 0.06)
        .map(([id]) => id)
        .sort();

      const totalFormulas = formulaIdCount.size;

      // ── 2.3  Gravação ───────────────────────────────────────────────────
      await setStep(58, 'Limpando tabelas…');

      // Apaga tudo antes de reinserir (import apaga-e-recarrega)
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

      // Inserir MPs
      await setStep(62, `Inserindo ${mps.length} matérias-primas…`);
      const BATCH = 500;
      for (let i = 0; i < mps.length; i += BATCH) {
        const { error } = await (supabase as any)
          .from('mp_depara')
          .insert(mps.slice(i, i + BATCH));
        if (error) throw new Error(`Erro ao inserir MPs: ${error.message}`);
        setProgress(62 + Math.round(Math.min((i + BATCH) / mps.length, 1) * 8)); // 62→70
        await yield_();
      }

      // Inserir itens de fórmula
      await setStep(70, `Inserindo ${formulaItems.length} itens de fórmula…`);
      for (let i = 0; i < formulaItems.length; i += BATCH) {
        const { error } = await (supabase as any)
          .from('formulas_excel')
          .insert(formulaItems.slice(i, i + BATCH));
        if (error) throw new Error(`Erro ao inserir fórmulas: ${error.message}`);
        setProgress(70 + Math.round(Math.min((i + BATCH) / formulaItems.length, 1) * 28)); // 70→98
        await yield_();
      }

      await setStep(100, 'Concluído!');

      const result: ImportResult = {
        totalMPs: mps.length,
        mpsComTid,
        mpsSemTid: mps.length - mpsComTid,
        totalFormulas,
        totalItens: formulaItems.length,
        formulaIdsDuplicados,
        codTidDuplicados,
        formulasSomaNaoFecha,
      };

      setResultado(result);
      toast({
        title: 'Importação concluída!',
        description: `${totalFormulas} fórmulas · ${formulaItems.length} itens · ${mps.length} MPs.`,
      });
    } catch (err: any) {
      setErro(err?.message ?? 'Erro desconhecido ao processar o arquivo.');
    }

    setLoading(false);
    e.target.value = '';
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
            {/* Resumo de sucesso */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-status-done-bg border border-status-done/30">
              <CheckCircle2 className="h-5 w-5 text-status-done mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-status-done">Importação concluída!</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{resultado.totalMPs}</span>{' '}
                  matérias-primas importadas —{' '}
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

            {/* Alertas informativos */}
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

            {/* Nenhum alerta */}
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
          &nbsp;&nbsp;Col A=cod_excel · B=cod_tid · C=tipo · D=descricao (cabeçalho na linha 1, dados a partir da linha 2)
        </p>
        <p>
          • <strong>Formulações Produção-OK!</strong> → <code>formulas_excel</code>
          <br />
          &nbsp;&nbsp;Blocos: "MATÉRIA PRIMA" (início) → itens (col A=cod_mp, B=nome, I=percentual) → "Totalizador" → "CLASSE" → linhas de produto (col U=formula_id)
        </p>
        <p>• Somente fórmulas com formula_id preenchido (col U) são gravadas</p>
        <p>• percentual = valor bruto da col I (fração 0–1, não multiplicado)</p>
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
