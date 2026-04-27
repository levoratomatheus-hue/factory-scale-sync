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
  data_emissao: string | null;
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
  const [resultado, setResultado] = useState<{
    total: number;
    comEmissao: number;
    semEmissao: { lote: number; produto: string }[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [loadingFormulas, setLoadingFormulas] = useState(false);
  const [resultadoFormulas, setResultadoFormulas] = useState<{ totalFormulas: number; totalLinhas: number } | null>(null);
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

      // campo1=lote, campo4=formula_id, campo5=produto, campo6=data_emissao, campo7=status, campo9=quantidade, campo13=classe
      const limpar = (v: string) => v.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '').trim();
      const parseDateBR = (v: string): string | null => {
        const s = limpar(v);
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
      };

      const lotes: LoteRow[] = lines
        .map((line) => {
          const p = line.split(';');
          const lote = parseInt(limpar(p[0] ?? '').replace(/\./g, ''));
          const quantidade = parseFloat(limpar(p[8] ?? '0').replace(/\./g, '').replace(',', '.'));
          return {
            lote,
            formula_id:   limpar(p[3] ?? '') || null,
            produto:      limpar(p[4] ?? ''),
            data_emissao: parseDateBR(p[5] ?? ''),
            status:       limpar(p[6] ?? '') || null,
            quantidade:   isNaN(quantidade) ? 0 : quantidade,
            classe:       limpar(p[12] ?? ''),
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

      const semEmissaoLotes = lotesUnicos.filter((r) => r.data_emissao === null);
      const comEmissao = lotesUnicos.length - semEmissaoLotes.length;

      const BATCH = 500;
      for (let i = 0; i < lotesUnicos.length; i += BATCH) {
        const batch = lotesUnicos.slice(i, i + BATCH);
        const { error } = await (supabase as any)
          .from('cadastro_lotes')
          .upsert(batch, { onConflict: 'lote' });
        if (error) {
          setErro(`Erro ao salvar (batch ${Math.floor(i / BATCH) + 1}): ${error.message}`);
          setLoading(false);
          return;
        }
      }

      setResultado({
        total: lotesUnicos.length,
        comEmissao,
        semEmissao: semEmissaoLotes.map((r) => ({ lote: r.lote, produto: r.produto })),
      });
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

      // Group rows by formula_id so we can delete+reinsert each formula atomically.
      // ordens_formula (historical pesagem data) is a separate table and is NEVER touched here.
      const byFormula = rows.reduce<Map<string, FormulaRow[]>>((map, row) => {
        if (!map.has(row.formula_id)) map.set(row.formula_id, []);
        map.get(row.formula_id)!.push(row);
        return map;
      }, new Map());

      const formulaIds = Array.from(byFormula.keys());

      // Verify concluded OPs for each formula_id (informational).
      // Even when concluded OPs exist their ingredient data is already preserved
      // in ordens_formula — the standard formulas table can be safely overwritten.
      const { data: opsConcluidas } = await supabase
        .from('ordens')
        .select('formula_id')
        .in('formula_id', formulaIds)
        .eq('status', 'concluido');

      const formulasComHistorico = new Set((opsConcluidas ?? []).map((o: any) => o.formula_id));

      for (const [formulaId, formulaRows] of byFormula) {
        // Delete existing rows in `formulas` only — never touches ordens_formula
        const { error: delErr } = await (supabase as any)
          .from('formulas')
          .delete()
          .eq('formula_id', formulaId);

        if (delErr) {
          setErroFormulas(`Erro ao deletar fórmula ${formulaId}: ${delErr.message}`);
          setLoadingFormulas(false);
          return;
        }

        // Insert updated ingredient list
        const { error: insErr } = await (supabase as any)
          .from('formulas')
          .insert(formulaRows);

        if (insErr) {
          setErroFormulas(`Erro ao inserir fórmula ${formulaId}: ${insErr.message}`);
          setLoadingFormulas(false);
          return;
        }
      }

      const comHistorico = formulaIds.filter((id) => formulasComHistorico.has(id)).length;
      setResultadoFormulas({ totalFormulas: formulaIds.length, totalLinhas: rows.length });
      toast({
        title: `${formulaIds.length} fórmula${formulaIds.length !== 1 ? 's' : ''} reimportada${formulaIds.length !== 1 ? 's' : ''} com sucesso!`,
        description: comHistorico > 0
          ? `${comHistorico} fórmula${comHistorico !== 1 ? 's' : ''} com OPs concluídas — histórico ordens_formula preservado.`
          : undefined,
      });
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
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-status-done-bg border border-status-done/30">
              <CheckCircle2 className="h-5 w-5 text-status-done mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold text-status-done">Importação concluída!</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{resultado.total}</span> lote{resultado.total !== 1 ? 's' : ''} importado{resultado.total !== 1 ? 's' : ''} ·{' '}
                  <span className="font-medium text-status-done">{resultado.comEmissao}</span> com data de emissão ·{' '}
                  <span className={resultado.semEmissao.length > 0 ? 'font-medium text-amber-600' : 'font-medium text-status-done'}>
                    {resultado.semEmissao.length}
                  </span> sem data de emissão
                </p>
              </div>
            </div>

            {resultado.semEmissao.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 bg-amber-100/60">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">
                    {resultado.semEmissao.length} lote{resultado.semEmissao.length !== 1 ? 's' : ''} sem data de emissão — verifique no TI Soft
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="text-amber-700 border-b border-amber-200 bg-amber-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-1.5 font-semibold">Lote</th>
                        <th className="text-left px-4 py-1.5 font-semibold">Produto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.semEmissao.map((r) => (
                        <tr key={r.lote} className="border-b border-amber-100 last:border-0">
                          <td className="px-4 py-1.5 font-mono text-amber-900">{r.lote}</td>
                          <td className="px-4 py-1.5 text-amber-800 max-w-xs truncate">{r.produto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
        <p>• Campos usados: <strong>1</strong>=lote, <strong>4</strong>=formula_id, <strong>5</strong>=produto, <strong>6</strong>=data_emissao, <strong>9</strong>=quantidade, <strong>13</strong>=classe</p>
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
                {resultadoFormulas.totalFormulas} fórmula{resultadoFormulas.totalFormulas !== 1 ? 's' : ''} · {resultadoFormulas.totalLinhas} linha{resultadoFormulas.totalLinhas !== 1 ? 's' : ''} de ingredientes reimportadas.
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
