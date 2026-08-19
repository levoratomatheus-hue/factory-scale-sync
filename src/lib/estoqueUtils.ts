import { supabase } from '@/integrations/supabase/client';

/**
 * Baixa o consumo teórico de cada MP da fórmula quando uma OP é criada.
 * Fórmula: (percentual / 100) × quantidade_op
 */
export async function baixarEstoqueOP(
  ordemId: string,
  formulaId: string,
  quantidade: number,
  lote: string,
  criadoPor?: string,
): Promise<void> {
  // 1. Itens da fórmula base
  const { data: formulaItens } = await supabase
    .from('formulas')
    .select('cod_mp, materia_prima, percentual')
    .eq('formula_id', formulaId);

  if (!formulaItens || formulaItens.length === 0) return;

  // 2. Mapa cod_tid → cod_excel via mp_depara
  const codsTid = (formulaItens as any[]).map((i) => i.cod_mp).filter(Boolean);
  if (codsTid.length === 0) return;

  const { data: deparaRows } = await supabase
    .from('mp_depara')
    .select('cod_tid, cod_excel')
    .in('cod_tid', codsTid);

  const deparaMap = new Map<string, string>();
  for (const r of (deparaRows ?? []) as any[]) {
    deparaMap.set(r.cod_tid, r.cod_excel);
  }

  // 3. Para cada MP da fórmula, baixar o saldo
  for (const item of formulaItens as any[]) {
    const codExcel = deparaMap.get(item.cod_mp);
    if (!codExcel) continue;

    const qty = (item.percentual / 100) * quantidade;
    if (qty <= 0) continue;

    // Saldo atual (pode não existir)
    const { data: estoqueAtual } = await (supabase as any)
      .from('estoque_mp')
      .select('saldo_kg')
      .eq('cod_mp_excel', codExcel)
      .maybeSingle();

    const saldoAtual: number = (estoqueAtual as any)?.saldo_kg ?? 0;
    const novoSaldo = saldoAtual - qty;

    // Upsert: cria o registro se não existir (saldo negativo é permitido)
    await (supabase as any).from('estoque_mp').upsert(
      {
        cod_mp_excel: codExcel,
        materia_prima: item.materia_prima,
        saldo_kg: novoSaldo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'cod_mp_excel' },
    );

    // Movimentação saida
    await (supabase as any).from('estoque_movimentacoes').insert({
      cod_mp_excel: codExcel,
      materia_prima: item.materia_prima,
      tipo: 'saida',
      quantidade_kg: -qty,
      saldo_apos: novoSaldo,
      ordem_id: ordemId,
      ordem_lote: lote,
      observacao: `Baixa automática — OP Lote ${lote}`,
      criado_por: criadoPor ?? null,
    });
  }
}

/**
 * Estorna todas as saídas de uma OP quando ela é excluída.
 */
export async function estornarEstoqueOP(
  ordemId: string,
  criadoPor?: string,
): Promise<void> {
  const { data: saidas } = await (supabase as any)
    .from('estoque_movimentacoes')
    .select('*')
    .eq('ordem_id', ordemId)
    .eq('tipo', 'saida');

  if (!saidas || saidas.length === 0) return;

  for (const saida of saidas as any[]) {
    const qtyRestaurar = Math.abs(saida.quantidade_kg);

    const { data: estoqueAtual } = await (supabase as any)
      .from('estoque_mp')
      .select('saldo_kg')
      .eq('cod_mp_excel', saida.cod_mp_excel)
      .maybeSingle();

    if (!estoqueAtual) continue;

    const novoSaldo = (estoqueAtual as any).saldo_kg + qtyRestaurar;

    await (supabase as any)
      .from('estoque_mp')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('cod_mp_excel', saida.cod_mp_excel);

    await (supabase as any).from('estoque_movimentacoes').insert({
      cod_mp_excel: saida.cod_mp_excel,
      materia_prima: saida.materia_prima,
      tipo: 'estorno',
      quantidade_kg: qtyRestaurar,
      saldo_apos: novoSaldo,
      ordem_id: ordemId,
      ordem_lote: saida.ordem_lote,
      observacao: `Estorno — OP excluída (Lote ${saida.ordem_lote ?? ''})`,
      criado_por: criadoPor ?? null,
    });
  }
}
