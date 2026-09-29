import { supabase } from '@/integrations/supabase/client';

// ── Helpers internos ──────────────────────────────────────────────────────────
//
// CÓDIGO TID + DUAS MARCAS (ZC e PG):
// A baixa por OP funciona por EXISTÊNCIA do código:
//   - estoque_mp     (ZC): coluna cod_tid
//   - estoque_mp_pg  (PG): coluna cod_pg
// Cada MP baixa da tabela onde o código existir. Os códigos NÃO colidem entre
// as duas tabelas, então a busca é inequívoca.
//
// formulas.cod_mp já é o código TID/PG da MP.

interface EstoqueRef {
  tabela: 'estoque_mp' | 'estoque_mp_pg';
  coluna: 'cod_tid' | 'cod_pg';
  saldo: number;
  materia_prima: string;
}

/** Busca os itens da fórmula (cod_mp já é o código da MP). */
async function fetchFormulaItens(formulaId: string): Promise<
  { cod_mp: string; materia_prima: string; percentual: number }[]
> {
  const { data } = await supabase
    .from('formulas')
    .select('cod_mp, materia_prima, percentual')
    .eq('formula_id', formulaId)
    .limit(500);

  return (data ?? []) as { cod_mp: string; materia_prima: string; percentual: number }[];
}

/**
 * Busca os itens novos de um reaproveitamento (eh_reaproveitado = false).
 * Esses são as MPs que entram por cima e devem ser baixadas do estoque.
 * Itens com eh_reaproveitado = true são a sobra reaproveitada — não mexe no estoque.
 */
async function fetchReaproveitamentoItens(reaproveitamentoId: string): Promise<
  { cod_tid: string | null; materia_prima: string; percentual: number }[]
> {
  const { data } = await (supabase as any)
    .from('reaproveitamentos_itens')
    .select('cod_tid, materia_prima, percentual')
    .eq('reaproveitamento_id', reaproveitamentoId)
    .eq('eh_reaproveitado', false)
    .limit(500);

  return (data ?? []) as { cod_tid: string | null; materia_prima: string; percentual: number }[];
}

/** Normaliza itens de qualquer fonte para { cod, materia_prima, qty } prontos para baixa. */
function buildMpList(
  itens: { cod: string | null; materia_prima: string; percentual: number }[],
  quantidade: number,
): { validos: { cod: string; materia_prima: string; qty: number }[]; semCod: string[] } {
  const validos: { cod: string; materia_prima: string; qty: number }[] = [];
  const semCod: string[] = [];
  for (const item of itens) {
    if (!item.cod) { semCod.push(item.materia_prima || '(sem nome)'); continue; }
    const qty = (item.percentual / 100) * quantidade;
    if (qty <= 0) continue;
    validos.push({ cod: item.cod, materia_prima: item.materia_prima, qty });
  }
  return { validos, semCod };
}

/**
 * Para uma lista de códigos, descobre em qual tabela cada um existe (ZC ou PG)
 * e devolve um mapa cod -> { tabela, coluna, saldo, materia_prima }.
 * Faz 2 queries (uma em cada tabela). Códigos não colidem entre as tabelas.
 */
async function localizarEstoque(cods: string[]): Promise<Map<string, EstoqueRef>> {
  const mapa = new Map<string, EstoqueRef>();
  if (cods.length === 0) return mapa;

  const [zc, pg] = await Promise.all([
    (supabase as any).from('estoque_mp').select('cod_tid, saldo_kg, materia_prima').in('cod_tid', cods),
    (supabase as any).from('estoque_mp_pg').select('cod_pg, saldo_kg, materia_prima').in('cod_pg', cods),
  ]);

  for (const r of (zc.data ?? []) as any[]) {
    mapa.set(String(r.cod_tid), {
      tabela: 'estoque_mp', coluna: 'cod_tid',
      saldo: r.saldo_kg ?? 0, materia_prima: r.materia_prima ?? '',
    });
  }
  for (const r of (pg.data ?? []) as any[]) {
    const cod = String(r.cod_pg);
    if (!mapa.has(cod)) { // ZC tem prioridade só por segurança; não colidem
      mapa.set(cod, {
        tabela: 'estoque_mp_pg', coluna: 'cod_pg',
        saldo: r.saldo_kg ?? 0, materia_prima: r.materia_prima ?? '',
      });
    }
  }
  return mapa;
}

// ── Baixar estoque ────────────────────────────────────────────────────────────

/**
 * Baixa o consumo teórico de cada MP quando uma OP é criada.
 * - reaproveitamentoId fornecido → usa reaproveitamentos_itens (eh_reaproveitado=false)
 * - reaproveitamentoId ausente   → comportamento original (fórmula)
 * Cada MP baixa da tabela onde seu código existe (ZC ou PG).
 */
export async function baixarEstoqueOP(
  ordemId: string,
  formulaId: string,
  quantidade: number,
  lote: string,
  criadoPor?: string,
  reaproveitamentoId?: string | null,
): Promise<void> {
  let rawItens: { cod: string | null; materia_prima: string; percentual: number }[];

  if (reaproveitamentoId) {
    const reapItens = await fetchReaproveitamentoItens(reaproveitamentoId);
    rawItens = reapItens.map((i) => ({ cod: i.cod_tid, materia_prima: i.materia_prima, percentual: i.percentual }));
  } else {
    const formulaItens = await fetchFormulaItens(formulaId);
    rawItens = formulaItens.map((i) => ({ cod: i.cod_mp, materia_prima: i.materia_prima, percentual: i.percentual }));
  }

  if (rawItens.length === 0) return;

  const { validos: mps, semCod } = buildMpList(rawItens, quantidade);
  if (semCod.length > 0) {
    console.warn(`[baixarEstoqueOP] ${semCod.length} MP(s) sem cod_tid — não baixadas: ${semCod.join(', ')}`);
  }
  if (mps.length === 0) return;

  const refMap = await localizarEstoque(mps.map((m) => m.cod));
  const agora = new Date().toISOString();

  // Agrupa updates por tabela
  const updatesZC: any[] = [];
  const updatesPG: any[] = [];
  const movimentacoes: any[] = [];

  for (const { cod, materia_prima, qty } of mps) {
    const ref = refMap.get(cod);
    if (!ref) continue; // MP sem cadastro em nenhuma tabela -> ignora
    const novoSaldo = ref.saldo - qty;
    const row = { [ref.coluna]: cod, materia_prima, saldo_kg: novoSaldo, atualizado_em: agora };
    if (ref.tabela === 'estoque_mp') updatesZC.push(row); else updatesPG.push(row);
    movimentacoes.push({
      cod_tid: cod, materia_prima, tipo: 'saida',
      quantidade_kg: -qty, saldo_apos: novoSaldo,
      ordem_id: ordemId, ordem_lote: lote,
      observacao: `Baixa automática — OP Lote ${lote}`,
      criado_por: criadoPor ?? null,
    });
  }

  const ops: Promise<any>[] = [];
  if (updatesZC.length) ops.push((supabase as any).from('estoque_mp').upsert(updatesZC, { onConflict: 'cod_tid' }));
  if (updatesPG.length) ops.push((supabase as any).from('estoque_mp_pg').upsert(updatesPG, { onConflict: 'cod_pg' }));
  if (movimentacoes.length) ops.push((supabase as any).from('estoque_movimentacoes').insert(movimentacoes));
  await Promise.all(ops);
}

// ── Ajustar estoque ───────────────────────────────────────────────────────────

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

  const formulaItens = await fetchFormulaItens(formulaId);
  if (formulaItens.length === 0) return;

  type MPAjuste = { cod: string; materia_prima: string; deltaKg: number };
  const mps: MPAjuste[] = [];
  for (const item of formulaItens) {
    const cod = item.cod_mp;
    if (!cod) continue;
    const deltaKg = (item.percentual / 100) * diferenca;
    if (deltaKg === 0) continue;
    mps.push({ cod, materia_prima: item.materia_prima, deltaKg });
  }
  if (mps.length === 0) return;

  const refMap = await localizarEstoque(mps.map((m) => m.cod));
  const agora = new Date().toISOString();

  const updatesZC: any[] = [];
  const updatesPG: any[] = [];
  const movimentacoes: any[] = [];

  for (const { cod, materia_prima, deltaKg } of mps) {
    const ref = refMap.get(cod);
    if (!ref) continue;
    const novoSaldo = ref.saldo - deltaKg;
    const tipo = deltaKg > 0 ? 'saida' : 'estorno';
    const row = { [ref.coluna]: cod, materia_prima, saldo_kg: novoSaldo, atualizado_em: agora };
    if (ref.tabela === 'estoque_mp') updatesZC.push(row); else updatesPG.push(row);
    movimentacoes.push({
      cod_tid: cod, materia_prima, tipo,
      quantidade_kg: -deltaKg, saldo_apos: novoSaldo,
      ordem_id: ordemId, ordem_lote: lote,
      observacao: `Ajuste de quantidade — Lote ${lote} (${qtdAntiga} → ${qtdNova} kg)`,
      criado_por: criadoPor ?? null,
    });
  }

  const ops: Promise<any>[] = [];
  if (updatesZC.length) ops.push((supabase as any).from('estoque_mp').upsert(updatesZC, { onConflict: 'cod_tid' }));
  if (updatesPG.length) ops.push((supabase as any).from('estoque_mp_pg').upsert(updatesPG, { onConflict: 'cod_pg' }));
  if (movimentacoes.length) ops.push((supabase as any).from('estoque_movimentacoes').insert(movimentacoes));
  await Promise.all(ops);
}

// ── Estornar estoque ──────────────────────────────────────────────────────────

export async function estornarEstoqueOP(
  ordemId: string,
  criadoPor?: string,
): Promise<void> {
  // Bug A fix: inclui ordem_lote no select para que rep.ordem_lote tenha valor ao gravar o estorno
  const { data: movimentos, error: errLeitura } = await (supabase as any)
    .from('estoque_movimentacoes')
    .select('cod_tid, quantidade_kg, materia_prima, ordem_lote')
    .eq('ordem_id', ordemId)
    .in('tipo', ['saida', 'estorno']);

  if (errLeitura) throw new Error(`Estorno: falha ao ler movimentações — ${errLeitura.message}`);
  if (!movimentos || movimentos.length === 0) return;

  // Efeito líquido por código
  const netByCod = new Map<string, { rep: any; net: number }>();
  for (const mov of movimentos as any[]) {
    if (!netByCod.has(mov.cod_tid)) netByCod.set(mov.cod_tid, { rep: mov, net: 0 });
    netByCod.get(mov.cod_tid)!.net += Number(mov.quantidade_kg);
  }

  const entries = [...netByCod.entries()].filter(([, { net }]) => net !== 0);
  if (entries.length === 0) return;

  const refMap = await localizarEstoque(entries.map(([cod]) => cod));
  const agora = new Date().toISOString();

  const updatesZC: any[] = [];
  const updatesPG: any[] = [];
  const movimentacoes: any[] = [];

  for (const [cod, { rep, net }] of entries) {
    const ref = refMap.get(cod);
    if (!ref) continue; // MP sem cadastro em nenhuma tabela -> nada a estornar

    const qtyRestaurar = -net;
    const novoSaldo = ref.saldo + qtyRestaurar;
    // ordem_lote: usa o valor da movimentação original; fallback '' para não quebrar NOT NULL
    const ordemLote: string = rep.ordem_lote ?? '';
    const row = { [ref.coluna]: cod, materia_prima: rep.materia_prima, saldo_kg: novoSaldo, atualizado_em: agora };
    if (ref.tabela === 'estoque_mp') updatesZC.push(row); else updatesPG.push(row);
    movimentacoes.push({
      cod_tid: cod, materia_prima: rep.materia_prima, tipo: 'estorno',
      quantidade_kg: qtyRestaurar, saldo_apos: novoSaldo,
      ordem_id: ordemId, ordem_lote: ordemLote,
      observacao: `Estorno — OP excluída (Lote ${ordemLote})`,
      criado_por: criadoPor ?? null,
    });
  }

  // Bug B fix: verifica o erro de cada operação Supabase e lança se houver falha
  // (Supabase nunca rejeita a Promise — sempre resolve { data, error })
  const [resZC, resPG, resMov] = await Promise.all([
    updatesZC.length
      ? (supabase as any).from('estoque_mp').upsert(updatesZC, { onConflict: 'cod_tid' })
      : Promise.resolve({ error: null }),
    updatesPG.length
      ? (supabase as any).from('estoque_mp_pg').upsert(updatesPG, { onConflict: 'cod_pg' })
      : Promise.resolve({ error: null }),
    movimentacoes.length
      ? (supabase as any).from('estoque_movimentacoes').insert(movimentacoes)
      : Promise.resolve({ error: null }),
  ]);

  if (resZC.error) throw new Error(`Estorno: falha ao atualizar saldo ZC — ${resZC.error.message}`);
  if (resPG.error) throw new Error(`Estorno: falha ao atualizar saldo PG — ${resPG.error.message}`);
  if (resMov.error) throw new Error(`Estorno: falha ao registrar movimentação — ${resMov.error.message}`);
}

// ── Verificar estoque ANTES de criar a OP (não baixa nada) ──────────────────

export interface MpFaltante {
  cod_tid: string;
  materia_prima: string;
  saldoAtual: number;
  consumo: number;
  saldoApos: number;
}

/**
 * Verifica se criar uma OP deixaria alguma MP com saldo negativo.
 * - reaproveitamentoId fornecido → verifica contra reaproveitamentos_itens (eh_reaproveitado=false)
 * - reaproveitamentoId ausente   → comportamento original (fórmula)
 * MP sem cadastro em nenhuma tabela é ignorada (não bloqueia).
 */
export async function verificarEstoqueOP(
  formulaId: string,
  quantidade: number,
  reaproveitamentoId?: string | null,
): Promise<MpFaltante[]> {
  let rawItens: { cod: string | null; materia_prima: string; percentual: number }[];

  if (reaproveitamentoId) {
    const reapItens = await fetchReaproveitamentoItens(reaproveitamentoId);
    rawItens = reapItens.map((i) => ({ cod: i.cod_tid, materia_prima: i.materia_prima, percentual: i.percentual }));
  } else {
    const formulaItens = await fetchFormulaItens(formulaId);
    rawItens = formulaItens.map((i) => ({ cod: i.cod_mp, materia_prima: i.materia_prima, percentual: i.percentual }));
  }

  if (rawItens.length === 0) return [];

  const { validos: mps, semCod } = buildMpList(rawItens, quantidade);
  if (semCod.length > 0) {
    console.warn(`[verificarEstoqueOP] ${semCod.length} MP(s) sem cod_tid ignoradas na verificação: ${semCod.join(', ')}`);
  }
  if (mps.length === 0) return [];

  const refMap = await localizarEstoque(mps.map((m) => m.cod));

  const faltantes: MpFaltante[] = [];
  for (const { cod, materia_prima, qty: consumo } of mps) {
    const ref = refMap.get(cod);
    if (!ref) continue; // sem cadastro -> não bloqueia
    const saldoApos = ref.saldo - consumo;
    if (saldoApos < 0) {
      faltantes.push({ cod_tid: cod, materia_prima, saldoAtual: ref.saldo, consumo, saldoApos });
    }
  }
  return faltantes;
}