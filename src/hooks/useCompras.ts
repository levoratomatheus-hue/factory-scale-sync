import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpDetalhe = {
  id: string;
  lote: number;
  produto: string;
  data: string;
  kg_mp: number;
  status?: string;
};

export type LinhaMP = {
  materia_prima: string;
  total_kg: number;
  n_ops: number;
  ops: OpDetalhe[];
};

export type LinhaPrevisao = LinhaMP & {
  em_producao_kg: number;
  nao_iniciada_kg: number;
};

export type AvisoCobertura = {
  sem_formula: number;      // OPs sem formula_id cadastrado
  sem_itens: number;        // OPs cujo formula_id não tem linhas na tabela formulas
  total_ops: number;
  ops_calculadas: number;
  kg_excluidos: number;     // kg (qtd_op) das OPs que ficaram fora do cálculo
  fallback_quantidade: number; // OPs que usaram quantidade no lugar de quantidade_real
};

export type ResultadoCompras = {
  linhas: LinhaMP[];
  aviso: AvisoCobertura;
  total_kg: number;
};

export type ResultadoPrevisao = {
  linhas: LinhaPrevisao[];
  aviso: AvisoCobertura;
  total_kg: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;

const STATUS_EM_PRODUCAO = new Set([
  "em_pesagem",
  "aguardando_mistura",
  "em_mistura",
  "aguardando_linha",
  "em_linha",
]);

const STATUS_NAO_INICIADA = new Set([
  "pendente",
  "aguardando_liberacao",
]);

// ── Batch helpers ─────────────────────────────────────────────────────────────

async function fetchFormulasBatch(formulaIds: string[]): Promise<any[]> {
  const unique = [...new Set(formulaIds)];
  const rows: any[] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from("formulas")
      .select("formula_id, materia_prima, percentual")
      .in("formula_id", chunk);
    if (data) rows.push(...data);
  }
  return rows;
}

// ── Core calculation ──────────────────────────────────────────────────────────

type OrdemInput = {
  id: string;
  lote: number;
  produto: string;
  formula_id: string | null;
  qtd_op: number;
  data: string;
  status?: string;
};

type CalcResult = {
  linhasMap: Map<string, { total_kg: number; n_ops: number; ops: OpDetalhe[]; em_producao_kg: number; nao_iniciada_kg: number }>;
  aviso: AvisoCobertura;
};

// Usa sempre e somente a fórmula base (tabela formulas, via formula_id).
// os percentuais somam 100%, então a soma das MPs de uma OP = quantidade da OP.
function calcularCompras(
  ordens: OrdemInput[],
  formulasRows: any[],
  withStatus: boolean,
): CalcResult {
  // Index formulas by formula_id
  const fIndex = new Map<string, Array<{ materia_prima: string; fracao: number }>>();
  for (const r of formulasRows) {
    const key = r.formula_id;
    if (!fIndex.has(key)) fIndex.set(key, []);
    fIndex.get(key)!.push({ materia_prima: r.materia_prima, fracao: (r.percentual ?? 0) / 100 });
  }

  const aviso: AvisoCobertura = {
    sem_formula: 0,
    sem_itens: 0,
    total_ops: ordens.length,
    ops_calculadas: 0,
    kg_excluidos: 0,
    fallback_quantidade: 0,
  };

  const linhasMap = new Map<string, { total_kg: number; n_ops: number; ops: OpDetalhe[]; em_producao_kg: number; nao_iniciada_kg: number }>();

  for (const op of ordens) {
    if (!op.formula_id) {
      aviso.sem_formula++;
      aviso.kg_excluidos += op.qtd_op;
      continue;
    }

    const items = fIndex.get(op.formula_id);
    if (!items || items.length === 0) {
      aviso.sem_itens++;
      aviso.kg_excluidos += op.qtd_op;
      continue;
    }

    aviso.ops_calculadas++;

    const isEmProducao = withStatus && op.status ? STATUS_EM_PRODUCAO.has(op.status) : false;
    const isNaoIniciada = withStatus && op.status ? STATUS_NAO_INICIADA.has(op.status) : false;

    for (const item of items) {
      const kg_mp = item.fracao * op.qtd_op;
      const mp = item.materia_prima;

      if (!linhasMap.has(mp)) {
        linhasMap.set(mp, { total_kg: 0, n_ops: 0, ops: [], em_producao_kg: 0, nao_iniciada_kg: 0 });
      }
      const entry = linhasMap.get(mp)!;
      entry.total_kg += kg_mp;
      entry.em_producao_kg += isEmProducao ? kg_mp : 0;
      entry.nao_iniciada_kg += isNaoIniciada ? kg_mp : 0;

      const alreadyAdded = entry.ops.some((o) => o.id === op.id);
      if (!alreadyAdded) {
        entry.n_ops++;
        entry.ops.push({ id: op.id, lote: op.lote, produto: op.produto, data: op.data, kg_mp, status: op.status });
      } else {
        entry.ops.find((o) => o.id === op.id)!.kg_mp += kg_mp;
      }
    }
  }

  return { linhasMap, aviso };
}

// ── useComprasConsumo ─────────────────────────────────────────────────────────

export function useComprasConsumo(
  dataInicio: string,
  dataFim: string,
  filtros?: { linha?: number; marca?: string },
) {
  const [resultado, setResultado] = useState<ResultadoCompras | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ordensData } = await (supabase as any)
        .from("ordens")
        .select("id, lote, produto, quantidade, quantidade_real, formula_id, marca, linha, data_conclusao")
        .eq("status", "concluido")
        .gte("data_conclusao", dataInicio)
        .lte("data_conclusao", dataFim)
        .limit(2000);

      if (!ordensData) { setResultado(null); return; }

      let ordens = ordensData as any[];
      if (filtros?.linha) ordens = ordens.filter((o) => Number(o.linha) === filtros.linha);
      if (filtros?.marca) ordens = ordens.filter((o) => o.marca === filtros.marca);

      let fallback_quantidade = 0;
      const ordensMapped: OrdemInput[] = ordens.map((o) => {
        const qtd_real = o.quantidade_real;
        let qtd_op: number;
        if (qtd_real != null && qtd_real > 0) {
          qtd_op = qtd_real;
        } else {
          qtd_op = o.quantidade ?? 0;
          fallback_quantidade++;
        }
        return { id: o.id, lote: Number(o.lote), produto: o.produto, formula_id: o.formula_id ?? null, qtd_op, data: o.data_conclusao ?? "" };
      });

      const fRows = await fetchFormulasBatch(
        ordensMapped.filter((o) => o.formula_id).map((o) => o.formula_id!),
      );

      const { linhasMap, aviso } = calcularCompras(ordensMapped, fRows, false);
      aviso.fallback_quantidade = fallback_quantidade;

      const linhas: LinhaMP[] = Array.from(linhasMap.entries())
        .map(([mp, v]) => ({ materia_prima: mp, total_kg: v.total_kg, n_ops: v.n_ops, ops: v.ops.sort((a, b) => b.kg_mp - a.kg_mp) }))
        .sort((a, b) => b.total_kg - a.total_kg);

      setResultado({ linhas, aviso, total_kg: linhas.reduce((s, l) => s + l.total_kg, 0) });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, filtros?.linha, filtros?.marca]);

  return { resultado, loading, refetch };
}

// ── useComprasPrevisao ────────────────────────────────────────────────────────

export function useComprasPrevisao(dataInicio: string, dataFim: string) {
  const [resultado, setResultado] = useState<ResultadoPrevisao | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data: ordensData } = await (supabase as any)
        .from("ordens")
        .select("id, lote, produto, quantidade, formula_id, status, data_programacao")
        .neq("status", "concluido")
        .gte("data_programacao", dataInicio)
        .lte("data_programacao", dataFim)
        .limit(2000);

      if (!ordensData) { setResultado(null); return; }

      const ordens = ordensData as any[];
      const ordensMapped: OrdemInput[] = ordens.map((o) => ({
        id: o.id, lote: Number(o.lote), produto: o.produto,
        formula_id: o.formula_id ?? null, qtd_op: o.quantidade ?? 0,
        data: o.data_programacao ?? "", status: o.status ?? "",
      }));

      const fRows = await fetchFormulasBatch(
        ordensMapped.filter((o) => o.formula_id).map((o) => o.formula_id!),
      );

      const { linhasMap, aviso } = calcularCompras(ordensMapped, fRows, true);

      const linhas: LinhaPrevisao[] = Array.from(linhasMap.entries())
        .map(([mp, v]) => ({ materia_prima: mp, total_kg: v.total_kg, n_ops: v.n_ops, ops: v.ops.sort((a, b) => b.kg_mp - a.kg_mp), em_producao_kg: v.em_producao_kg, nao_iniciada_kg: v.nao_iniciada_kg }))
        .sort((a, b) => b.total_kg - a.total_kg);

      setResultado({ linhas, aviso, total_kg: linhas.reduce((s, l) => s + l.total_kg, 0) });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  return { resultado, loading, refetch };
}
