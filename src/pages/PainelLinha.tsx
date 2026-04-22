import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFormula } from "@/hooks/useFormula";
import { useParadasLinha, useRegistrosDiariosOrdem } from "@/hooks/useOrdens";
import { parseObsItems, formatObsLine } from "@/lib/obsUtils";
import { formatKg, parseHoras, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Loader2, Factory, Layers, OctagonX, Trash2, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const MOTIVOS: Record<string, string> = {
  manutencao: "Manutenção",
  sem_material: "Sem Material",
  problema_processo: "Problemas de Processo",
  falta_energia: "Falta de Energia",
};

interface PainelLinhaProps {
  linha: number;
}

const today = format(new Date(), 'yyyy-MM-dd');

export default function PainelLinha({ linha }: PainelLinhaProps) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const iniciado = useRef(false);

  // Registrar Dia dialog state
  const [registroDiaOpen, setRegistroDiaOpen] = useState(false);
  const [diaData, setDiaData] = useState(today);
  const [diaHoraInicio, setDiaHoraInicio] = useState("");
  const [diaHoraFim, setDiaHoraFim] = useState("");
  const [diaItems, setDiaItems] = useState([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [savingRegistro, setSavingRegistro] = useState(false);

  // Paradas
  const { paradas } = useParadasLinha(linha, today);
  const [paradaOpen, setParadaOpen] = useState(false);
  const [paradaMotivo, setParadaMotivo] = useState("manutencao");
  const [paradaInicio, setParadaInicio] = useState("");
  const [paradaFim, setParadaFim] = useState("");
  const [savingParada, setSavingParada] = useState(false);

  const linhaOrdens = sortOrdens(
    ordens.filter((o) => ["aguardando_linha", "em_linha", "aguardando_liberacao", "concluido"].includes(o.status))
  );
  const emLinha = linhaOrdens.find((o) => o.status === "em_linha");
  const emAberto = linhaOrdens.filter((o) => o.status === "aguardando_linha");

  const { itens, loading: loadingFormula } = useFormula(
    emLinha?.formula_id ?? null,
    emLinha?.tamanho_batelada ?? null
  );

  const { registros, fetchRegistros } = useRegistrosDiariosOrdem(emLinha?.id ?? null);

  // Reset dialog when order changes
  useEffect(() => {
    setDiaData(today);
    setDiaHoraInicio("");
    setDiaHoraFim("");
    setDiaItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  }, [emLinha?.id]);

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .eq("linha", linha)
      .eq("data_programacao", today)
      .in("status", ["aguardando_linha", "em_linha"])
      .order("posicao", { ascending: true, nullsFirst: false });
    setOrdens(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrdens();
    const channel = supabase
      .channel(`linha-${linha}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, fetchOrdens)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [linha]);

  const initLinha = async (): Promise<string | null> => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .eq("linha", linha)
      .eq("data_programacao", today)
      .in("status", ["aguardando_linha", "em_linha"])
      .order("posicao", { ascending: true, nullsFirst: false });

    if (!data || data.length === 0) return null;
    if (data.some((o: any) => o.status === "em_linha")) return null;

    const first = data.find((o: any) => o.status === "aguardando_linha");
    if (!first) return null;

    const { error } = await supabase
      .from("ordens")
      .update({ status: "em_linha" })
      .eq("id", first.id);

    if (error) return error.message;

    await supabase.from("historico").insert({
      ordem_id: first.id,
      status_anterior: "aguardando_linha",
      status_novo: "em_linha",
    });

    return null;
  };

  useEffect(() => {
    if (!loading && linhaOrdens.length > 0 && !iniciado.current) {
      iniciado.current = true;
      initLinha().then((err) => {
        if (err) toast({ title: "Erro ao iniciar fila automaticamente", description: err, variant: "destructive" });
      });
    }
  }, [loading, linhaOrdens.length]);

  const salvarRegistroDia = async () => {
    if (!emLinha) return;
    if (!diaHoraInicio || !diaHoraFim) {
      toast({ title: "Informe hora início e hora fim", variant: "destructive" });
      return;
    }
    if (diaHoraFim <= diaHoraInicio) {
      toast({ title: "Hora fim deve ser após hora início", variant: "destructive" });
      return;
    }
    const filledItems = diaItems.filter((r) => r.qty.trim() || r.peso.trim());
    const registroProducao = filledItems.length > 0
      ? filledItems.map((r) => ({
          qty: parseInt(r.qty) || 0,
          peso: parseFloat(r.peso.replace(",", ".")) || 0,
        }))
      : null;

    setSavingRegistro(true);
    const { error } = await (supabase as any).from("registros_diarios").insert({
      ordem_id: emLinha.id,
      data: diaData,
      hora_inicio: diaHoraInicio,
      hora_fim: diaHoraFim,
      registro_producao: registroProducao,
    });
    setSavingRegistro(false);

    if (error) {
      toast({ title: "Erro ao salvar registro", description: error.message, variant: "destructive" });
      return;
    }
    setRegistroDiaOpen(false);
    setDiaData(today);
    setDiaHoraInicio("");
    setDiaHoraFim("");
    setDiaItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    await fetchRegistros();
    toast({ title: "Registro do dia salvo" });
  };

  const concluirOrdem = async (ordemId: string) => {
    const { error } = await supabase
      .from("ordens")
      .update({
        status: "aguardando_liberacao",
        motivo_reprovacao: null,
        hora_inicio: null,
        hora_fim: null,
        obs_linha: null,
      } as any)
      .eq("id", ordemId);

    if (error) {
      toast({ title: "Erro ao concluir ordem", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("historico").insert({
      ordem_id: ordemId,
      status_anterior: "em_linha",
      status_novo: "aguardando_liberacao",
    });

    const { count: emLinhaCount } = await supabase
      .from("ordens")
      .select("*", { count: "exact", head: true })
      .eq("linha", linha)
      .eq("status", "em_linha");

    if (!emLinhaCount || emLinhaCount === 0) {
      const { data: proximas } = await supabase
        .from("ordens")
        .select("id")
        .eq("linha", linha)
        .eq("data_programacao", today)
        .eq("status", "aguardando_linha")
        .order("posicao", { ascending: true, nullsFirst: false })
        .limit(1);

      if (proximas && proximas.length > 0) {
        const nextId = proximas[0].id;
        await supabase.from("ordens").update({ status: "em_linha" }).eq("id", nextId);
        await supabase.from("historico").insert({
          ordem_id: nextId,
          status_anterior: "aguardando_linha",
          status_novo: "em_linha",
        });
      }
    }

    await fetchOrdens();
    toast({ title: "Ordem concluída com sucesso" });
  };

  const salvarParada = async () => {
    if (!paradaInicio || !paradaFim) {
      toast({ title: "Preencha hora início e hora fim", variant: "destructive" });
      return;
    }
    if (paradaFim <= paradaInicio) {
      toast({ title: "Hora fim deve ser após hora início", variant: "destructive" });
      return;
    }
    setSavingParada(true);
    const { error } = await supabase.from("paradas").insert({
      linha,
      data: today,
      motivo: paradaMotivo,
      hora_inicio: paradaInicio,
      hora_fim: paradaFim,
    });
    setSavingParada(false);
    if (error) {
      toast({ title: "Erro ao salvar parada", description: error.message, variant: "destructive" });
      return;
    }
    setParadaOpen(false);
    setParadaInicio("");
    setParadaFim("");
    setParadaMotivo("manutencao");
    toast({ title: "Parada registrada" });
  };

  const excluirParada = async (id: string) => {
    const { error } = await supabase.from("paradas").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir parada", description: error.message, variant: "destructive" });
  };

  const excluirRegistro = async (id: string) => {
    const { error } = await (supabase as any).from("registros_diarios").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir registro", description: error.message, variant: "destructive" });
    else await fetchRegistros();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full pb-16">

      {/* Ordem atual em linha */}
      {emLinha ? (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <Factory className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-muted-foreground shrink-0">Linha {linha}</span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <StatusBadge status="em_linha" />
            </div>
            <span className="text-sm text-muted-foreground shrink-0">Lote {emLinha.lote}</span>
          </div>

          <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border-2 border-status-line/40 p-6 space-y-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-xl font-bold leading-tight">{emLinha.produto}</div>
              <MarcaBadge marca={emLinha.marca} />
            </div>

          <div className="text-4xl font-extrabold text-primary">
            {formatKg(emLinha.quantidade)}{" "}
            <span className="text-lg font-semibold text-muted-foreground">kg</span>
          </div>

          {emLinha.tamanho_batelada > 0 && (
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Layers className="h-4 w-4 shrink-0" />
              <span>
                <span className="text-foreground font-bold">
                  {Math.round(emLinha.quantidade / emLinha.tamanho_batelada)}
                </span>{" "}
                batelada{Math.round(emLinha.quantidade / emLinha.tamanho_batelada) !== 1 ? "s" : ""} de{" "}
                <span className="text-foreground font-bold">{formatKg(emLinha.tamanho_batelada)} kg</span> cada
              </span>
            </div>
          )}

          {emLinha.motivo_reprovacao && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">✖ Reprovada anteriormente</p>
              <p className="text-sm text-red-900 whitespace-pre-wrap">{emLinha.motivo_reprovacao}</p>
            </div>
          )}

          {emLinha.obs && (() => {
            const items = parseObsItems(emLinha.obs);
            return (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">⚠ Adições para Mistura</p>
                {items ? (
                  <ul className="space-y-0.5">
                    {items.map((item, i) => (
                      <li key={i} className="text-sm text-amber-900 font-mono">{formatObsLine(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{emLinha.obs}</p>
                )}
              </div>
            );
          })()}

          {loadingFormula && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando fórmula...
            </div>
          )}

          {itens.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-base">
                  <thead className="bg-muted text-muted-foreground text-sm">
                    <tr>
                      <th className="text-left px-3 py-2">Seq</th>
                      <th className="text-left px-3 py-2">Matéria-Prima</th>
                      <th className="text-right px-3 py-2">Qtd (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{item.sequencia ?? "-"}</td>
                        <td className="px-3 py-2 font-medium">{item.materia_prima}</td>
                        <td className="px-3 py-2 text-right font-bold text-lg">{formatKg(item.quantidade_kg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Registros Diários */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Registros de Produção</span>
              <Button size="sm" variant="outline" onClick={() => setRegistroDiaOpen(true)}>
                <CalendarPlus className="mr-1.5 h-4 w-4" />
                Registrar Dia
              </Button>
            </div>

            {registros.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2 rounded-md border border-dashed">
                Nenhum registro ainda
              </p>
            ) : (
              <div className="space-y-2">
                {registros.map((r) => {
                  const items: any[] | null = Array.isArray(r.registro_producao) ? r.registro_producao : null;
                  const prodStr = items?.filter((i: any) => i.qty || i.peso)
                    .map((i: any) => `${i.qty}× ${formatKg(i.peso)}`)
                    .join(" / ") ?? "";
                  const horas = parseHoras(r.hora_inicio, r.hora_fim);
                  return (
                    <div key={r.id} className="rounded-lg border bg-muted/30 px-3 py-2 flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">
                            {format(new Date(r.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {r.hora_inicio.slice(0, 5)} – {r.hora_fim.slice(0, 5)}
                            {horas !== null && <span className="ml-1">({horas.toFixed(1)}h)</span>}
                          </span>
                        </div>
                        {prodStr && (
                          <p className="text-sm font-mono text-foreground">{prodStr}</p>
                        )}
                      </div>
                      <button
                        onClick={() => excluirRegistro(r.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-status-done hover:bg-status-done/90 text-primary-foreground"
              onClick={() => setConfirmOpen(true)}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              Concluir
            </Button>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir ordem</AlertDialogTitle>
                <AlertDialogDescription>
                  Deseja marcar esta ordem como concluída?
                  {registros.length === 0 && (
                    <span className="block mt-1 text-amber-600 font-medium">
                      Nenhum registro diário foi salvo ainda.
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => concluirOrdem(emLinha.id)}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border p-6 text-center text-muted-foreground">
          <div className="space-y-3">
            <p>Nenhuma ordem em andamento</p>
            <Button
              variant="outline"
              onClick={async () => {
                iniciado.current = false;
                const err = await initLinha();
                if (err) toast({ title: "Erro ao iniciar fila", description: err, variant: "destructive" });
              }}
            >
              Iniciar fila
            </Button>
          </div>
        </div>
      )}

      {/* Próximas ordens */}
      {emAberto.length > 0 && (
        <div className="max-w-2xl mx-auto w-full">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Próximas ordens</h2>
          <div className="space-y-2">
            {emAberto.map((ordem, i) => (
              <div key={ordem.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg
                    {ordem.tamanho_batelada > 0 && (
                      <> · {Math.round(ordem.quantidade / ordem.tamanho_batelada)} bat.</>
                    )}
                    <MarcaBadge marca={ordem.marca} size="sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paradas do dia */}
      <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OctagonX className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold">Paradas do dia</h2>
            {paradas.length > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-medium">
                {paradas.length}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setParadaOpen(true)}>
            + Registrar Parada
          </Button>
        </div>

        {paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">Nenhuma parada registrada hoje</p>
        ) : (
          <div className="space-y-2">
            {paradas.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{MOTIVOS[p.motivo] ?? p.motivo}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.hora_inicio.slice(0, 5)} – {p.hora_fim.slice(0, 5)}</p>
                </div>
                <button
                  onClick={() => excluirParada(p.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog: Registrar Dia */}
      <Dialog open={registroDiaOpen} onOpenChange={setRegistroDiaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Dia de Produção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data</label>
              <input
                type="date"
                value={diaData}
                onChange={(e) => setDiaData(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={diaHoraInicio}
                  onChange={(e) => setDiaHoraInicio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={diaHoraFim}
                  onChange={(e) => setDiaHoraFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Registro de Produção</label>
              {diaItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setDiaItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                    }}
                    placeholder="0"
                    className="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.peso}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9,]/g, "");
                      setDiaItems((prev) => prev.map((r, j) => j === i ? { ...r, peso: val } : r));
                    }}
                    placeholder="0,000"
                    className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegistroDiaOpen(false)}>Cancelar</Button>
            <Button onClick={salvarRegistroDia} disabled={savingRegistro}>
              {savingRegistro && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Registrar Parada */}
      <Dialog open={paradaOpen} onOpenChange={setParadaOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Parada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Motivo</label>
              <select
                value={paradaMotivo}
                onChange={(e) => setParadaMotivo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.entries(MOTIVOS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={paradaInicio}
                  onChange={(e) => setParadaInicio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={paradaFim}
                  onChange={(e) => setParadaFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParadaOpen(false)}>Cancelar</Button>
            <Button onClick={salvarParada} disabled={savingParada}>
              {savingParada && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Parada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
