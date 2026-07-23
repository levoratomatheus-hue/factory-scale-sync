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
  sem_formula: number;
  sem_batelada: number;
  sem_itens: number;
  total_ops: number;
  ops_calculadas: number;
  fallback_quantidade: number;
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

async function fetchOrdensFormulaBatch(ids: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const { data } = await (supabase as any)
      .from("ordens_formula")
      .select("ordem_id, sequencia, materia_prima, quantidade_kg")
      .in("ordem_id", chunk);
    if (data) rows.push(...data);
  }
  return rows;
}

async function fetchFormulasBatch(formulaIds: string[]): Promise<any[]> {
  const unique = [...new Set(formulaIds)];
  const rows: any[] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const { data } = await supabase
      .from("formulas")
      .select("id, formula_id, produto, sequencia, materia_prima, fornecedor, unidade, percentual")
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
  tamanho_batelada: number | null;
  qtd_op: number;
  data: string;
  status?: string;
};

type CalcResult = {
  linhasMap: Map<string, { total_kg: number; n_ops: number; ops: OpDetalhe[]; em_producao_kg: number; nao_iniciada_kg: number }>;
  aviso: AvisoCobertura;
};

function calcularCompras(
  ordens: OrdemInput[],
  ordensFormulaRows: any[],
  formulasRows: any[],
  withStatus: boolean,
): CalcResult {
  // Index ordens_formula by ordem_id
  const ofIndex = new Map<string, any[]>();
  for (const r of ordensFormulaRows) {
    const key = r.ordem_id;
    if (!ofIndex.has(key)) ofIndex.set(key, []);
    ofIndex.get(key)!.push(r);
  }

  // Index formulas by formula_id
  const fIndex = new Map<string, any[]>();
  for (const r of formulasRows) {
    const key = r.formula_id;
    if (!fIndex.has(key)) fIndex.set(key, []);
    fIndex.get(key)!.push(r);
  }

  const aviso: AvisoCobertura = {
    sem_formula: 0,
    sem_batelada: 0,
    sem_itens: 0,
    total_ops: ordens.length,
    ops_calculadas: 0,
    fallback_quantidade: 0,
  };

  const linhasMap = new Map<string, { total_kg: number; n_ops: number; ops: OpDetalhe[]; em_producao_kg: number; nao_iniciada_kg: number }>();

  for (const op of ordens) {
    // Must have formula_id
    if (!op.formula_id) {
      aviso.sem_formula++;
      continue;
    }

    const ofItems = ofIndex.get(op.id);
    let items: Array<{ materia_prima: string; fracao: number }> | null = null;

    if (ofItems && ofItems.length > 0) {
      // Use ordens_formula items
      const batelada = op.tamanho_batelada;
      if (!batelada || batelada === 0) {
        aviso.sem_batelada++;
        continue;
      }
      items = ofItems.map((r: any) => ({
        materia_prima: r.materia_prima,
        fracao: (r.quantidade_kg ?? 0) / batelada,
      }));
    } else {
      // Fall back to formulas table
      const fItems = fIndex.get(op.formula_id);
      if (!fItems || fItems.length === 0) {
        aviso.sem_itens++;
        continue;
      }
      items = fItems.map((r: any) => ({
        materia_prima: r.materia_prima,
        fracao: (r.percentual ?? 0) / 100,
      }));
    }

    if (!items || items.length === 0) {
      aviso.sem_itens++;
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

      // Add OP detail only once per MP (track which ops already added)
      const alreadyAdded = entry.ops.some((o) => o.id === op.id);
      if (!alreadyAdded) {
        entry.n_ops++;
        entry.ops.push({
          id: op.id,
          lote: op.lote,
          produto: op.produto,
          data: op.data,
          kg_mp,
          status: op.status,
        });
      } else {
        // Update kg_mp for existing entry
        const existing = entry.ops.find((o) => o.id === op.id)!;
        existing.kg_mp += kg_mp;
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
      // Fetch ordens concluidas no período
      const { data: ordensData } = await (supabase as any)
        .from("ordens")
        .select("id, lote, produto, quantidade, quantidade_real, tamanho_batelada, formula_id, marca, linha, data_conclusao")
        .eq("status", "concluido")
        .gte("data_conclusao", dataInicio)
        .lte("data_conclusao", dataFim)
        .limit(2000);

      if (!ordensData) {
        setResultado(null);
        return;
      }

      // Apply client-side filters
      let ordens = ordensData as any[];
      if (filtros?.linha) {
        ordens = ordens.filter((o) => Number(o.linha) === filtros.linha);
      }
      if (filtros?.marca && filtros.marca !== "") {
        ordens = ordens.filter((o) => o.marca === filtros.marca);
      }

      // Count fallback_quantidade
      let fallback_quantidade = 0;

      const ordensMapped: OrdemInput[] = ordens.map((o) => {
        const qtd_real = o.quantidade_real;
        let qtd_op: number;
        if (qtd_real != null && qtd_real !== 0) {
          qtd_op = qtd_real;
        } else {
          qtd_op = o.quantidade ?? 0;
          if (qtd_real == null || qtd_real === 0) fallback_quantidade++;
        }
        return {
          id: o.id,
          lote: Number(o.lote),
          produto: o.produto,
          formula_id: o.formula_id ?? null,
          tamanho_batelada: o.tamanho_batelada ?? null,
          qtd_op,
          data: o.data_conclusao ?? "",
          status: undefined,
        };
      });

      const ids = ordensMapped.map((o) => o.id);
      const [ofRows, fRows] = await Promise.all([
        fetchOrdensFormulaBatch(ids),
        fetchFormulasBatch(ordensMapped.filter((o) => o.formula_id).map((o) => o.formula_id!)),
      ]);

      const { linhasMap, aviso } = calcularCompras(ordensMapped, ofRows, fRows, false);
      aviso.fallback_quantidade = fallback_quantidade;

      // Build sorted linhas
      const linhas: LinhaMP[] = Array.from(linhasMap.entries())
        .map(([mp, v]) => ({
          materia_prima: mp,
          total_kg: v.total_kg,
          n_ops: v.n_ops,
          ops: v.ops.sort((a, b) => b.kg_mp - a.kg_mp),
        }))
        .sort((a, b) => b.total_kg - a.total_kg);

      const total_kg = linhas.reduce((s, l) => s + l.total_kg, 0);

      setResultado({ linhas, aviso, total_kg });
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
        .select("id, lote, produto, quantidade, tamanho_batelada, formula_id, status, data_programacao")
        .neq("status", "concluido")
        .gte("data_programacao", dataInicio)
        .lte("data_programacao", dataFim)
        .limit(2000);

      if (!ordensData) {
        setResultado(null);
        return;
      }

      const ordens = ordensData as any[];

      const ordensMapped: OrdemInput[] = ordens.map((o) => ({
        id: o.id,
        lote: Number(o.lote),
        produto: o.produto,
        formula_id: o.formula_id ?? null,
        tamanho_batelada: o.tamanho_batelada ?? null,
        qtd_op: o.quantidade ?? 0,
        data: o.data_programacao ?? "",
        status: o.status ?? "",
      }));

      const ids = ordensMapped.map((o) => o.id);
      const [ofRows, fRows] = await Promise.all([
        fetchOrdensFormulaBatch(ids),
        fetchFormulasBatch(ordensMapped.filter((o) => o.formula_id).map((o) => o.formula_id!)),
      ]);

      const { linhasMap, aviso } = calcularCompras(ordensMapped, ofRows, fRows, true);

      // Build sorted linhas
      const linhas: LinhaPrevisao[] = Array.from(linhasMap.entries())
        .map(([mp, v]) => ({
          materia_prima: mp,
          total_kg: v.total_kg,
          n_ops: v.n_ops,
          ops: v.ops.sort((a, b) => b.kg_mp - a.kg_mp),
          em_producao_kg: v.em_producao_kg,
          nao_iniciada_kg: v.nao_iniciada_kg,
        }))
        .sort((a, b) => b.total_kg - a.total_kg);

      const total_kg = linhas.reduce((s, l) => s + l.total_kg, 0);

      setResultado({ linhas, aviso, total_kg });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  return { resultado, loading, refetch };
}
