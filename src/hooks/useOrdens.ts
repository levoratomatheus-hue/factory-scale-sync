import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
type Ordem = Tables<"ordens">;

export function useOrdens(date?: string) {
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(true);
  const today = date || new Date().toISOString().split("T")[0];

  const fetchOrdens = useCallback(async () => {
    const { data, error } = await supabase
      .from("ordens")
      .select("*")
      .eq("data_programacao", today)
      .order("numero", { ascending: true }); // <- mudou de criado_em para numero
    if (!error && data) setOrdens(data);
    setLoading(false);
  }, [today]);

  useEffect(() => {
    fetchOrdens();
    const channel = supabase
      .channel("ordens-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        fetchOrdens();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrdens]);

  const concluirOrdem = async (ordemId: string) => {
    const ordem = ordens.find((o) => o.id === ordemId);
    if (!ordem) return;
    await supabase
      .from("ordens")
      .update({
        status: "Concluído",
        data_conclusao: new Date().toISOString(),
      })
      .eq("id", ordemId);
    await supabase.from("historico").insert({
      ordem_id: ordemId,
      status_anterior: ordem.status,
      status_novo: "Concluído",
    });
    const nextOrder = ordens.find((o) => o.balanca === ordem.balanca && o.status === "Em Aberto" && o.id !== ordemId);
    if (nextOrder) {
      await supabase.from("ordens").update({ status: "Em Pesagem" }).eq("id", nextOrder.id);
      await supabase.from("historico").insert({
        ordem_id: nextOrder.id,
        status_anterior: "Em Aberto",
        status_novo: "Em Pesagem",
      });
    }
  };

  const initBalanca = useCallback(
    async (balanca: number) => {
      const balancaOrdens = ordens.filter((o) => o.balanca === balanca);
      const hasEmPesagem = balancaOrdens.some((o) => o.status === "Em Pesagem");
      if (!hasEmPesagem) {
        const firstOpen = balancaOrdens.find((o) => o.status === "Em Aberto");
        if (firstOpen) {
          await supabase.from("ordens").update({ status: "Em Pesagem" }).eq("id", firstOpen.id);
          await supabase.from("historico").insert({
            ordem_id: firstOpen.id,
            status_anterior: "Em Aberto",
            status_novo: "Em Pesagem",
          });
        }
      }
    },
    [ordens],
  );

  return { ordens, loading, concluirOrdem, initBalanca };
}

// Hook separado para o histórico global
export function useHistorico() {
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase.from("ordens").select("*").order("criado_em", { ascending: false });
      if (!error && data) setOrdens(data);
      setLoading(false);
    };
    fetch();
    const channel = supabase
      .channel("historico-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, fetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { ordens, loading };
}
