import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllFormulas } from "@/lib/formulasCache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OpDetalhe = {
  id: string;
  lote: number;
  produto: string;
  data: string;   // criado_em (ISO)
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

export type AvisoCobertura = {
  sem_formula: number;   // OPs sem formula_id cadastrado
  sem_itens: number;     // OPs com formula_id que não existe na tabela formulas
  total_ops: number;
  ops_calculadas: number;
  kg_excluidos: number;  // soma de quantidade das OPs que ficaram fora
};

export type MesesComDados = {
  meses: string[];                    // YYYY-MM ordenados com pelo menos 1 OP
  opsPorMes: Record<string, number>;  // contagem de OPs por mês (base para alerta de volume)
};

export type ResultadoCompras = {
  linhas: LinhaMP[];
  aviso: AvisoCobertura;
  total_kg: number;
  mesesComDados: MesesComDados;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna YYYY-MM-DD do dia seguinte a dateStr (para filtro lt no timestamp) */
function diaSeguinte(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
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
  _nameCount: Map<string, number>;
};

type CalcResult = {
  linhasMap: Map<string, EntradaMP>;
  aviso: AvisoCobertura;
};

function calcularCompras(
  ordens: OrdemInput[],
  formulasRows: any[],
): CalcResult {
  // Indexa fórmula base por formula_id (normalizado para string)
  const fIndex = new Map<string, Array<{ materia_prima: string; cod_mp: string | null; fracao: number }>>();
  for (const r of formulasRows) {
    const key: string = String(r.formula_id);
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
    const items = fIndex.get(String(op.formula_id));
    if (!items || items.length === 0) {
      aviso.sem_itens++;
      aviso.kg_excluidos += op.qtd_op;
      continue;
    }

    aviso.ops_calculadas++;

    for (const item of items) {
      const kg_mp = item.fracao * op.qtd_op;
      // Chave do grupo: cod_mp tem prioridade sobre nome (nomes podem ter grafias diferentes)
      const groupKey = item.cod_mp ?? item.materia_prima;

      if (!linhasMap.has(groupKey)) {
        linhasMap.set(groupKey, {
          materia_prima: item.materia_prima,
          cod_mp: item.cod_mp,
          total_kg: 0, n_ops: 0, ops: [],
          _nameCount: new Map(),
        });
      }
      const entry = linhasMap.get(groupKey)!;
      entry.total_kg += kg_mp;

      // Conta ocorrências de cada nome — resolução do mais frequente fica em buildLinhas
      entry._nameCount.set(item.materia_prima, (entry._nameCount.get(item.materia_prima) ?? 0) + 1);

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
    .map(([, e]) => {
      // Resolve o nome mais frequente do grupo — uma única passagem por grupo
      let maxCount = 0;
      for (const [nome, cnt] of e._nameCount) {
        if (cnt > maxCount) { maxCount = cnt; e.materia_prima = nome; }
      }
      return {
        materia_prima: e.materia_prima,
        cod_mp: e.cod_mp,
        total_kg: e.total_kg,
        n_ops: e.n_ops,
        ops: e.ops.sort((a, b) => b.kg_mp - a.kg_mp),
        ...extra(e),
      } as T;
    })
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

      let q = (supabase as any)
        .from("ordens")
        .select("id, lote, produto, quantidade, formula_id, marca, linha, criado_em")
        .gte("criado_em", dataInicio)
        .lt("criado_em", fimExclusivo)
        .limit(2000);

      if (filtros?.linha) q = q.eq("linha", String(filtros.linha));
      if (filtros?.marca) q = q.eq("marca", filtros.marca);

      const { data: ordensData } = await q;

      if (!ordensData) { setResultado(null); return; }

      const ordens = ordensData as any[];

      const ordensMapped: OrdemInput[] = ordens.map((o) => ({
        id: o.id,
        lote: Number(o.lote),
        produto: o.produto,
        formula_id: o.formula_id ?? null,
        qtd_op: o.quantidade ?? 0,
        data: o.criado_em ?? "",
      }));

      const fRows = await fetchAllFormulas();

      const { linhasMap, aviso } = calcularCompras(ordensMapped, fRows);
      const linhas = buildLinhas<LinhaMP>(linhasMap, () => ({}));

      // Conta meses distintos com OPs no período (base para divisão da média)
      const opsPorMes: Record<string, number> = {};
      for (const o of ordens) {
        const mes = (o.criado_em ?? "").slice(0, 7); // YYYY-MM
        if (mes && mes.length === 7) opsPorMes[mes] = (opsPorMes[mes] ?? 0) + 1;
      }
      const mesesComDados: MesesComDados = {
        meses: Object.keys(opsPorMes).sort(),
        opsPorMes,
      };

      setResultado({ linhas, aviso, total_kg: linhas.reduce((s, l) => s + l.total_kg, 0), mesesComDados });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, filtros?.linha, filtros?.marca]);

  return { resultado, loading, refetch };
}
