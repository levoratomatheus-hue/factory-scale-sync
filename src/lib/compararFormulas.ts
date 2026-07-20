/**
 * Módulo compartilhado de comparação TID × Excel.
 *
 * Exporta:
 *   compararFormulas(formulaId)     → ResultadoComparacao
 *   conferirTodasFormulas(onProg?)  → ResultadoConferirTodas
 *
 * CriarOrdem.tsx e PainelConsultaFormula.tsx usam exatamente este código —
 * nunca duplicar a lógica entre as duas telas.
 */

import { supabase } from '@/integrations/supabase/client';

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type EstadoComparacao = 'ok' | 'divergente' | 'sem_depara' | 'sem_excel';

export interface SubstituicaoInfo {
  de: string;
  para: string;
  desc: string;
}

// ── Regras de substituição para variantes "-1" ────────────────────────────────
//
// Fórmulas cujo produto_chave termina em "-1" usam PEBD recuperado no lugar do
// virgem.  A planilha Excel ainda lista o virgem (500028) nos dois lados, mas a
// comparação deve tratar os dois como equivalentes — daí a normalização simétrica.
// Para cobrir novos casos no futuro, basta adicionar uma entrada aqui.
//
const SUBSTITUICOES_VARIANTE: SubstituicaoInfo[] = [
  { de: '500028', para: '500319', desc: 'PEBD virgem → PEBD recuperado' },
];

/** Normaliza um código Excel pela tabela de substituições (retorna o mesmo cod se não houver regra). */
function substituirCodigo(cod: string, subs: SubstituicaoInfo[]): string {
  const s = subs.find((r) => r.de === cod);
  return s ? s.para : cod;
}

export interface ItemComparado {
  cod_excel: string;
  materia_prima: string;
  pct_tid: number | null;   // escala 0-100; null = só no Excel
  pct_excel: number | null; // escala 0-100 (raw×100); null = só no TID
  isDiff: boolean;
}

export interface MpSemDepara {
  cod_mp: string;
  materia_prima: string;
  motivo: 'sem_depara' | 'ambiguo';
}

export interface ResultadoComparacao {
  status: EstadoComparacao;
  itens: ItemComparado[];          // vazio quando sem_depara ou sem_excel
  nDiffs: number;
  mpsSemDepara: MpSemDepara[];
  produtoChaveExcel: string | null; // ex.: "MBG-10-3156"; null se coluna não existe ainda
  isVariante: boolean;              // produto_chave termina em "-1"
  substituicoesAplicadas: SubstituicaoInfo[]; // substituições efetivamente usadas nesta comparação
}

export interface ItemConferencia {
  formula_id: string;
  status: EstadoComparacao;
  nDiffs: number;
  nMpsSemDepara: number;
}

export interface ResultadoConferirTodas {
  totalVerificadas: number;
  ok: number;
  divergentes: ItemConferencia[];  // ordenados por nDiffs desc
  semDepara: ItemConferencia[];
  semFórmulaTid: number;           // existe no Excel mas não no TID
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Constrói mapa cod_tid → cod_excel[] a partir das linhas de mp_depara. */
function buildTidToExcel(depara: { cod_tid: string | null; cod_excel: string }[]) {
  const map = new Map<string, string[]>();
  for (const row of depara) {
    if (!row.cod_tid) continue;
    if (!map.has(row.cod_tid)) map.set(row.cod_tid, []);
    map.get(row.cod_tid)!.push(row.cod_excel);
  }
  return map;
}

/**
 * Núcleo da comparação — funciona sobre dados já em memória.
 * Reutilizado por compararFormulas (query individual) e conferirTodasFormulas (batch).
 *
 * Quando isVariante=true, os códigos Excel de ambos os lados (TID traduzido e
 * itens do Excel) são normalizados via SUBSTITUICOES_VARIANTE antes de comparar.
 * Isso garante simetria: formulas ainda no virgem continuam casando, e fórmulas
 * já atualizadas para o recuperado também casam.
 */
function compararEmMemoria(
  tidItens: { cod_mp: string; materia_prima: string; percentual: number }[],
  excelItens: { cod_mp_excel: string; materia_prima: string; percentual: number }[],
  tidToExcel: Map<string, string[]>,
  produtoChaveExcel: string | null,
  isVariante: boolean,
): ResultadoComparacao {
  const subs = isVariante ? SUBSTITUICOES_VARIANTE : [];
  const substituicoesAplicadas: SubstituicaoInfo[] = [];

  /** Normaliza código e registra substituição se foi aplicada (dedup por 'de'). */
  const normalizar = (cod: string): string => {
    const norm = substituirCodigo(cod, subs);
    if (norm !== cod && !substituicoesAplicadas.some((s) => s.de === cod)) {
      substituicoesAplicadas.push(subs.find((s) => s.de === cod)!);
    }
    return norm;
  };

  // 1. Traduzir cod_mp do TID → cod_excel via de-para, normalizando substituições
  const mpsSemDepara: MpSemDepara[] = [];
  const translated: { cod_excel: string; materia_prima: string; percentual: number }[] = [];

  for (const item of tidItens) {
    const excels = tidToExcel.get(item.cod_mp);
    if (!excels || excels.length === 0) {
      mpsSemDepara.push({ cod_mp: item.cod_mp, materia_prima: item.materia_prima, motivo: 'sem_depara' });
    } else if (excels.length > 1) {
      mpsSemDepara.push({ cod_mp: item.cod_mp, materia_prima: item.materia_prima, motivo: 'ambiguo' });
    } else {
      translated.push({ cod_excel: normalizar(excels[0]), materia_prima: item.materia_prima, percentual: item.percentual });
    }
  }

  if (mpsSemDepara.length > 0) {
    return { status: 'sem_depara', itens: [], nDiffs: 0, mpsSemDepara, produtoChaveExcel, isVariante, substituicoesAplicadas };
  }

  // 2. Comparar percentuais (Excel × 100 para igualar escala do TID).
  //    Os códigos do Excel também são normalizados para a mesma base da substituição.
  const excelByCode = new Map<string, { pct: number; nome: string }>();
  for (const item of excelItens) {
    excelByCode.set(normalizar(item.cod_mp_excel), { pct: item.percentual * 100, nome: item.materia_prima });
  }
  const tidByCode = new Map<string, { materia_prima: string; percentual: number }>();
  for (const item of translated) {
    tidByCode.set(item.cod_excel, { materia_prima: item.materia_prima, percentual: item.percentual });
  }

  const allCodes = new Set([...tidByCode.keys(), ...excelByCode.keys()]);
  const itens: ItemComparado[] = [];
  let nDiffs = 0;

  for (const cod_excel of allCodes) {
    const t = tidByCode.get(cod_excel);
    const e = excelByCode.get(cod_excel);
    const pct_tid   = t?.percentual ?? null;
    const pct_excel = e?.pct ?? null;
    const isDiff    = pct_tid === null || pct_excel === null || Math.abs(pct_tid - pct_excel) > 0.01;
    if (isDiff) nDiffs++;
    itens.push({ cod_excel, materia_prima: t?.materia_prima ?? e!.nome, pct_tid, pct_excel, isDiff });
  }

  // Divergentes primeiro, depois conferidos
  itens.sort((a, b) => (b.isDiff ? 1 : 0) - (a.isDiff ? 1 : 0));

  const status: EstadoComparacao = nDiffs > 0 ? 'divergente' : 'ok';
  return { status, itens, nDiffs, mpsSemDepara: [], produtoChaveExcel, isVariante, substituicoesAplicadas };
}

// ── compararFormulas ──────────────────────────────────────────────────────────

const VAZIO: ResultadoComparacao = {
  status: 'sem_excel',
  itens: [],
  nDiffs: 0,
  mpsSemDepara: [],
  produtoChaveExcel: null,
  isVariante: false,
  substituicoesAplicadas: [],
};

export async function compararFormulas(formulaId: string): Promise<ResultadoComparacao> {
  // 1. Buscar itens do Excel
  const { data: excelItens, error: excelErr } = await (supabase as any)
    .from('formulas_excel')
    .select('cod_mp_excel, materia_prima, percentual')
    .eq('formula_id', formulaId);

  if (excelErr || !excelItens || excelItens.length === 0) return VAZIO;

  // 2. Tentar buscar produto_chave (coluna pode não existir ainda)
  let produtoChaveExcel: string | null = null;
  try {
    const { data: chaveData } = await (supabase as any)
      .from('formulas_excel')
      .select('produto_chave')
      .eq('formula_id', formulaId)
      .eq('sequencia', 1)
      .maybeSingle();
    produtoChaveExcel = chaveData?.produto_chave ?? null;
  } catch { /* coluna ainda não existe — silencioso */ }

  // Detectar variante "-1": produto_chave termina em "-1" (ex.: MBG-10-1024-1)
  const isVariante = produtoChaveExcel?.endsWith('-1') ?? false;

  // 3. Buscar itens do TID
  const { data: tidItens } = await (supabase as any)
    .from('formulas')
    .select('cod_mp, materia_prima, percentual')
    .eq('formula_id', formulaId)
    .order('sequencia', { ascending: true });

  if (!tidItens || tidItens.length === 0) return { ...VAZIO, produtoChaveExcel, isVariante };

  // 4. Buscar de-para (só MPs com cod_tid preenchido)
  const { data: depara } = await (supabase as any)
    .from('mp_depara')
    .select('cod_excel, cod_tid')
    .not('cod_tid', 'is', null);

  const tidToExcel = buildTidToExcel(depara ?? []);

  return compararEmMemoria(tidItens, excelItens, tidToExcel, produtoChaveExcel, isVariante);
}

// ── conferirTodasFormulas ─────────────────────────────────────────────────────

export async function conferirTodasFormulas(
  onProgress?: (done: number, total: number) => void,
): Promise<ResultadoConferirTodas> {
  const PAGE = 1000;

  // 1. Buscar TODOS os itens do Excel (paginado) — inclui produto_chave para detectar variantes
  const allExcel: { formula_id: string; cod_mp_excel: string; percentual: number; produto_chave: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await (supabase as any)
      .from('formulas_excel')
      .select('formula_id, cod_mp_excel, percentual, produto_chave')
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    allExcel.push(...data);
    if (data.length < PAGE) break;
  }

  // 2. Agrupar por formula_id; capturar produto_chave (mesmo valor em todas as linhas da fórmula)
  const excelByFormula = new Map<string, { cod_mp_excel: string; percentual: number }[]>();
  const produtoChaveByFormula = new Map<string, string | null>();
  for (const r of allExcel) {
    if (!excelByFormula.has(r.formula_id)) {
      excelByFormula.set(r.formula_id, []);
      produtoChaveByFormula.set(r.formula_id, r.produto_chave ?? null);
    }
    excelByFormula.get(r.formula_id)!.push({ cod_mp_excel: r.cod_mp_excel, percentual: r.percentual });
  }

  const allFormulaIds = [...excelByFormula.keys()];

  // 3. Buscar itens do TID em chunks de 100
  const tidByFormula = new Map<string, { cod_mp: string; materia_prima: string; percentual: number }[]>();
  const CHUNK = 100;
  for (let i = 0; i < allFormulaIds.length; i += CHUNK) {
    const chunk = allFormulaIds.slice(i, i + CHUNK);
    const { data } = await (supabase as any)
      .from('formulas')
      .select('formula_id, cod_mp, materia_prima, percentual')
      .in('formula_id', chunk);
    for (const r of data ?? []) {
      if (!tidByFormula.has(r.formula_id)) tidByFormula.set(r.formula_id, []);
      tidByFormula.get(r.formula_id)!.push({ cod_mp: r.cod_mp, materia_prima: r.materia_prima, percentual: r.percentual });
    }
  }

  // 4. Buscar de-para (uma vez)
  const { data: deparaAll } = await (supabase as any)
    .from('mp_depara')
    .select('cod_excel, cod_tid')
    .not('cod_tid', 'is', null);

  const tidToExcel = buildTidToExcel(deparaAll ?? []);

  // 5. Processar em memória
  const resultado: ResultadoConferirTodas = {
    totalVerificadas: allFormulaIds.length,
    ok: 0,
    divergentes: [],
    semDepara: [],
    semFórmulaTid: 0,
  };

  let done = 0;
  for (const fid of allFormulaIds) {
    const excelItens = excelByFormula.get(fid)!;
    const tidItens   = tidByFormula.get(fid);

    if (!tidItens || tidItens.length === 0) {
      resultado.semFórmulaTid++;
    } else {
      // Detectar variante "-1" a partir do produto_chave da fórmula
      const produtoChave = produtoChaveByFormula.get(fid) ?? null;
      const isVariante   = produtoChave?.endsWith('-1') ?? false;
      const subs         = isVariante ? SUBSTITUICOES_VARIANTE : [];

      // Contar MPs sem de-para; traduzir TID → cod_excel normalizando substituições
      let nSemDepara = 0;
      const translated: { cod_excel: string; percentual: number }[] = [];
      for (const item of tidItens) {
        const excels = tidToExcel.get(item.cod_mp);
        if (!excels || excels.length === 0 || excels.length > 1) { nSemDepara++; }
        else { translated.push({ cod_excel: substituirCodigo(excels[0], subs), percentual: item.percentual }); }
      }

      if (nSemDepara > 0) {
        resultado.semDepara.push({ formula_id: fid, status: 'sem_depara', nDiffs: 0, nMpsSemDepara: nSemDepara });
      } else {
        // Normalizar códigos do Excel pelo mesmo mapa de substituição
        const excelMap = new Map(
          excelItens.map((e) => [substituirCodigo(e.cod_mp_excel, subs), e.percentual * 100])
        );
        const tidMap   = new Map(translated.map((t) => [t.cod_excel, t.percentual]));
        const allCodes = new Set([...tidMap.keys(), ...excelMap.keys()]);
        let nDiffs = 0;
        for (const code of allCodes) {
          const pt = tidMap.get(code) ?? null;
          const pe = excelMap.get(code) ?? null;
          if (pt === null || pe === null || Math.abs(pt - pe) > 0.01) nDiffs++;
        }
        if (nDiffs > 0) {
          resultado.divergentes.push({ formula_id: fid, status: 'divergente', nDiffs, nMpsSemDepara: 0 });
        } else {
          resultado.ok++;
        }
      }
    }

    done++;
    onProgress?.(done, allFormulaIds.length);
  }

  resultado.divergentes.sort((a, b) => b.nDiffs - a.nDiffs);
  return resultado;
}
