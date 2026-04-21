import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2, AlertCircle, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface LoteRow {
  lote: number;
  produto: string;
  quantidade: number;
  classe: string;
  formula_id: string | null;
  status: string | null;
}

interface FormulaRow {
  formula_id: string;
  produto: string;
  sequencia: number;
  materia_prima: string;
  fornecedor: string;
  unidade: string;
  percentual: number;
}

function parseTxtWindows1252(buffer: ArrayBuffer): string {
  return new TextDecoder('windows-1252').decode(buffer);
}

export default function ImportarProgramacao() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [loadingFormulas, setLoadingFormulas] = useState(false);
  const [resultadoFormulas, setResultadoFormulas] = useState<{ total: number } | null>(null);
  const [erroFormulas, setErroFormulas] = useState<string | null>(null);

  // ── Importar Programação (lotes) ──────────────────────────────────────────
  const handleLoteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResultado(null);
    setErro(null);

    try {
      const buffer = await file.arrayBuffer();
      const text = parseTxtWindows1252(buffer);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());

      if (lines.length === 0) {
        setErro('Arquivo vazio ou sem linhas válidas.');
        setLoading(false);
        return;
      }

      // campo1=lote, campo4=formula_id, campo5=produto, campo7=status, campo9=quantidade, campo13=classe
      const limpar = (v: string) => v.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').trim();
      const lotes: LoteRow[] = lines
        .map((line) => {
          const p = line.split(';');
          const lote = parseInt(limpar(p[0] ?? '').replace(/\./g, ''));
          const quantidade = parseFloat(limpar(p[8] ?? '0').replace(/\./g, '').replace(',', '.'));
          return {
            lote,
            formula_id: limpar(p[3] ?? '') || null,
            produto:    limpar(p[4] ?? ''),
            status:     limpar(p[6] ?? '') || null,
            quantidade: isNaN(quantidade) ? 0 : quantidade,
            classe:     limpar(p[12] ?? ''),
          };
        })
        .filter((r) => !isNaN(r.lote) && r.lote > 0 && r.produto);

      if (lotes.length === 0) {
        setErro('Nenhuma linha válida. Verifique o separador (;) e o formato do arquivo.');
        setLoading(false);
        return;
      }

      // Mantém apenas a primeira ocorrência de cada lote
      const lotesMapa = lotes.reduce<Map<number, LoteRow>>((map, row) => {
        if (!map.has(row.lote)) map.set(row.lote, row);
        return map;
      }, new Map());
      const lotesUnicos = Array.from(lotesMapa.values());

      const BATCH = 500;
      for (let i = 0; i < lotesUnicos.length; i += BATCH) {
        const { error } = await (supabase as any)
          .from('cadastro_lotes')
          .upsert(lotesUnicos.slice(i, i + BATCH), { onConflict: 'lote' });
        if (error) {
          setErro(`Erro ao salvar (batch ${Math.floor(i / BATCH) + 1}): ${error.message}`);
          setLoading(false);
          return;
        }
      }

      setResultado({ total: lotesUnicos.length });
      toast({ title: `${lotesUnicos.length} lotes importados com sucesso!` });
    } catch {
      setErro('Erro ao ler o arquivo. Verifique se é um TXT válido com encoding Windows-1252.');
    }

    setLoading(false);
    e.target.value = '';
  };

  // ── Importar Fórmulas ─────────────────────────────────────────────────────
  const handleFormulaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingFormulas(true);
    setResultadoFormulas(null);
    setErroFormulas(null);

    try {
      const buffer = await file.arrayBuffer();
      const text = parseTxtWindows1252(buffer);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());

      if (lines.length === 0) {
        setErroFormulas('Arquivo vazio ou sem linhas válidas.');
        setLoadingFormulas(false);
        return;
      }

      const rows: FormulaRow[] = lines
        .map((line) => {
          const p = line.split(';');
          return {
            formula_id:    (p[0] ?? '').trim(),
            produto:       (p[1] ?? '').trim(),
            sequencia:     parseInt((p[2] ?? '0').trim()) || 0,
            materia_prima: (p[3] ?? '').trim(),
            fornecedor:    (p[4] ?? '').trim(),
            unidade:       (p[5] ?? '').trim(),
            percentual:    parseFloat((p[6] ?? '0').trim().replace(',', '.')) || 0,
          };
        })
        .filter((r) => r.formula_id && r.materia_prima);

      if (rows.length === 0) {
        setErroFormulas('Nenhuma linha válida. Verifique o separador (;) e o formato do arquivo.');
        setLoadingFormulas(false);
        return;
      }

      const { error } = await (supabase as any)
        .from('formulas')
        .upsert(rows, { onConflict: 'formula_id,sequencia' });

      if (error) {
        setErroFormulas(`Erro ao salvar: ${error.message}`);
        setLoadingFormulas(false);
        return;
      }

      setResultadoFormulas({ total: rows.length });
      toast({ title: `${rows.length} registros de fórmula importados com sucesso!` });
    } catch {
      setErroFormulas('Erro ao ler o arquivo. Verifique se é um TXT válido com encoding Windows-1252.');
    }

    setLoadingFormulas(false);
    e.target.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Importar Programação</h1>

      {/* ── Seção 1: Lotes ── */}
      <div className="bg-card rounded-lg border p-6 space-y-4">
        <p className="text-muted-foreground text-sm">
          Faça o upload do arquivo TXT de programação exportado pelo TI Soft para atualizar o
          cadastro de lotes automaticamente.
        </p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary transition-colors">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {loading ? 'Processando...' : 'Clique para selecionar o arquivo TXT'}
          </span>
          <span className="text-xs text-muted-foreground">.txt · Windows-1252 · separador ;</span>
          <input
            type="file"
            accept=".txt"
            onChange={handleLoteFile}
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
                {resultado.total} lote{resultado.total !== 1 ? 's' : ''} importado{resultado.total !== 1 ? 's' : ''}/atualizado{resultado.total !== 1 ? 's' : ''}.
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
        <p className="font-medium text-foreground">Formato esperado — Programação:</p>
        <p className="font-mono text-xs bg-muted px-2 py-1 rounded">
          lote;…;…;formula_id;produto;…;status;…;quantidade;…;…;…;classe;…
        </p>
        <p>• Campos usados: <strong>1</strong>=lote, <strong>4</strong>=formula_id, <strong>5</strong>=produto, <strong>9</strong>=quantidade, <strong>13</strong>=classe</p>
        <p>• Lotes novos são inseridos; existentes (mesmo <strong>lote</strong>) são atualizados</p>
        <p>• Linhas vazias são ignoradas automaticamente</p>
      </div>

      {/* ── Seção 2: Fórmulas ── */}
      <h2 className="text-xl font-bold pt-2">Importar Fórmulas (TI Soft)</h2>

      <div className="bg-card rounded-lg border p-6 space-y-4">
        <p className="text-muted-foreground text-sm">
          Faça o upload do arquivo TXT de fórmulas exportado pelo TI Soft (encoding Windows-1252, separador <strong>;</strong>).
        </p>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary transition-colors">
          {loadingFormulas ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {loadingFormulas ? 'Processando...' : 'Clique para selecionar o arquivo TXT'}
          </span>
          <span className="text-xs text-muted-foreground">.txt · Windows-1252 · separador ;</span>
          <input
            type="file"
            accept=".txt"
            onChange={handleFormulaFile}
            className="hidden"
            disabled={loadingFormulas}
          />
        </label>

        {resultadoFormulas && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-status-done-bg border border-status-done/30">
            <CheckCircle2 className="h-5 w-5 text-status-done mt-0.5" />
            <div>
              <p className="font-semibold text-status-done">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">
                {resultadoFormulas.total} registro{resultadoFormulas.total !== 1 ? 's' : ''} de fórmula importado{resultadoFormulas.total !== 1 ? 's' : ''}/atualizado{resultadoFormulas.total !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        )}

        {erroFormulas && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{erroFormulas}</p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Formato esperado — Fórmulas:</p>
        <p className="font-mono text-xs bg-muted px-2 py-1 rounded">
          formula_id;produto;sequencia;materia_prima;fornecedor;unidade;percentual
        </p>
        <p>• Registros novos são inseridos; existentes (mesmo <strong>formula_id + sequencia</strong>) são atualizados</p>
        <p>• Linhas vazias são ignoradas automaticamente</p>
      </div>
    </div>
  );
}
