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

  const rows: FormulaRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await (supabase as any)
      .from("formulas")
      .select("formula_id, materia_prima, percentual, cod_mp")
      .order("formula_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) break;
    rows.push(...(data as FormulaRow[]));
    if (data.length < PAGE_SIZE) break; // última página — acabou
  }

  _cache = { rows, fetchedAt: Date.now() };
  return rows;
}

/** Invalida o cache manualmente (ex.: após importação de novas fórmulas). */
export function invalidateFormulasCache(): void {
  _cache = null;
}
