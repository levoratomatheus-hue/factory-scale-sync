import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export function useOrdens(date?: string) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const today = date || format(new Date(), 'yyyy-MM-dd');

  const fetchOrdens = useCallback(async () => {
    let query = supabase.from("ordens").select("*").order("posicao", { ascending: true, nullsFirst: false }).limit(500);

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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channelName = `ordens-realtime-${date ?? "all"}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchOrdens(), 300);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchOrdens]);

  // Called when weighing is done — next status depends on requer_mistura flag
  const concluirOrdem = async (ordemId: string): Promise<string | null> => {
    const ordem = ordens.find((o) => o.id === ordemId);
    if (!ordem) return `Ordem ${ordemId} não encontrada no estado local`;

    const proximoStatus = ordem.requer_mistura === false
      ? "aguardando_linha"
      : "aguardando_mistura";

    const { error } = await supabase
      .from("ordens")
      .update({ status: proximoStatus })
      .eq("id", ordemId);

    if (error) return error.message;

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

    return null;
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

  return { ordens, loading, concluirOrdem, initBalanca, fetchOrdens };
}

export function useHistorico(dataInicio?: string, dataFim?: string) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistorico = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("ordens")
      .select("*")
      .eq("status", "concluido")
      .order("data_conclusao", { ascending: false })
      .limit(500);

    if (dataInicio) query = query.gte("data_programacao", dataInicio);
    if (dataFim) query = query.lte("data_programacao", dataFim);

    const { data, error } = await query;
    if (!error && data) setOrdens(data);
    setLoading(false);
  }, [dataInicio, dataFim]);

  useEffect(() => {
    fetchHistorico();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`historico-realtime-${dataInicio ?? "all"}-${dataFim ?? ""}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchHistorico(), 300);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchHistorico]);

  return { ordens, loading };
}

export function useAnalises(dataInicio: string, dataFim: string) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalises = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("ordens")
      .select("id, quantidade_real, hora_inicio, hora_fim, linha, data_programacao, formula_id, produto")
      .eq("status", "concluido")
      .gte("data_programacao", dataInicio)
      .lte("data_programacao", dataFim)
      .order("data_programacao", { ascending: true });

    if (!error && data) setOrdens(data);
    setLoading(false);
  }, [dataInicio, dataFim]);

  useEffect(() => {
    fetchAnalises();
  }, [fetchAnalises]);

  return { ordens, loading };
}

export function useParadasLinha(linha: number, data: string) {
  const [paradas, setParadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParadas = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("paradas")
      .select("*")
      .eq("linha", linha)
      .eq("data", data)
      .order("hora_inicio", { ascending: true });
    if (!error && rows) setParadas(rows);
    setLoading(false);
  }, [linha, data]);

  useEffect(() => {
    fetchParadas();
    const channel = supabase
      .channel(`paradas-linha-${linha}-${data}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paradas" }, fetchParadas)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchParadas]);

  return { paradas, loading, fetchParadas };
}

export function useParadasAnalises(dataInicio: string, dataFim: string) {
  const [paradas, setParadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParadas = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("paradas")
      .select("linha, data, motivo, hora_inicio, hora_fim")
      .gte("data", dataInicio)
      .lte("data", dataFim);
    if (!error && data) setParadas(data);
    setLoading(false);
  }, [dataInicio, dataFim]);

  useEffect(() => {
    fetchParadas();
  }, [fetchParadas]);

  return { paradas, loading };
}

export function useRegistrosDiariosOrdem(ordemId: string | null) {
  const [registros, setRegistros] = useState<any[]>([]);

  const fetchRegistros = useCallback(async () => {
    if (!ordemId) { setRegistros([]); return; }
    const { data } = await (supabase as any)
      .from("registros_diarios")
      .select("*")
      .eq("ordem_id", ordemId)
      .order("data", { ascending: true });
    setRegistros(data ?? []);
  }, [ordemId]);

  useEffect(() => {
    fetchRegistros();
    if (!ordemId) return;
    const channel = supabase
      .channel(`reg-diarios-${ordemId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_diarios" }, fetchRegistros)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRegistros, ordemId]);

  return { registros, fetchRegistros };
}

export function useRegistrosDiariosAnalises(dataInicio: string, dataFim: string) {
  const [registros, setRegistros] = useState<any[]>([]);

  const fetchRegistros = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("registros_diarios")
      .select("ordem_id, data, hora_inicio, hora_fim, registro_producao, ordens(linha)")
      .gte("data", dataInicio)
      .lte("data", dataFim);
    setRegistros(data ?? []);
  }, [dataInicio, dataFim]);

  useEffect(() => {
    fetchRegistros();
  }, [fetchRegistros]);

  return { registros };
}
