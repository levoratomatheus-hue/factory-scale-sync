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
 * Ajusta o estoque quando a quantidade de uma OP muda (mesma fórmula).
 * Aplica apenas a diferença (qtdNova − qtdAntiga), sem duplicar a baixa original.
 * - delta > 0 → aumentou → gera saida (baixa adicional)
 * - delta < 0 → diminuiu → gera estorno (devolve ao estoque)
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

  // 1. Itens da fórmula
  const { data: formulaItens } = await supabase
    .from('formulas')
    .select('cod_mp, materia_prima, percentual')
    .eq('formula_id', formulaId);

  if (!formulaItens || formulaItens.length === 0) return;

  // 2. cod_tid → cod_excel
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

  // 3. Para cada MP, aplicar delta
  for (const item of formulaItens as any[]) {
    const codExcel = deparaMap.get(item.cod_mp);
    if (!codExcel) continue;

    const deltaKg = (item.percentual / 100) * diferenca;
    if (deltaKg === 0) continue;

    const { data: estoqueAtual } = await (supabase as any)
      .from('estoque_mp')
      .select('saldo_kg')
      .eq('cod_mp_excel', codExcel)
      .maybeSingle();

    const saldoAtual: number = (estoqueAtual as any)?.saldo_kg ?? 0;
    const novoSaldo = saldoAtual - deltaKg; // delta > 0 → baixa mais; delta < 0 → devolve

    await (supabase as any).from('estoque_mp').upsert(
      {
        cod_mp_excel: codExcel,
        materia_prima: item.materia_prima,
        saldo_kg: novoSaldo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'cod_mp_excel' },
    );

    // tipo: saida se consumiu mais; estorno se devolveu
    const tipo = deltaKg > 0 ? 'saida' : 'estorno';
    await (supabase as any).from('estoque_movimentacoes').insert({
      cod_mp_excel: codExcel,
      materia_prima: item.materia_prima,
      tipo,
      quantidade_kg: -deltaKg, // negativo para saida; positivo para estorno
      saldo_apos: novoSaldo,
      ordem_id: ordemId,
      ordem_lote: lote,
      observacao: `Ajuste de quantidade — Lote ${lote} (${qtdAntiga} → ${qtdNova} kg)`,
      criado_por: criadoPor ?? null,
    });
  }
}

/**
 * Estorna o efeito líquido de uma OP no estoque quando ela é excluída.
 *
 * Considera TODOS os movimentos da OP (saida + estorno de ajustes anteriores),
 * calcula o efeito líquido por MP e reverte exatamente esse valor.
 * Isso garante simetria mesmo quando a quantidade foi ajustada várias vezes.
 */
export async function estornarEstoqueOP(
  ordemId: string,
  criadoPor?: string,
): Promise<void> {
  // Busca todos os movimentos de estoque desta OP que afetam o saldo
  const { data: movimentos } = await (supabase as any)
    .from('estoque_movimentacoes')
    .select('*')
    .eq('ordem_id', ordemId)
    .in('tipo', ['saida', 'estorno']);

  if (!movimentos || movimentos.length === 0) return;

  // Agrupa por cod_mp_excel e calcula efeito líquido
  // saida → quantidade_kg negativo; estorno → quantidade_kg positivo
  const netByCod = new Map<string, { rep: any; net: number }>();
  for (const mov of movimentos as any[]) {
    if (!netByCod.has(mov.cod_mp_excel)) {
      netByCod.set(mov.cod_mp_excel, { rep: mov, net: 0 });
    }
    netByCod.get(mov.cod_mp_excel)!.net += Number(mov.quantidade_kg);
  }

  for (const [codExcel, { rep, net }] of netByCod) {
    if (net === 0) continue; // efeito líquido zero — nada a fazer

    // net é negativo quando o consumo > devoluções.
    // Para restaurar: adicionar -net ao saldo.
    const qtyRestaurar = -net;

    const { data: estoqueAtual } = await (supabase as any)
      .from('estoque_mp')
      .select('saldo_kg')
      .eq('cod_mp_excel', codExcel)
      .maybeSingle();

    if (!estoqueAtual) continue;

    const novoSaldo = (estoqueAtual as any).saldo_kg + qtyRestaurar;

    await (supabase as any)
      .from('estoque_mp')
      .update({ saldo_kg: novoSaldo, atualizado_em: new Date().toISOString() })
      .eq('cod_mp_excel', codExcel);

    await (supabase as any).from('estoque_movimentacoes').insert({
      cod_mp_excel: codExcel,
      materia_prima: rep.materia_prima,
      tipo: 'estorno',
      quantidade_kg: qtyRestaurar,
      saldo_apos: novoSaldo,
      ordem_id: ordemId,
      ordem_lote: rep.ordem_lote,
      observacao: `Estorno — OP excluída (Lote ${rep.ordem_lote ?? ''})`,
      criado_por: criadoPor ?? null,
    });
  }
}
