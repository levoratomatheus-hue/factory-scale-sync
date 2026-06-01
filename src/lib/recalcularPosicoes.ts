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
