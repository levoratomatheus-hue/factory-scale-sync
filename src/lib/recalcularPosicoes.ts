import { supabase } from "@/integrations/supabase/client";

// Retorna posicao = max + 1 para inserir no final da linha (2 queries vs N+1 do recalcularPosicoes)
export async function getNextPosicao(linha: number): Promise<number> {
  const { data } = await (supabase as any)
    .from("ordens")
    .select("posicao")
    .eq("linha", linha)
    .order("posicao", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.posicao ?? 0) + 1;
}

export async function recalcularPosicoes(linha: number): Promise<void> {
  const { data } = await supabase
    .from("ordens")
    .select("id, posicao")
    .eq("linha", linha)
    .order("posicao", { ascending: true, nullsFirst: false });

  if (!data || data.length === 0) return;

  await Promise.all(
    data.map((o, i) =>
      supabase.from("ordens").update({ posicao: i + 1 } as any).eq("id", o.id)
    )
  );
}

const BASE_POS_PROGRAMADA = 100_000;

/** Avança OP para dataDestino na frente das já programadas no dia, preservando ordem relativa entre movidas. */
export async function avancarOPNaFrenteDoDia(
  ordemId: string,
  linha: number,
  dataDestino: string,
  posicaoOrigem: number | null
): Promise<void> {
  const posOrig = posicaoOrigem ?? 9_999;

  const { data: noDia } = await supabase
    .from("ordens")
    .select("id, posicao")
    .eq("linha", linha)
    .eq("data_programacao", dataDestino)
    .neq("id", ordemId);

  const existentes = noDia ?? [];
  const ids = existentes.map((o) => o.id);

  const movidosSet = new Set<string>();
  if (ids.length > 0) {
    const { data: regs } = await (supabase as any)
      .from("registros_diarios")
      .select("ordem_id")
      .in("ordem_id", ids)
      .lt("data", dataDestino);
    (regs ?? []).forEach((r: { ordem_id: string }) => movidosSet.add(r.ordem_id));
  }

  const programadas = existentes
    .filter((o) => !movidosSet.has(o.id))
    .sort((a, b) => (a.posicao ?? 9_999) - (b.posicao ?? 9_999));

  const updates: { id: string; posicao: number; data_programacao: string }[] = [
    { id: ordemId, posicao: posOrig, data_programacao: dataDestino },
  ];

  programadas.forEach((o, i) => {
    const posAtual = o.posicao ?? i + 1;
    const posNormalizada = posAtual >= BASE_POS_PROGRAMADA
      ? posAtual
      : BASE_POS_PROGRAMADA + posAtual;
    updates.push({ id: o.id, posicao: posNormalizada, data_programacao: dataDestino });
  });

  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from("ordens")
        .update({ posicao: u.posicao, data_programacao: u.data_programacao } as any)
        .eq("id", u.id)
    )
  );

  const falhou = results.find((r) => r.error);
  if (falhou?.error) throw falhou.error;
}
