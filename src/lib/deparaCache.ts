/**
 * deparaCache.ts
 *
 * Cache para a tabela `mp_depara` (mapeamento cod_excel ↔ cod_tid).
 * A tabela muda raramente; um TTL de 5 min é suficiente.
 *
 * Sem cache: a tabela era buscada em paralelo por compararFormulas e
 * acertosEnriquecidos a cada busca de lote — 2 round trips idênticos.
 * Com cache: 1 round trip na primeira busca, instantâneo nas demais.
 */
import { supabase } from "@/integrations/supabase/client";

export type DeparaRow = {
  cod_excel: string;
  cod_tid: string | null;
};

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutos

let _cache: { rows: DeparaRow[]; fetchedAt: number } | null = null;

export async function fetchAllDepara(): Promise<DeparaRow[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.rows;
  }

  const { data } = await (supabase as any)
    .from("mp_depara")
    .select("cod_excel, cod_tid")
    .not("cod_tid", "is", null);

  const rows: DeparaRow[] = data ?? [];
  _cache = { rows, fetchedAt: Date.now() };
  return rows;
}

export function invalidateDeparaCache(): void {
  _cache = null;
}
