import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFormula } from "@/hooks/useFormula";
import { useParadasLinha, useRegistrosDiariosOrdem } from "@/hooks/useOrdens";
import { parseObsItems, formatObsLine } from "@/lib/obsUtils";
import { formatKg, parseHoras } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { CalendarCheck2, CheckCircle2, ClipboardList, Loader2, Factory, Layers, OctagonX, PauseCircle, Play, Trash2 } from "lucide-react";
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
  // kg produzidos hoje por ordem (para exibir nos cards de fila)
  const [kgHoje, setKgHoje] = useState<Record<string, number>>({});

  // Etapa 1 — registrar hora início
  const [horaInicioInput, setHoraInicioInput] = useState("");
  const [savingInicio, setSavingInicio] = useState(false);

  // Etapa 2 — form inline de conclusão
  const [horaFim, setHoraFim] = useState("");
  const [prodItems, setProdItems] = useState([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [obsLinha, setObsLinha] = useState("");
  const [savingDia, setSavingDia] = useState(false);

  // Paradas
  const { paradas, fetchParadas } = useParadasLinha(linha, today);
  const [paradaOpen, setParadaOpen] = useState(false);
  const [paradaMotivo, setParadaMotivo] = useState("manutencao");
  const [paradaInicio, setParadaInicio] = useState("");
  const [paradaFim, setParadaFim] = useState("");
  const [savingParada, setSavingParada] = useState(false);
  const [paradasListOpen, setParadasListOpen] = useState(false);

  // ordens já vem do fetchOrdens ordenado por data_programacao ASC, posicao ASC
  // com em_linha forçado ao topo — não re-ordenar por posicao isolado
  const linhaOrdens = ordens.filter((o) =>
    ["aguardando_linha", "em_linha", "aguardando_liberacao", "concluido"].includes(o.status)
  );
  const emLinha = linhaOrdens.find((o) => o.status === "em_linha");
  const emAberto = linhaOrdens.filter((o) => o.status === "aguardando_linha");

  const { itens, loading: loadingFormula } = useFormula(
    emLinha?.formula_id ?? null,
    emLinha?.tamanho_batelada ?? null
  );

  const { registros, fetchRegistros } = useRegistrosDiariosOrdem(emLinha?.id ?? null);

  // Reset inline form when order changes
  useEffect(() => {
    setHoraInicioInput("");
    setHoraFim("");
    setProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    setObsLinha("");
  }, [emLinha?.id]);

  const fetchOrdens = async () => {
    const { data: allData } = await supabase
      .from("ordens")
      .select("*")
      .eq("linha", linha)
      .in("status", ["em_linha", "aguardando_linha"])
      .order("data_programacao", { ascending: true })
      .order("posicao", { ascending: true, nullsFirst: false });

    const emLinhaData = (allData ?? []).filter((o: any) => o.status === "em_linha");
    const aguardandoData = (allData ?? []).filter((o: any) => o.status === "aguardando_linha");

    // Busca registros de hoje para: filtrar em_linha e calcular kg da fila
    const allIds = (allData ?? []).map((o: any) => o.id);

    const hasRegHoje = new Set<string>();
    const kgMap: Record<string, number> = {};

    if (allIds.length > 0) {
      const { data: regsHoje } = await (supabase as any)
        .from("registros_diarios")
        .select("ordem_id, registro_producao")
        .in("ordem_id", allIds)
        .eq("data", today);

      (regsHoje ?? []).forEach((r: any) => {
        hasRegHoje.add(r.ordem_id);
        const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
        kgMap[r.ordem_id] = (kgMap[r.ordem_id] || 0) +
          items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
      });
    }

    // Exibe OP em_linha apenas se: hora_inicio definida (sendo trabalhada agora)
    // OU ainda não tem registro de hoje (não foi salva hoje ainda)
    const emLinhaFiltradas = (emLinhaData ?? []).filter(
      (o: any) => o.hora_inicio !== null || !hasRegHoje.has(o.id)
    );

    const combinadas = [...emLinhaFiltradas, ...(aguardandoData ?? [])];
    const ordenadas = [...combinadas].sort((a: any, b: any) => {
      if (a.status === "em_linha" && b.status !== "em_linha") return -1;
      if (b.status === "em_linha" && a.status !== "em_linha") return 1;
      return 0;
    });
    setOrdens(ordenadas);
    setKgHoje(kgMap);
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

  const iniciarOrdem = async (ordem: any) => {
    const { error } = await supabase
      .from("ordens")
      .update({ status: "em_linha" })
      .eq("id", ordem.id);

    if (error) {
      toast({ title: "Erro ao iniciar ordem", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_linha",
      status_novo: "em_linha",
    });

    await fetchOrdens();
  };

  const salvarInicio = async () => {
    if (!emLinha || !horaInicioInput) {
      toast({ title: "Informe a hora de início", variant: "destructive" });
      return;
    }
    setSavingInicio(true);
    const { error } = await supabase
      .from("ordens")
      .update({ hora_inicio: horaInicioInput } as any)
      .eq("id", emLinha.id);
    setSavingInicio(false);
    if (error) {
      toast({ title: "Erro ao salvar início", description: error.message, variant: "destructive" });
      return;
    }
    await fetchOrdens();
    toast({ title: "Hora de início registrada" });
  };

  const salvarDia = async () => {
    if (!emLinha) return;
    if (!horaFim) {
      toast({ title: "Informe a hora de fim", variant: "destructive" });
      return;
    }
    const filledItems = prodItems.filter((r) => r.qty.trim() || r.peso.trim());
    if (filledItems.length === 0) {
      toast({ title: "Informe pelo menos um registro de produção", variant: "destructive" });
      return;
    }
    setSavingDia(true);

    const { error: errReg } = await (supabase as any).from("registros_diarios").insert({
      ordem_id: emLinha.id,
      data: today,
      hora_inicio: emLinha.hora_inicio ?? null,
      hora_fim: horaFim,
      registro_producao: filledItems.map((r) => ({
        qty: parseInt(r.qty) || 0,
        peso: parseFloat(r.peso.replace(",", ".")) || 0,
      })),
    });

    if (errReg) {
      toast({ title: "Erro ao salvar registro do dia", description: errReg.message, variant: "destructive" });
      setSavingDia(false);
      return;
    }

    // Reseta hora_inicio para o próximo dia
    await supabase.from("ordens").update({ hora_inicio: null } as any).eq("id", emLinha.id);

    setSavingDia(false);
    setHoraFim("");
    setProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    setObsLinha("");
    await fetchRegistros();
    await fetchOrdens();
    toast({ title: "Dia salvo! OP continua em andamento amanhã." });
  };

  const concluirOrdem = async (ordemId: string) => {
    if (!horaFim) {
      toast({ title: "Informe a hora de fim antes de concluir", variant: "destructive" });
      return;
    }
    const filledItems = prodItems.filter((r) => r.qty.trim() || r.peso.trim());
    if (filledItems.length === 0) {
      toast({ title: "Informe pelo menos um registro de produção", variant: "destructive" });
      return;
    }

    // Salva registro do último dia
    const { error: errReg } = await (supabase as any).from("registros_diarios").insert({
      ordem_id: ordemId,
      data: today,
      hora_inicio: emLinha?.hora_inicio ?? null,
      hora_fim: horaFim,
      registro_producao: filledItems.map((r) => ({
        qty: parseInt(r.qty) || 0,
        peso: parseFloat(r.peso.replace(",", ".")) || 0,
      })),
    });
    if (errReg) {
      toast({ title: "Erro ao salvar registro de produção", description: errReg.message, variant: "destructive" });
      return;
    }

    // Calcula quantidade_real somando todos os registros_diarios
    const { data: todosRegistros } = await (supabase as any)
      .from("registros_diarios")
      .select("registro_producao")
      .eq("ordem_id", ordemId);

    let quantidadeReal = 0;
    (todosRegistros ?? []).forEach((r: any) => {
      const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
      items.forEach((it: any) => { quantidadeReal += (it.qty || 0) * (it.peso || 0); });
    });

    const { error } = await supabase
      .from("ordens")
      .update({
        status: "aguardando_liberacao",
        hora_fim: horaFim,
        hora_inicio: null,
        obs_linha: obsLinha.trim() || null,
        motivo_reprovacao: null,
        ...(quantidadeReal > 0 ? { quantidade_real: quantidadeReal } : {}),
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
    if (!window.confirm("Deseja excluir esta parada?")) return;
    const { error } = await supabase.from("paradas").delete().eq("id", id);
    if (error) toast({ title: "Erro ao excluir parada", description: error.message, variant: "destructive" });
    else await fetchParadas();
  };

  const excluirRegistro = async (id: string) => {
    console.log("[DELETE] tabela: registros_diarios | id:", id);
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
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setParadaOpen(true)} className="h-7 px-2 text-xs gap-1">
                <PauseCircle className="h-3.5 w-3.5" />
                Nova Parada
              </Button>
              <Button size="sm" variant="outline" onClick={() => setParadasListOpen(true)} className="h-7 px-2 text-xs gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                Paradas do Dia
                {paradas.length > 0 && (
                  <span className="ml-0.5 bg-orange-100 text-orange-700 rounded-full px-1.5 text-[10px] font-semibold">{paradas.length}</span>
                )}
              </Button>
            </div>
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

          {emLinha.orientacoes && (
            <div className="rounded-lg border-2 border-green-700 bg-green-600 px-4 py-3 space-y-2 shadow-md">
              <p className="text-sm font-extrabold text-white uppercase tracking-widest">📋 ORIENTAÇÕES DE PRODUÇÃO</p>
              <p className="text-base font-bold text-white whitespace-pre-wrap">{emLinha.orientacoes}</p>
            </div>
          )}

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

          {/* ── Etapa 1: registrar hora início ── */}
          {!emLinha.hora_inicio && (
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">Registre o início da produção</p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={horaInicioInput}
                  onChange={(e) => setHoraInicioInput(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button
                size="sm"
                disabled={!horaInicioInput || savingInicio}
                onClick={salvarInicio}
              >
                {savingInicio && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Início
              </Button>
            </div>
          )}

          {/* ── Etapa 2: concluir produção ── */}
          {emLinha.hora_inicio && (
            <div className="space-y-4">
              {/* Hora início — somente leitura */}
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Início:</span>
                <span className="font-semibold font-mono">{String(emLinha.hora_inicio).slice(0, 5)}</span>
              </div>

              {/* Hora fim */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Registro de produção */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Registro de Produção</label>
                {prodItems.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.qty}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        setProdItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
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
                        setProdItems((prev) => prev.map((r, j) => j === i ? { ...r, peso: val } : r));
                      }}
                      placeholder="0,000 kg"
                      className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>

              {/* Observações da linha */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Observações da Linha</label>
                <textarea
                  value={obsLinha}
                  onChange={(e) => setObsLinha(e.target.value)}
                  rows={2}
                  placeholder="Opcional"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingDia}
                  onClick={salvarDia}
                >
                  {savingDia
                    ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    : <CalendarCheck2 className="mr-1 h-4 w-4" />}
                  Salvar Dia
                </Button>
                <Button
                  size="sm"
                  className="bg-status-done hover:bg-status-done/90 text-primary-foreground"
                  onClick={() => setConfirmOpen(true)}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Concluir
                </Button>
              </div>
            </div>
          )}

          {/* Histórico de registros diários */}
          {registros.length > 0 && (
            <div className="space-y-2 pt-3 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Histórico de registros ({registros.length})
              </p>
              {registros.map((r) => {
                const items: any[] | null = Array.isArray(r.registro_producao) ? r.registro_producao : null;
                const filled = items?.filter((i: any) => i.qty || i.peso) ?? [];
                const total = filled.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
                const prodStr = filled.map((i: any) => `${i.qty}× ${formatKg(i.peso)} kg`).join(" + ");
                const horas = parseHoras(r.hora_inicio, r.hora_fim);
                return (
                  <div key={r.id} className="rounded-lg border bg-muted/30 px-3 py-2 flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">
                          {format(new Date(r.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        {r.hora_inicio && r.hora_fim && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {String(r.hora_inicio).slice(0, 5)} – {String(r.hora_fim).slice(0, 5)}
                            {horas !== null && ` (${horas.toFixed(1)}h)`}
                          </span>
                        )}
                      </div>
                      {prodStr && (
                        <p className="text-sm font-mono text-foreground">
                          {prodStr}
                          {total > 0 && (
                            <span className="ml-2 text-xs font-semibold text-primary">= {formatKg(total)} kg</span>
                          )}
                        </p>
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

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir ordem</AlertDialogTitle>
                <AlertDialogDescription>
                  Deseja registrar a produção e marcar esta ordem como concluída?
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
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Factory className="h-4 w-4 text-primary" />
              Linha {linha}
            </span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setParadaOpen(true)} className="h-7 px-2 text-xs gap-1">
                <PauseCircle className="h-3.5 w-3.5" />
                Nova Parada
              </Button>
              <Button size="sm" variant="outline" onClick={() => setParadasListOpen(true)} className="h-7 px-2 text-xs gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                Paradas do Dia
                {paradas.length > 0 && (
                  <span className="ml-0.5 bg-orange-100 text-orange-700 rounded-full px-1.5 text-[10px] font-semibold">{paradas.length}</span>
                )}
              </Button>
            </div>
          </div>
          <p>Nenhuma ordem em andamento</p>
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
                  {(kgHoje[ordem.id] ?? 0) > 0 && (
                    <div className="text-xs text-primary font-medium mt-0.5">
                      {formatKg(kgHoje[ordem.id])} kg produzidos hoje
                    </div>
                  )}
                </div>
                {!emLinha && (
                  <Button size="sm" variant="outline" onClick={() => iniciarOrdem(ordem)} className="shrink-0">
                    <Play className="mr-1 h-3 w-3" />
                    Iniciar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog: Paradas do Dia */}
      <Dialog open={paradasListOpen} onOpenChange={setParadasListOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Paradas do Dia — Linha {linha}</DialogTitle>
          </DialogHeader>
          {paradas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma parada registrada hoje</p>
          ) : (
            <div className="space-y-2 py-2">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setParadasListOpen(false)}>Fechar</Button>
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
