/**
 * formulasCache.ts
 *
 * Helper centralizado para carregar a tabela `formulas` inteira.
 *
 * Problema: o PostgREST ignora .limit() acima do max-rows configurado
 * (padrão 1.000 linhas). Com 37.011 itens e BATCH_SIZE=500 no useCompras,
 * cada chunk retornava só 1.000 das ~3.350 linhas esperadas, deixando
 * 429 OPs marcadas como "fórmula inexistente".
 *
 * Solução: paginar com .range(offset, offset + PAGE_SIZE - 1) em loop,
 * acumulando até a tabela acabar. Cache de 5 min evita re-fetches
 * desnecessários quando múltiplas telas carregam no mesmo período.
 */
import { supabase } from "@/integrations/supabase/client";

// Colunas usadas por todos os consumers: useCompras + compararFormulas
export type FormulaRow = {
  formula_id: string;
  materia_prima: string;
  percentual: number;
  cod_mp: string | null;
};

const PAGE_SIZE = 1_000; // uma página = máximo que o PostgREST permite por vez
const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutos

let _cache: { rows: FormulaRow[]; fetchedAt: number } | null = null;

/**
 * Retorna TODOS os itens da tabela `formulas`, paginando automaticamente.
 * Usa cache em módulo — chamadas subsequentes dentro de 5 min retornam
 * o mesmo array sem queries adicionais ao Supabase.
 */
export async function fetchAllFormulas(): Promise<FormulaRow[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.rows;
  }

  // 1. Conta total de linhas (head=true = sem dados, só o header count)
  const { count } = await (supabase as any)
    .from("formulas")
    .select("*", { count: "exact", head: true });

  const total = count ?? 0;
  if (total === 0) {
    _cache = { rows: [], fetchedAt: Date.now() };
    return [];
  }

  // 2. Dispara todas as páginas em paralelo (antes eram sequenciais)
  const numPages = Math.ceil(total / PAGE_SIZE);
  const pages = await Promise.all(
    Array.from({ length: numPages }, (_, i) =>
      (supabase as any)
        .from("formulas")
        .select("formula_id, materia_prima, percentual, cod_mp")
        .order("formula_id", { ascending: true })
        .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1),
    ),
  );

  const rows: FormulaRow[] = [];
  for (const page of pages) {
    if (page.data) rows.push(...(page.data as FormulaRow[]));
  }

  _cache = { rows, fetchedAt: Date.now() };
  return rows;
}

/** Invalida o cache manualmente (ex.: após importação de novas fórmulas). */
export function invalidateFormulasCache(): void {
  _cache = null;
}
