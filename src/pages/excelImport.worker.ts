/**
 * Web Worker — parse do XLSX do Lab
 *
 * Recebe: ArrayBuffer do arquivo via postMessage (transferível, zero-copy)
 * Posta:
 *   { type: 'progress', percentual: number, etapa: string }
 *   { type: 'result',   mps, formulaItems, summary }
 *   { type: 'error',    message: string }
 *
 * Toda a CPU pesada (XLSX.read + parse dos blocos) fica aqui.
 * A thread principal só grava no Supabase depois de receber 'result'.
 */

import * as XLSX from 'xlsx';

// ── Tipos (duplicados aqui — worker não pode importar do componente) ──────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCode(v: unknown): string {
  const s = String(v ?? '').trim().replace(/\./g, '');
  return s.replace(/^0+/, '') || '0';
}

function isBlankOrError(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return !s || s.startsWith('#');
}

function progress(percentual: number, etapa: string) {
  self.postMessage({ type: 'progress', percentual, etapa });
}

// ── Handler principal ─────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  const buffer = e.data;

  try {
    progress(5, 'Abrindo planilha…');

    // Ler apenas as 2 abas necessárias — as outras 7 (incluindo a aba com 36k
    // linhas de fórmulas que não usamos) são completamente ignoradas.
    const wb = XLSX.read(buffer, {
      type:         'array',
      sheets:       ['MATÉRIA PRIMA-OK!', 'Formulações Produção-OK!'],
      dense:        true,
      cellFormula:  false,
      cellHTML:     false,
      cellText:     false,
      cellStyles:   false,
      sheetStubs:   false,
      bookDeps:     false,
    });

    // ── Aba MATÉRIA PRIMA-OK! ─────────────────────────────────────────────────
    progress(12, 'Lendo matérias-primas…');

    const wsMP = wb.Sheets['MATÉRIA PRIMA-OK!'];
    if (!wsMP) throw new Error('Aba "MATÉRIA PRIMA-OK!" não encontrada na planilha.');

    const mpRaws = XLSX.utils.sheet_to_json<any[]>(wsMP, { header: 1, defval: '' });
    const mps: MpDepara[] = [];

    for (let i = 1; i < mpRaws.length; i++) {
      const row = mpRaws[i];
      const colA = String(row[0] ?? '').trim();
      if (isBlankOrError(colA)) continue;

      const colB = String(row[1] ?? '').trim();
      const cod_tid = (!colB || isBlankOrError(colB)) ? null : normalizeCode(colB);

      mps.push({
        cod_excel: normalizeCode(colA),
        cod_tid,
        tipo:      String(row[2] ?? '').trim(),
        descricao: String(row[3] ?? '').trim(),
      });
    }

    // ── Aba Formulações Produção-OK! ──────────────────────────────────────────
    progress(25, `${mps.length} MPs lidas. Parseando fórmulas…`);

    const wsForm = wb.Sheets['Formulações Produção-OK!'];
    if (!wsForm) throw new Error('Aba "Formulações Produção-OK!" não encontrada na planilha.');

    const formRaws = XLSX.utils.sheet_to_json<any[]>(wsForm, { header: 1, defval: '' });
    const totalRows = formRaws.length;

    const formulaItems: FormulaExcelRow[] = [];
    const formulaIdCount = new Map<string, number>();

    type State = 'SCAN' | 'IN_ITEMS' | 'AWAIT_CLASSE' | 'IN_PRODUCTS';
    let state: State = 'SCAN';
    let blockItems: { cod_mp: string; nome_mp: string; percentual: number }[] = [];
    let blockProducts: string[] = [];

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

    // Posta progresso a cada 2.000 linhas para não poluir o canal
    const PROGRESS_STEP = 2000;

    for (let ri = 0; ri < totalRows; ri++) {
      if (ri > 0 && ri % PROGRESS_STEP === 0) {
        // Progresso de parse: 25% → 55%
        progress(25 + Math.round((ri / totalRows) * 30), `Parseando fórmulas… (${ri}/${totalRows})`);
      }

      const row = formRaws[ri];
      const colB = String(row[1] ?? '').trim();

      if (colB === 'MATÉRIA PRIMA') {
        if (state === 'IN_PRODUCTS') flushBlock();
        blockItems   = [];
        blockProducts = [];
        state = 'IN_ITEMS';
        continue;
      }

      if (state === 'IN_ITEMS') {
        if (colB === 'Totalizador') { state = 'AWAIT_CLASSE'; continue; }
        const colA = String(row[0] ?? '').trim();
        if (isBlankOrError(colA)) continue;
        const percentual = parseFloat(String(row[8] ?? '0'));
        if (isNaN(percentual)) continue;
        blockItems.push({ cod_mp: normalizeCode(colA), nome_mp: colB, percentual });
        continue;
      }

      if (state === 'AWAIT_CLASSE') {
        if (colB === 'CLASSE') state = 'IN_PRODUCTS';
        continue;
      }

      if (state === 'IN_PRODUCTS') {
        const colU = String(row[20] ?? '').trim();
        if (isBlankOrError(colU)) continue;
        const fid = normalizeCode(colU);
        if (!fid || fid === '0') continue;
        blockProducts.push(fid);
      }
    }

    if (state === 'IN_PRODUCTS') flushBlock();

    // ── Resumo e alertas ──────────────────────────────────────────────────────
    progress(56, 'Calculando resumo…');

    const mpsComTid = mps.filter((m) => m.cod_tid !== null).length;

    const formulaIdsDuplicados = [...formulaIdCount.entries()]
      .filter(([, n]) => n > 1)
      .map(([id]) => id)
      .sort();

    const tidCount = new Map<string, number>();
    for (const mp of mps) {
      if (mp.cod_tid) tidCount.set(mp.cod_tid, (tidCount.get(mp.cod_tid) ?? 0) + 1);
    }
    const codTidDuplicados = [...tidCount.entries()]
      .filter(([, n]) => n > 1)
      .map(([tid]) => tid)
      .sort();

    const sumByFormula = new Map<string, number>();
    for (const r of formulaItems) {
      sumByFormula.set(r.formula_id, (sumByFormula.get(r.formula_id) ?? 0) + r.percentual);
    }
    const formulasSomaNaoFecha = [...sumByFormula.entries()]
      .filter(([, s]) => Math.abs(s - 1) > 0.06)
      .map(([id]) => id)
      .sort();

    progress(58, 'Parse concluído. Aguardando gravação…');

    self.postMessage({
      type: 'result',
      mps,
      formulaItems,
      summary: {
        totalMPs:             mps.length,
        mpsComTid,
        mpsSemTid:            mps.length - mpsComTid,
        totalFormulas:        formulaIdCount.size,
        totalItens:           formulaItems.length,
        formulaIdsDuplicados,
        codTidDuplicados,
        formulasSomaNaoFecha,
      },
    });
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err?.message ?? 'Erro desconhecido no worker.' });
  }
};
