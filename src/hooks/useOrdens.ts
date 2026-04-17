import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useOrdens(date?: string) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = date || new Date().toISOString().split("T")[0];

  const fetchOrdens = useCallback(async () => {
    let query = supabase.from("ordens").select("*").order("posicao", { ascending: true, nullsFirst: false });

    if (date) {
      query = query.eq("data_programacao", today);
    } else {
      query = query.neq("status", "concluido");
    }

    const { data, error } = await query;
    if (!error && data) setOrdens(data);
    setLoading(false);
  }, [today, date]);

  useEffect(() => {
    fetchOrdens();
    const channelName = `ordens-realtime-${date ?? "all"}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        fetchOrdens();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrdens]);

  // Called when weighing is done — next status depends on requer_mistura flag
  const concluirOrdem = async (ordemId: string) => {
    const ordem = ordens.find((o) => o.id === ordemId);
    if (!ordem) return;

    const proximoStatus = ordem.requer_mistura === false
      ? "aguardando_linha"
      : "aguardando_mistura";

    await supabase
      .from("ordens")
      .update({ status: proximoStatus })
      .eq("id", ordemId);

    await supabase.from("historico").insert({
      ordem_id: ordemId,
      status_anterior: ordem.status,
      status_novo: proximoStatus,
    });

    const nextOrder = ordens.find(
      (o) => o.balanca === ordem.balanca && o.status === "pendente" && o.id !== ordemId
    );
    if (nextOrder) {
      await supabase.from("ordens").update({ status: "em_pesagem" }).eq("id", nextOrder.id);
      await supabase.from("historico").insert({
        ordem_id: nextOrder.id,
        status_anterior: "pendente",
        status_novo: "em_pesagem",
      });
    }
  };

  const initBalanca = useCallback(async (balanca: number): Promise<string | null> => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .eq("balanca", balanca)
      .in("status", ["pendente", "em_pesagem"])
      .order("posicao", { ascending: true, nullsFirst: false });

    if (!data || data.length === 0) return null;

    const hasEmPesagem = data.some((o: any) => o.status === "em_pesagem");
    if (hasEmPesagem) return null;

    const firstPendente = data.find((o: any) => o.status === "pendente");
    if (!firstPendente) return null;

    const { error } = await supabase
      .from("ordens")
      .update({ status: "em_pesagem" })
      .eq("id", firstPendente.id);

    if (error) return error.message;

    await supabase.from("historico").insert({
      ordem_id: firstPendente.id,
      status_anterior: "pendente",
      status_novo: "em_pesagem",
    });

    return null;
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
        .eq("status", "concluido")
        .order("data_conclusao", { ascending: false });
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
