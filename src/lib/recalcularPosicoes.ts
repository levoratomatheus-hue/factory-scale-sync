import { supabase } from "@/integrations/supabase/client";

export async function recalcularPosicoes(linha: number): Promise<void> {
  const { data } = await supabase
    .from("ordens")
    .select("id, posicao, data_programacao")
    .eq("linha", linha)
    .eq("status", "aguardando_linha")
    .order("data_programacao", { ascending: true })
    .order("posicao", { ascending: true, nullsFirst: false });

  if (!data || data.length === 0) return;

  await Promise.all(
    data.map((o, i) =>
      supabase.from("ordens").update({ posicao: i + 1 } as any).eq("id", o.id)
    )
  );
}
