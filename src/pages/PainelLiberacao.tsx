import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { parseObsLinhaItems, formatObsLinha, parseObsItems, formatObsLine } from "@/lib/obsUtils";
import { formatKg } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { recalcularPosicoes } from "@/lib/recalcularPosicoes";
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

interface RegistroItemDraft { qty: string; peso: string; }
interface RegistroDraft {
  id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  items: RegistroItemDraft[];
}
interface EditDraft {
  hora_inicio: string;
  hora_fim: string;
  quantidade_real: string;
  // used when no registros_diarios
  obs_linha_items: Array<{ qty: string; peso: string }>;
  // used when registros_diarios exist
  registros: RegistroDraft[];
  hasRegistros: boolean;
}

function calcQtdFromRegistros(regs: any[]): number | null {
  if (!regs.length) return null;
  let total = 0;
  regs.forEach((r) => {
    const items = r.registro_producao;
    if (Array.isArray(items)) {
      items.forEach((item: any) => { total += (item.qty || 0) * (item.peso || 0); });
    }
  });
  return total > 0 ? total : null;
}

export default function PainelLiberacao() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrosPorOrdem, setRegistrosPorOrdem] = useState<Record<string, any[]>>({});
  const [paradasPorOrdem, setParadasPorOrdem] = useState<Record<string, any[]>>({});
  const [qtdReal, setQtdReal] = useState<Record<string, string>>({});
  const [horaInicioEdit, setHoraInicioEdit] = useState<Record<string, string>>({});
  const [horaFimEdit, setHoraFimEdit] = useState<Record<string, string>>({});
  const [prodItemsEdit, setProdItemsEdit] = useState<Record<string, Array<{ qty: string; peso: string }>>>({});
  const [liberarOrdem, setLiberarOrdem] = useState<any | null>(null);
  const [reprovarOrdem, setReprovarOrdem] = useState<any | null>(null);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [editOrdem, setEditOrdem] = useState<any | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteRegistro, setDeleteRegistro] = useState<{ id: string; ordemId: string } | null>(null);
  const [deletandoRegistro, setDeletandoRegistro] = useState(false);

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from("ordens")
      .select("id, produto, lote, quantidade, status, posicao, linha, balanca, data_programacao, marca, hora_inicio, hora_fim, obs_linha, obs, motivo_reprovacao")
      .eq("status", "aguardando_liberacao")
      .order("posicao", { ascending: true, nullsFirst: false });

    if (!data) { setLoading(false); return; }
    setOrdens(data);

    const ids = data.map((o: any) => o.id);
    let regMap: Record<string, any[]> = {};
    if (ids.length > 0) {
      const { data: regData } = await (supabase as any)
        .from("registros_diarios")
        .select("id, ordem_id, data, hora_inicio, hora_fim, registro_producao")
        .in("ordem_id", ids)
        .order("data", { ascending: true });
      (regData ?? []).forEach((r: any) => {
        if (!regMap[r.ordem_id]) regMap[r.ordem_id] = [];
        regMap[r.ordem_id].push(r);
      });
    }
    setRegistrosPorOrdem(regMap);

    // Busca todas as paradas de uma vez e distribui por OP
    const paradaMap: Record<string, any[]> = {};
    const allDatas = [...new Set(Object.values(regMap).flatMap((regs) => regs.map((r: any) => r.data)))];
    const allLinhas = [...new Set(data.map((o: any) => o.linha).filter(Boolean))];
    if (allDatas.length > 0 && allLinhas.length > 0) {
      const { data: todasParadas } = await (supabase as any)
        .from("paradas")
        .select("id, linha, data, motivo, hora_inicio, hora_fim")
        .in("linha", allLinhas)
        .in("data", allDatas)
        .order("hora_inicio", { ascending: true });
      for (const o of data) {
        const datas = new Set((regMap[o.id] ?? []).map((r: any) => r.data));
        const paradas = (todasParadas ?? []).filter((p: any) => p.linha === o.linha && datas.has(p.data));
        if (paradas.length > 0) paradaMap[o.id] = paradas;
      }
    }
    setParadasPorOrdem(paradaMap);

    setQtdReal((prev) => {
      const next = { ...prev };
      for (const o of data) {
        if (!(o.id in next)) {
          const regs = regMap[o.id] ?? [];
          const fromRegs = calcQtdFromRegistros(regs);
          if (fromRegs !== null) {
            next[o.id] = fromRegs.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
          } else {
            const items = parseObsLinhaItems(o.obs_linha);
            if (items && items.length > 0) {
              const total = items.reduce((acc, i) => acc + i.qty * i.peso, 0);
              next[o.id] = total.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            } else {
              next[o.id] = "";
            }
          }
        }
      }
      return next;
    });

    setHoraInicioEdit((prev) => {
      const next = { ...prev };
      for (const o of data) {
        if (!(o.id in next)) next[o.id] = o.hora_inicio?.slice(0, 5) ?? "";
      }
      return next;
    });
    setHoraFimEdit((prev) => {
      const next = { ...prev };
      for (const o of data) {
        if (!(o.id in next)) next[o.id] = o.hora_fim?.slice(0, 5) ?? "";
      }
      return next;
    });
    setProdItemsEdit((prev) => {
      const next = { ...prev };
      for (const o of data) {
        if (!(o.id in next)) next[o.id] = [{ qty: "", peso: "" }, { qty: "", peso: "" }];
      }
      return next;
    });

    setLoading(false);
  };

  useEffect(() => {
    fetchOrdens();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("liberacao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchOrdens(), 300);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDeleteParada = async (paradaId: string, ordemId: string) => {
    if (!window.confirm("Excluir esta parada? Esta ação não pode ser desfeita.")) return;
    const { error } = await (supabase as any).from("paradas").delete().eq("id", paradaId);
    if (error) {
      toast({ title: "Erro ao excluir parada", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Parada excluída" });
      setParadasPorOrdem((prev) => ({
        ...prev,
        [ordemId]: (prev[ordemId] ?? []).filter((p: any) => p.id !== paradaId),
      }));
    }
  };

  const handleDeleteRegistro = async () => {
    if (!deleteRegistro) return;
    setDeletandoRegistro(true);
    console.log("[DELETE] tabela: registros_diarios | id:", deleteRegistro.id);
    const { error } = await (supabase as any)
      .from("registros_diarios")
      .delete()
      .eq("id", deleteRegistro.id);
    if (error) {
      toast({ title: "Erro ao excluir registro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro excluído" });
      setRegistrosPorOrdem((prev) => ({
        ...prev,
        [deleteRegistro.ordemId]: (prev[deleteRegistro.ordemId] ?? []).filter((r: any) => r.id !== deleteRegistro.id),
      }));
    }
    setDeletandoRegistro(false);
    setDeleteRegistro(null);
  };

  const openEdit = (ordem: any) => {
    const regs: any[] = registrosPorOrdem[ordem.id] ?? [];
    const hasRegistros = regs.length > 0;

    const rawQtd = qtdReal[ordem.id] ?? "";

    if (hasRegistros) {
      const registros: RegistroDraft[] = regs.map((r) => {
        const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
        const draftItems: RegistroItemDraft[] = items.length > 0
          ? items.map((it: any) => ({
              qty: String(it.qty ?? ""),
              peso: (it.peso ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
            }))
          : [{ qty: "", peso: "" }];
        return {
          id: r.id,
          data: r.data,
          hora_inicio: r.hora_inicio?.slice(0, 5) ?? "",
          hora_fim: r.hora_fim?.slice(0, 5) ?? "",
          items: draftItems,
        };
      });
      setEditDraft({
        hora_inicio: ordem.hora_inicio?.slice(0, 5) ?? "",
        hora_fim: ordem.hora_fim?.slice(0, 5) ?? "",
        quantidade_real: rawQtd,
        obs_linha_items: [],
        registros,
        hasRegistros: true,
      });
    } else {
      const obsItems = parseObsLinhaItems(ordem.obs_linha);
      const draftItems = obsItems && obsItems.length > 0
        ? obsItems.map((i) => ({
            qty: String(i.qty),
            peso: i.peso.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
          }))
        : [{ qty: "", peso: "" }];
      setEditDraft({
        hora_inicio: ordem.hora_inicio?.slice(0, 5) ?? "",
        hora_fim: ordem.hora_fim?.slice(0, 5) ?? "",
        quantidade_real: rawQtd,
        obs_linha_items: draftItems,
        registros: [],
        hasRegistros: false,
      });
    }
    setEditOrdem(ordem);
  };

  const saveEdit = async () => {
    if (!editOrdem || !editDraft) return;
    setEditSaving(true);

    const qtdParsed = parseFloat(editDraft.quantidade_real.replace(",", "."));

    if (editDraft.hasRegistros) {
      // Update registros_diarios FIRST so that when the ordens update triggers
      // realtime → fetchOrdens, the DB already has the updated registros
      for (const reg of editDraft.registros) {
        const validItems = reg.items.filter((i) => i.qty.trim() !== "" || i.peso.trim() !== "");
        const registroProducao = validItems.map((i) => ({
          qty: parseFloat(i.qty) || 0,
          peso: parseFloat(i.peso.replace(",", ".")) || 0,
        }));
        const { error: regError } = await (supabase as any)
          .from("registros_diarios")
          .update({
            hora_inicio: reg.hora_inicio || null,
            hora_fim: reg.hora_fim || null,
            registro_producao: registroProducao,
          })
          .eq("id", reg.id);
        if (regError) {
          setEditSaving(false);
          toast({ title: "Erro ao salvar registro", description: regError.message, variant: "destructive" });
          return;
        }
      }

      // Sync local registrosPorOrdem
      setRegistrosPorOrdem((prev) => ({
        ...prev,
        [editOrdem.id]: editDraft.registros.map((reg) => {
          const validItems = reg.items.filter((i) => i.qty.trim() !== "" || i.peso.trim() !== "");
          return {
            ...((prev[editOrdem.id] ?? []).find((r: any) => r.id === reg.id) ?? {}),
            hora_inicio: reg.hora_inicio,
            hora_fim: reg.hora_fim,
            registro_producao: validItems.map((i) => ({
              qty: parseFloat(i.qty) || 0,
              peso: parseFloat(i.peso.replace(",", ".")) || 0,
            })),
          };
        }),
      }));

      // Recalculate qtdReal from updated registros
      const allItems = editDraft.registros.flatMap((reg) =>
        reg.items
          .filter((i) => i.qty.trim() !== "" || i.peso.trim() !== "")
          .map((i) => ({ qty: parseFloat(i.qty) || 0, peso: parseFloat(i.peso.replace(",", ".")) || 0 }))
      );
      const newTotal = allItems.reduce((acc, i) => acc + i.qty * i.peso, 0);
      if (newTotal > 0) {
        setQtdReal((prev) => ({
          ...prev,
          [editOrdem.id]: newTotal.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
        }));
      }
    }

    // Update ordens AFTER registros_diarios so the realtime fetch picks up fresh data
    const obsLinhaJson = !editDraft.hasRegistros
      ? (() => {
          const validItems = editDraft.obs_linha_items.filter((i) => i.qty.trim() !== "" || i.peso.trim() !== "");
          return validItems.length > 0
            ? JSON.stringify(validItems.map((i) => ({ qty: parseFloat(i.qty) || 0, peso: parseFloat(i.peso.replace(",", ".")) || 0 })))
            : null;
        })()
      : undefined;

    const { error: ordemError } = await supabase
      .from("ordens")
      .update({
        hora_inicio: editDraft.hora_inicio || null,
        hora_fim: editDraft.hora_fim || null,
        ...(isNaN(qtdParsed) ? {} : { quantidade_real: qtdParsed }),
        ...(obsLinhaJson !== undefined ? { obs_linha: obsLinhaJson } : {}),
      } as any)
      .eq("id", editOrdem.id);

    if (ordemError) {
      setEditSaving(false);
      toast({ title: "Erro ao salvar ordem", description: ordemError.message, variant: "destructive" });
      return;
    }

    setEditOrdem(null);
    setEditDraft(null);
    await fetchOrdens();
    setEditSaving(false);
    toast({ title: "Ordem atualizada com sucesso" });
  };

  const liberar = async (ordem: any) => {
    const regs = registrosPorOrdem[ordem.id] ?? [];
    const semDados = !ordem.hora_inicio && !ordem.hora_fim && regs.length === 0 && !ordem.obs_linha;

    if (semDados) {
      const hi = horaInicioEdit[ordem.id] ?? "";
      const hf = horaFimEdit[ordem.id] ?? "";
      const items = (prodItemsEdit[ordem.id] ?? []).filter((r) => r.qty.trim() || r.peso.trim());

      if (items.length > 0) {
        await (supabase as any).from("registros_diarios").insert({
          ordem_id: ordem.id,
          data: ordem.data_programacao,
          hora_inicio: hi || null,
          hora_fim: hf || null,
          registro_producao: items.map((r) => ({
            qty: parseInt(r.qty) || 0,
            peso: parseFloat(r.peso.replace(",", ".")) || 0,
          })),
        });
      } else if (hi || hf) {
        await supabase.from("ordens").update({ hora_inicio: hi || null, hora_fim: hf || null } as any).eq("id", ordem.id);
      }
    }

    const raw = qtdReal[ordem.id] ?? "";
    const parsed = parseFloat(raw.replace(",", "."));
    const { error } = await supabase
      .from("ordens")
      .update({
        status: "concluido",
        data_conclusao: new Date().toISOString(),
        ...(isNaN(parsed) ? {} : { quantidade_real: parsed }),
      } as any)
      .eq("id", ordem.id);

    if (error) {
      toast({ title: "Erro ao liberar ordem", description: error.message, variant: "destructive" });
      return;
    }

    setOrdens((prev) => prev.filter((o) => o.id !== ordem.id));
    setQtdReal((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setRegistrosPorOrdem((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setHoraInicioEdit((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setHoraFimEdit((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setProdItemsEdit((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });

    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_liberacao",
      status_novo: "concluido",
    });
  };

  const reprovar = async (ordem: any) => {
    const regs = registrosPorOrdem[ordem.id] ?? [];

    if (regs.length > 0) {
      const paradasPayload = regs
        .filter((r) => r.hora_inicio && r.hora_fim)
        .map((r) => ({
          linha: ordem.linha,
          data: r.data,
          motivo: "problema_processo",
          hora_inicio: r.hora_inicio,
          hora_fim: r.hora_fim,
        }));
      if (paradasPayload.length > 0) {
        await (supabase as any).from("paradas").insert(paradasPayload);
      }
    }

    const hoje = new Date().toISOString().split("T")[0];
    const { error } = await supabase
      .from("ordens")
      .update({
        status: "aguardando_linha",
        motivo_reprovacao: motivoReprovacao.trim() || null,
        quantidade_real: null,
        hora_inicio: null,
        hora_fim: null,
        obs_linha: null,
        data_programacao: hoje,
      } as any)
      .eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao reprovar ordem", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_liberacao",
      status_novo: "aguardando_linha",
    });
    await recalcularPosicoes(ordem.linha);

    setOrdens((prev) => prev.filter((o) => o.id !== ordem.id));
    setQtdReal((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setRegistrosPorOrdem((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setHoraInicioEdit((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setHoraFimEdit((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setProdItemsEdit((prev) => { const n = { ...prev }; delete n[ordem.id]; return n; });
    setMotivoReprovacao("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Liberação de Qualidade</h1>
        {ordens.length > 0 && (
          <span className="ml-auto text-sm text-muted-foreground">
            {ordens.length} aguardando
          </span>
        )}
      </div>

      {ordens.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center text-muted-foreground">
          Nenhuma ordem aguardando liberação
        </div>
      ) : (
        <div className="space-y-4">
          {ordens.map((ordem) => {
            const regs = registrosPorOrdem[ordem.id] ?? [];
            return (
              <div key={ordem.id} className="bg-card rounded-xl border-2 border-orange-200 p-5 space-y-3">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status="aguardando_liberacao" />
                    <span className="text-sm text-muted-foreground shrink-0">Linha {ordem.linha}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-sm text-muted-foreground shrink-0">Lote {ordem.lote}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">
                      Prog.: {formatKg(ordem.quantidade)} kg
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(ordem)}
                      title="Editar ordem"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="text-lg font-bold leading-tight">{ordem.produto}</div>
                  <MarcaBadge marca={ordem.marca} />
                </div>

                {/* Registros diários */}
                {regs.length > 0 ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50 overflow-hidden">
                    <div className="px-4 py-2.5 bg-blue-100/60 flex items-center justify-between">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        Registros Diários
                      </p>
                      <span className="text-xs text-blue-600 font-medium">
                        {regs.length} dia{regs.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="divide-y divide-blue-100">
                      {regs.map((r, i) => {
                        const items: any[] | null = Array.isArray(r.registro_producao) ? r.registro_producao : null;
                        const filled = items?.filter((it: any) => it.qty || it.peso) ?? [];
                        const diaTotal = filled.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
                        const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
                        const horas = toMin(r.hora_fim) - toMin(r.hora_inicio);
                        return (
                          <div key={i} className="px-4 py-2.5 space-y-1">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-blue-900">
                                  {format(new Date(r.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                                </span>
                                <span className="text-xs font-mono text-blue-600 bg-blue-100 rounded px-1.5 py-0.5">
                                  {r.hora_inicio.slice(0, 5)} – {r.hora_fim.slice(0, 5)}
                                  {horas > 0 && <span className="ml-1 text-blue-500">({(horas / 60).toFixed(1)}h)</span>}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {diaTotal > 0 && (
                                  <span className="text-sm font-bold text-blue-800 font-mono">
                                    {formatKg(diaTotal)} kg
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                                  title="Excluir registro"
                                  onClick={() => setDeleteRegistro({ id: r.id, ordemId: ordem.id })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            {filled.length > 0 && (
                              <p className="text-xs text-blue-700 font-mono pl-0.5">
                                {filled.map((it: any) => `${it.qty}× ${formatKg(it.peso)}`).join("  +  ")}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      const total = calcQtdFromRegistros(regs);
                      if (total === null) return null;
                      return (
                        <div className="px-4 py-2.5 bg-blue-100/80 border-t border-blue-200 flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                            Total calculado
                          </span>
                          <span className="text-base font-extrabold text-blue-900 font-mono">
                            {formatKg(total)} kg
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                ) : ordem.obs_linha ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Registro de Produção</p>
                    <p className="text-sm text-blue-900 font-mono">
                      {(() => { const items = parseObsLinhaItems(ordem.obs_linha); return items ? formatObsLinha(items) : ordem.obs_linha; })()}
                    </p>
                  </div>
                ) : null}

                {/* Paradas associadas à OP */}
                {(paradasPorOrdem[ordem.id] ?? []).length > 0 && (
                  <div className="rounded-md border border-orange-200 bg-orange-50 overflow-hidden">
                    <div className="px-4 py-2.5 bg-orange-100/60 flex items-center justify-between">
                      <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">Paradas</p>
                      <span className="text-xs text-orange-600 font-medium">
                        {(paradasPorOrdem[ordem.id] ?? []).length} registro{(paradasPorOrdem[ordem.id] ?? []).length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="divide-y divide-orange-100">
                      {(paradasPorOrdem[ordem.id] ?? []).map((p: any) => (
                        <div key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-orange-900">{p.motivo}</p>
                            <p className="text-xs font-mono text-orange-600">
                              {String(p.hora_inicio).slice(0, 5)} – {String(p.hora_fim).slice(0, 5)}
                              {" · "}{p.data}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500 shrink-0"
                            title="Excluir parada"
                            onClick={() => handleDeleteParada(p.id, ordem.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Campos inline para gestor preencher quando dados estão vazios */}
                {!ordem.hora_inicio && !ordem.hora_fim && regs.length === 0 && !ordem.obs_linha && (
                  <div className="rounded-md border border-dashed border-orange-300 bg-orange-50/60 p-3 space-y-3">
                    <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                      Dados de produção (opcional — preencha antes de liberar)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Hora Início</label>
                        <input
                          type="time"
                          value={horaInicioEdit[ordem.id] ?? ""}
                          onChange={(e) => setHoraInicioEdit((prev) => ({ ...prev, [ordem.id]: e.target.value }))}
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Hora Fim</label>
                        <input
                          type="time"
                          value={horaFimEdit[ordem.id] ?? ""}
                          onChange={(e) => setHoraFimEdit((prev) => ({ ...prev, [ordem.id]: e.target.value }))}
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Registro de Produção (qtd × peso)</label>
                      {(prodItemsEdit[ordem.id] ?? [{ qty: "", peso: "" }, { qty: "", peso: "" }]).map((row, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.qty}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, "");
                              setProdItemsEdit((prev) => {
                                const items = [...(prev[ordem.id] ?? [{ qty: "", peso: "" }, { qty: "", peso: "" }])];
                                items[i] = { ...items[i], qty: val };
                                return { ...prev, [ordem.id]: items };
                              });
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
                              setProdItemsEdit((prev) => {
                                const items = [...(prev[ordem.id] ?? [{ qty: "", peso: "" }, { qty: "", peso: "" }])];
                                items[i] = { ...items[i], peso: val };
                                return { ...prev, [ordem.id]: items };
                              });
                            }}
                            placeholder="0,000 kg"
                            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantidade real */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium shrink-0">Quantidade Real (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={qtdReal[ordem.id] ?? ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9,]/g, "");
                      setQtdReal((prev) => ({ ...prev, [ordem.id]: val }));
                    }}
                    placeholder="0,000"
                    className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {regs.length > 0 && (
                    <span className="text-xs text-muted-foreground">calculado automaticamente</span>
                  )}
                </div>

                {ordem.obs && (() => {
                  const items = parseObsItems(ordem.obs);
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
                        <p className="text-sm text-amber-900 whitespace-pre-wrap">{ordem.obs}</p>
                      )}
                    </div>
                  );
                })()}

                {ordem.motivo_reprovacao && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">✖ Motivo da Reprovação anterior</p>
                    <p className="text-sm text-red-900 whitespace-pre-wrap">{ordem.motivo_reprovacao}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => { setReprovarOrdem(ordem); setMotivoReprovacao(""); }}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Reprovar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-status-done hover:bg-status-done/90 text-primary-foreground"
                    onClick={() => setLiberarOrdem(ordem)}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Liberar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog — Editar ordem */}
      <Dialog open={!!editOrdem} onOpenChange={(open) => { if (!open) { setEditOrdem(null); setEditDraft(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Editar — {editOrdem?.produto} (Lote {editOrdem?.lote})
            </DialogTitle>
          </DialogHeader>

          {editDraft && (
            <div className="space-y-5 py-2">
              {/* Horários da ordem — só mostra quando não há registros_diários */}
              {!editDraft.hasRegistros && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Hora Início</label>
                    <input
                      type="time"
                      value={editDraft.hora_inicio}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, hora_inicio: e.target.value } : d)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Hora Fim</label>
                    <input
                      type="time"
                      value={editDraft.hora_fim}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, hora_fim: e.target.value } : d)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              )}

              {/* Quantidade real */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Quantidade Real (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editDraft.quantidade_real}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9,]/g, "");
                    setEditDraft((d) => d ? { ...d, quantidade_real: val } : d);
                  }}
                  placeholder="0,000"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Registro de produção */}
              {editDraft.hasRegistros ? (
                <div className="space-y-4">
                  <p className="text-sm font-medium">Registros Diários</p>
                  {editDraft.registros.map((reg, ri) => (
                    <div key={reg.id} className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-3">
                      <p className="text-xs font-semibold text-blue-700">
                        {format(new Date(reg.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                      {/* Horários do registro */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Início</label>
                          <input
                            type="time"
                            value={reg.hora_inicio}
                            onChange={(e) =>
                              setEditDraft((d) => {
                                if (!d) return d;
                                const regs = [...d.registros];
                                regs[ri] = { ...regs[ri], hora_inicio: e.target.value };
                                return { ...d, registros: regs };
                              })
                            }
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Fim</label>
                          <input
                            type="time"
                            value={reg.hora_fim}
                            onChange={(e) =>
                              setEditDraft((d) => {
                                if (!d) return d;
                                const regs = [...d.registros];
                                regs[ri] = { ...regs[ri], hora_fim: e.target.value };
                                return { ...d, registros: regs };
                              })
                            }
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </div>
                      {/* Itens */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-muted-foreground">Produção (qtd × peso)</label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs gap-1 px-2"
                            onClick={() =>
                              setEditDraft((d) => {
                                if (!d) return d;
                                const regs = [...d.registros];
                                regs[ri] = { ...regs[ri], items: [...regs[ri].items, { qty: "", peso: "" }] };
                                return { ...d, registros: regs };
                              })
                            }
                          >
                            <Plus className="h-3 w-3" /> Linha
                          </Button>
                        </div>
                        {reg.items.map((item, ii) => (
                          <div key={ii} className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={item.qty}
                              onChange={(e) =>
                                setEditDraft((d) => {
                                  if (!d) return d;
                                  const regs = [...d.registros];
                                  const items = [...regs[ri].items];
                                  items[ii] = { ...items[ii], qty: e.target.value };
                                  regs[ri] = { ...regs[ri], items };
                                  return { ...d, registros: regs };
                                })
                              }
                              placeholder="Qtd"
                              className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <span className="text-muted-foreground text-sm">×</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.peso}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9,]/g, "");
                                setEditDraft((d) => {
                                  if (!d) return d;
                                  const regs = [...d.registros];
                                  const items = [...regs[ri].items];
                                  items[ii] = { ...items[ii], peso: val };
                                  regs[ri] = { ...regs[ri], items };
                                  return { ...d, registros: regs };
                                });
                              }}
                              placeholder="Peso (kg)"
                              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {reg.items.length > 1 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                                onClick={() =>
                                  setEditDraft((d) => {
                                    if (!d) return d;
                                    const regs = [...d.registros];
                                    regs[ri] = { ...regs[ri], items: regs[ri].items.filter((_, i) => i !== ii) };
                                    return { ...d, registros: regs };
                                  })
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Registro de Produção</label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() =>
                        setEditDraft((d) =>
                          d ? { ...d, obs_linha_items: [...d.obs_linha_items, { qty: "", peso: "" }] } : d
                        )
                      }
                    >
                      <Plus className="h-3 w-3" /> Linha
                    </Button>
                  </div>
                  {editDraft.obs_linha_items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={item.qty}
                        onChange={(e) =>
                          setEditDraft((d) => {
                            if (!d) return d;
                            const items = [...d.obs_linha_items];
                            items[idx] = { ...items[idx], qty: e.target.value };
                            return { ...d, obs_linha_items: items };
                          })
                        }
                        placeholder="Qtd"
                        className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <span className="text-muted-foreground text-sm">×</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.peso}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9,]/g, "");
                          setEditDraft((d) => {
                            if (!d) return d;
                            const items = [...d.obs_linha_items];
                            items[idx] = { ...items[idx], peso: val };
                            return { ...d, obs_linha_items: items };
                          });
                        }}
                        placeholder="Peso (kg)"
                        className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      {editDraft.obs_linha_items.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() =>
                            setEditDraft((d) => {
                              if (!d) return d;
                              return { ...d, obs_linha_items: d.obs_linha_items.filter((_, i) => i !== idx) };
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOrdem(null); setEditDraft(null); }}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog — Confirmar liberação */}
      <AlertDialog open={!!liberarOrdem} onOpenChange={(open) => !open && setLiberarOrdem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar liberação</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Produto</span>
                  <span className="font-semibold text-foreground">{liberarOrdem?.produto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lote</span>
                  <span className="font-semibold text-foreground">{liberarOrdem?.lote}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Qtd. programada</span>
                  <span className="text-foreground">{liberarOrdem ? formatKg(liberarOrdem.quantidade) : ""} kg</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Qtd. real produzida</span>
                  <span className="font-bold text-foreground">
                    {liberarOrdem ? (qtdReal[liberarOrdem.id] ?? liberarOrdem.quantidade) : ""} kg
                  </span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-status-done hover:bg-status-done/90"
              onClick={async () => { await liberar(liberarOrdem); setLiberarOrdem(null); }}
            >
              Confirmar Liberação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog — Excluir registro diário */}
      <AlertDialog open={!!deleteRegistro} onOpenChange={(open) => { if (!open) setDeleteRegistro(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Este registro de produção será deletado permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletandoRegistro}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteRegistro}
              disabled={deletandoRegistro}
            >
              {deletandoRegistro && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog — Reprovar */}
      <AlertDialog open={!!reprovarOrdem} onOpenChange={(open) => !open && setReprovarOrdem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar ordem</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{reprovarOrdem?.produto}</strong> (Lote {reprovarOrdem?.lote}) voltará para{" "}
              <strong>Aguardando Linha</strong>. Os registros diários serão mantidos e as paradas registradas automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-1">
            <label className="text-sm font-medium">Motivo da reprovação</label>
            <textarea
              value={motivoReprovacao}
              onChange={(e) => setMotivoReprovacao(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => { await reprovar(reprovarOrdem); setReprovarOrdem(null); }}
            >
              Reprovar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
