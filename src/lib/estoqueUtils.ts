import { supabase } from '@/integrations/supabase/client';
import { fetchAllDepara } from '@/lib/deparaCache';

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Busca itens da fórmula + mapa depara (cod_tid → cod_excel) em paralelo. */
async function fetchFormulaDeparaMap(formulaId: string): Promise<{
  formulaItens: { cod_mp: string; materia_prima: string; percentual: number }[];
  deparaMap: Map<string, string>;
}> {
  const [formulaResult, allDepara] = await Promise.all([
    supabase
      .from('formulas')
      .select('cod_mp, materia_prima, percentual')
      .eq('formula_id', formulaId),
    fetchAllDepara(), // cache — 0 ms se já populado
  ]);

  const formulaItens = (formulaResult.data ?? []) as { cod_mp: string; materia_prima: string; percentual: number }[];

  const deparaMap = new Map<string, string>();
  for (const r of allDepara) {
    if (r.cod_tid) deparaMap.set(r.cod_tid, r.cod_excel);
  }

  return { formulaItens, deparaMap };
}

/** Busca saldos atuais de uma lista de cod_mp_excel em UMA query. */
async function fetchSaldos(codsExcel: string[]): Promise<Map<string, number>> {
  if (codsExcel.length === 0) return new Map();
  const { data } = await (supabase as any)
    .from('estoque_mp')
    .select('cod_mp_excel, saldo_kg')
    .in('cod_mp_excel', codsExcel);
  const map = new Map<string, number>();
  for (const e of (data ?? []) as any[]) map.set(e.cod_mp_excel, e.saldo_kg ?? 0);
  return map;
}

// ── Baixar estoque ────────────────────────────────────────────────────────────

/**
 * Baixa o consumo teórico de cada MP da fórmula quando uma OP é criada.
 *
 * Antes: 2 + N×3 round trips (N = nº de MPs na fórmula).
 * Agora: 3 round trips fixos, independente do tamanho da fórmula.
 *   1. formulas + deparaCache em paralelo
 *   2. estoque_mp WHERE IN (todos os cods de uma vez)
 *   3. upsert estoque_mp + insert movimentacoes em paralelo
 */
export async function baixarEstoqueOP(
  ordemId: string,
  formulaId: string,
  quantidade: number,
  lote: string,
  criadoPor?: string,
): Promise<void> {
  const { formulaItens, deparaMap } = await fetchFormulaDeparaMap(formulaId);
  if (formulaItens.length === 0) return;

  // Calcular MPs e quantidades
  type MPBaixa = { codExcel: string; materia_prima: string; qty: number };
  const mps: MPBaixa[] = [];
  for (const item of formulaItens) {
    const codExcel = deparaMap.get(item.cod_mp);
    if (!codExcel) continue;
    const qty = (item.percentual / 100) * quantidade;
    if (qty <= 0) continue;
    mps.push({ codExcel, materia_prima: item.materia_prima, qty });
  }
  if (mps.length === 0) return;

  // Buscar todos os saldos em uma query
  const saldoMap = await fetchSaldos(mps.map((m) => m.codExcel));

  const agora = new Date().toISOString();
  const upsertRows: any[] = [];
  const movimentacoes: any[] = [];

  for (const { codExcel, materia_prima, qty } of mps) {
    const novoSaldo = (saldoMap.get(codExcel) ?? 0) - qty;
    upsertRows.push({ cod_mp_excel: codExcel, materia_prima, saldo_kg: novoSaldo, atualizado_em: agora });
    movimentacoes.push({
      cod_mp_excel: codExcel, materia_prima, tipo: 'saida',
      quantidade_kg: -qty, saldo_apos: novoSaldo,
      ordem_id: ordemId, ordem_lote: lote,
      observacao: `Baixa automática — OP Lote ${lote}`,
      criado_por: criadoPor ?? null,
    });
  }

  // Upsert + insert em paralelo
  await Promise.all([
    (supabase as any).from('estoque_mp').upsert(upsertRows, { onConflict: 'cod_mp_excel' }),
    (supabase as any).from('estoque_movimentacoes').insert(movimentacoes),
  ]);
}

// ── Ajustar estoque ───────────────────────────────────────────────────────────

/**
 * Ajusta o estoque quando a quantidade de uma OP muda (mesma fórmula).
 * Aplica apenas a diferença (qtdNova − qtdAntiga), sem duplicar a baixa original.
 *
 * Mesmo padrão batch de baixarEstoqueOP: 3 round trips fixos.
 */
export async function ajustarEstoqueOP(
  ordemId: string,
  formulaId: string,
  qtdAntiga: number,
  qtdNova: number,
  lote: string,
  criadoPor?: string,
): Promise<void> {
  const diferenca = qtdNova - qtdAntiga;
  if (diferenca === 0) return;

  const { formulaItens, deparaMap } = await fetchFormulaDeparaMap(formulaId);
  if (formulaItens.length === 0) return;

  type MPAjuste = { codExcel: string; materia_prima: string; deltaKg: number };
  const mps: MPAjuste[] = [];
  for (const item of formulaItens) {
    const codExcel = deparaMap.get(item.cod_mp);
    if (!codExcel) continue;
    const deltaKg = (item.percentual / 100) * diferenca;
    if (deltaKg === 0) continue;
    mps.push({ codExcel, materia_prima: item.materia_prima, deltaKg });
  }
  if (mps.length === 0) return;

  const saldoMap = await fetchSaldos(mps.map((m) => m.codExcel));

  const agora = new Date().toISOString();
  const upsertRows: any[] = [];
  const movimentacoes: any[] = [];

  for (const { codExcel, materia_prima, deltaKg } of mps) {
    const novoSaldo = (saldoMap.get(codExcel) ?? 0) - deltaKg;
    const tipo = deltaKg > 0 ? 'saida' : 'estorno';
    upsertRows.push({ cod_mp_excel: codExcel, materia_prima, saldo_kg: novoSaldo, atualizado_em: agora });
    movimentacoes.push({
      cod_mp_excel: codExcel, materia_prima, tipo,
      quantidade_kg: -deltaKg, saldo_apos: novoSaldo,
      ordem_id: ordemId, ordem_lote: lote,
      observacao: `Ajuste de quantidade — Lote ${lote} (${qtdAntiga} → ${qtdNova} kg)`,
      criado_por: criadoPor ?? null,
    });
  }

  await Promise.all([
    (supabase as any).from('estoque_mp').upsert(upsertRows, { onConflict: 'cod_mp_excel' }),
    (supabase as any).from('estoque_movimentacoes').insert(movimentacoes),
  ]);
}

// ── Estornar estoque ──────────────────────────────────────────────────────────

/**
 * Estorna o efeito líquido de uma OP no estoque quando ela é excluída.
 *
 * Considera TODOS os movimentos da OP (saida + estorno de ajustes anteriores),
 * calcula o efeito líquido por MP e reverte exatamente esse valor.
 * Mesmo padrão batch: 3 round trips fixos.
 */
export async function estornarEstoqueOP(
  ordemId: string,
  criadoPor?: string,
): Promise<void> {
  const { data: movimentos } = await (supabase as any)
    .from('estoque_movimentacoes')
    .select('*')
    .eq('ordem_id', ordemId)
    .in('tipo', ['saida', 'estorno']);

  if (!movimentos || movimentos.length === 0) return;

  // Efeito líquido por cod_mp_excel
  const netByCod = new Map<string, { rep: any; net: number }>();
  for (const mov of movimentos as any[]) {
    if (!netByCod.has(mov.cod_mp_excel)) netByCod.set(mov.cod_mp_excel, { rep: mov, net: 0 });
    netByCod.get(mov.cod_mp_excel)!.net += Number(mov.quantidade_kg);
  }

  const entries = [...netByCod.entries()].filter(([, { net }]) => net !== 0);
  if (entries.length === 0) return;

  // Buscar todos os saldos em uma query
  const codsExcel = entries.map(([cod]) => cod);
  const saldoMap = await fetchSaldos(codsExcel);

  const agora = new Date().toISOString();
  const upsertRows: any[] = [];
  const movimentacoes: any[] = [];

  for (const [codExcel, { rep, net }] of entries) {
    const saldoAtual = saldoMap.get(codExcel);
    if (saldoAtual === undefined) continue; // MP sem registro — nada a estornar

    const qtyRestaurar = -net;
    const novoSaldo = saldoAtual + qtyRestaurar;

    upsertRows.push({ cod_mp_excel: codExcel, materia_prima: rep.materia_prima, saldo_kg: novoSaldo, atualizado_em: agora });
    movimentacoes.push({
      cod_mp_excel: codExcel, materia_prima: rep.materia_prima, tipo: 'estorno',
      quantidade_kg: qtyRestaurar, saldo_apos: novoSaldo,
      ordem_id: ordemId, ordem_lote: rep.ordem_lote,
      observacao: `Estorno — OP excluída (Lote ${rep.ordem_lote ?? ''})`,
      criado_por: criadoPor ?? null,
    });
  }

  await Promise.all([
    (supabase as any).from('estoque_mp').upsert(upsertRows, { onConflict: 'cod_mp_excel' }),
    (supabase as any).from('estoque_movimentacoes').insert(movimentacoes),
  ]);
}
