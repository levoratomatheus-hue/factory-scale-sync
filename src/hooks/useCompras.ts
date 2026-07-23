import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpDetalhe = {
  id: string;
  lote: number;
  produto: string;
  data: string;   // criado_em (ISO) para consumo; data_programacao para previsão
  kg_mp: number;
  status?: string;
};

export type LinhaMP = {
  materia_prima: string;  // nome mais frequente do grupo
  cod_mp: string | null;  // código TID quando disponível na tabela formulas
  total_kg: number;
  n_ops: number;
  ops: OpDetalhe[];
};

export type LinhaPrevisao = LinhaMP & {
  em_producao_kg: number;
  nao_iniciada_kg: number;
};

export type AvisoCobertura = {
  sem_formula: number;   // OPs sem formula_id cadastrado
  sem_itens: number;     // OPs com formula_id que não existe na tabela formulas
  total_ops: number;
  ops_calculadas: number;
  kg_excluidos: number;  // soma de quantidade das OPs que ficaram fora
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
  "em_pesagem", "aguardando_mistura", "em_mistura", "aguardando_linha", "em_linha",
]);
const STATUS_NAO_INICIADA = new Set(["pendente", "aguardando_liberacao"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna YYYY-MM-DD do dia seguinte a dateStr (para filtro lt no timestamp) */
function diaSeguinte(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

async function fetchFormulasBatch(formulaIds: string[]): Promise<any[]> {
  const unique = [...new Set(formulaIds)];
  const rows: any[] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    // cod_mp não está no types.ts mas pode existir na tabela
    const { data } = await (supabase as any)
      .from("formulas")
      .select("formula_id, materia_prima, percentual, cod_mp")
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

type EntradaMP = {
  materia_prima: string;
  cod_mp: string | null;
  total_kg: number;
  n_ops: number;
  ops: OpDetalhe[];
  em_producao_kg: number;
  nao_iniciada_kg: number;
  // conta ocorrências de cada nome para exibir o mais frequente
  _nameCount: Map<string, number>;
};

type CalcResult = {
  linhasMap: Map<string, EntradaMP>;
  aviso: AvisoCobertura;
};

function calcularCompras(
  ordens: OrdemInput[],
  formulasRows: any[],
  withStatus: boolean,
): CalcResult {
  // Indexa fórmula base por formula_id
  const fIndex = new Map<string, Array<{ materia_prima: string; cod_mp: string | null; fracao: number }>>();
  for (const r of formulasRows) {
    const key: string = r.formula_id;
    if (!fIndex.has(key)) fIndex.set(key, []);
    fIndex.get(key)!.push({
      materia_prima: r.materia_prima,
      cod_mp: r.cod_mp ?? null,
      fracao: (r.percentual ?? 0) / 100,
    });
  }

  const aviso: AvisoCobertura = {
    sem_formula: 0, sem_itens: 0,
    total_ops: ordens.length, ops_calculadas: 0, kg_excluidos: 0,
  };

  const linhasMap = new Map<string, EntradaMP>();

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
      // Chave do grupo: cod_mp tem prioridade sobre nome (nomes podem ter grafias diferentes)
      const groupKey = item.cod_mp ?? item.materia_prima;

      if (!linhasMap.has(groupKey)) {
        linhasMap.set(groupKey, {
          materia_prima: item.materia_prima,
          cod_mp: item.cod_mp,
          total_kg: 0, n_ops: 0, ops: [],
          em_producao_kg: 0, nao_iniciada_kg: 0,
          _nameCount: new Map(),
        });
      }
      const entry = linhasMap.get(groupKey)!;
      entry.total_kg += kg_mp;
      entry.em_producao_kg += isEmProducao ? kg_mp : 0;
      entry.nao_iniciada_kg += isNaoIniciada ? kg_mp : 0;

      // Conta o nome para exibir o mais frequente no grupo
      entry._nameCount.set(item.materia_prima, (entry._nameCount.get(item.materia_prima) ?? 0) + 1);
      // Atualiza nome para o mais frequente
      let maxCount = 0;
      for (const [nome, cnt] of entry._nameCount) {
        if (cnt > maxCount) { maxCount = cnt; entry.materia_prima = nome; }
      }

      const existingOp = entry.ops.find((o) => o.id === op.id);
      if (!existingOp) {
        entry.n_ops++;
        entry.ops.push({ id: op.id, lote: op.lote, produto: op.produto, data: op.data, kg_mp, status: op.status });
      } else {
        existingOp.kg_mp += kg_mp;
      }
    }
  }

  return { linhasMap, aviso };
}

function buildLinhas<T extends LinhaMP>(linhasMap: Map<string, EntradaMP>, extra: (e: EntradaMP) => Partial<T>): T[] {
  return Array.from(linhasMap.entries())
    .map(([, e]) => ({
      materia_prima: e.materia_prima,
      cod_mp: e.cod_mp,
      total_kg: e.total_kg,
      n_ops: e.n_ops,
      ops: e.ops.sort((a, b) => b.kg_mp - a.kg_mp),
      ...extra(e),
    }) as T)
    .sort((a, b) => b.total_kg - a.total_kg);
}

// ── useComprasConsumo ─────────────────────────────────────────────────────────
// Filtro por criado_em (timestamp); todas as OPs sem filtro de status.
// Quantidade usada: ordens.quantidade (campo planejado, sempre preenchido).

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
      // criado_em é timestamp: usar >= inicio e < (fim+1 dia) para incluir o dia inteiro do fim
      const fimExclusivo = diaSeguinte(dataFim);

      const { data: ordensData } = await (supabase as any)
        .from("ordens")
        .select("id, lote, produto, quantidade, formula_id, marca, linha, criado_em")
        .gte("criado_em", dataInicio)
        .lt("criado_em", fimExclusivo)
        .limit(2000);

      if (!ordensData) { setResultado(null); return; }

      let ordens = ordensData as any[];
      if (filtros?.linha) ordens = ordens.filter((o) => Number(o.linha) === filtros.linha);
      if (filtros?.marca) ordens = ordens.filter((o) => o.marca === filtros.marca);

      const ordensMapped: OrdemInput[] = ordens.map((o) => ({
        id: o.id,
        lote: Number(o.lote),
        produto: o.produto,
        formula_id: o.formula_id ?? null,
        qtd_op: o.quantidade ?? 0,
        data: o.criado_em ?? "",
      }));

      const fRows = await fetchFormulasBatch(
        ordensMapped.filter((o) => o.formula_id).map((o) => o.formula_id!),
      );

      const { linhasMap, aviso } = calcularCompras(ordensMapped, fRows, false);
      const linhas = buildLinhas<LinhaMP>(linhasMap, () => ({}));

      setResultado({ linhas, aviso, total_kg: linhas.reduce((s, l) => s + l.total_kg, 0) });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, filtros?.linha, filtros?.marca]);

  return { resultado, loading, refetch };
}

// ── useComprasPrevisao ────────────────────────────────────────────────────────
// OPs em aberto filtradas por data_programacao. Sem alteração.

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

      const ordensMapped: OrdemInput[] = (ordensData as any[]).map((o) => ({
        id: o.id, lote: Number(o.lote), produto: o.produto,
        formula_id: o.formula_id ?? null, qtd_op: o.quantidade ?? 0,
        data: o.data_programacao ?? "", status: o.status ?? "",
      }));

      const fRows = await fetchFormulasBatch(
        ordensMapped.filter((o) => o.formula_id).map((o) => o.formula_id!),
      );

      const { linhasMap, aviso } = calcularCompras(ordensMapped, fRows, true);
      const linhas = buildLinhas<LinhaPrevisao>(linhasMap, (e) => ({
        em_producao_kg: e.em_producao_kg,
        nao_iniciada_kg: e.nao_iniciada_kg,
      }));

      setResultado({ linhas, aviso, total_kg: linhas.reduce((s, l) => s + l.total_kg, 0) });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  return { resultado, loading, refetch };
}
