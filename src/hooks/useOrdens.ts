import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOrdens(date?: string) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = date || new Date().toISOString().split("T")[0];

  const fetchOrdens = useCallback(async () => {
    let query = supabase.from("ordens").select("*").order("criado_em", { ascending: true });

    if (date) {
      query = query.eq("data_programacao", today);
    } else {
      query = query.neq("status", "Concluído");
    }

    const { data, error } = await query;
    if (!error && data) setOrdens(data);
    setLoading(false);
  }, [today, date]);

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

  const initBalanca = useCallback(async (balanca: number) => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .eq("balanca", balanca)
      .neq("status", "Concluído")
      .order("criado_em", { ascending: true });

    if (!data || data.length === 0) return;

    const hasEmPesagem = data.some((o: any) => o.status === "Em Pesagem");
    if (hasEmPesagem) return;

    const firstOpen = data.find((o: any) => o.status === "Em Aberto");
    if (!firstOpen) return;

    await supabase.from("ordens").update({ status: "Em Pesagem" }).eq("id", firstOpen.id);

    await supabase.from("historico").insert({
      ordem_id: firstOpen.id,
      status_anterior: "Em Aberto",
      status_novo: "Em Pesagem",
    });
  }, []);

  return { ordens, loading, concluirOrdem, initBalanca };
}

export function useHistorico() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("ordens")
        .select("*")
        .eq("status", "Concluído")
        .order("criado_em", { ascending: false });

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
