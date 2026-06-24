import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, AlertTriangle, ArrowRight, FlaskConical, Thermometer, Clock, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { MarcaBadge } from "@/components/MarcaBadge";
import { formatKg, parseHoras } from "@/lib/utils";
import { parseObsItems, formatObsLine } from "@/lib/obsUtils";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_pesagem: "Em Pesagem",
  aguardando_mistura: "Aguardando Mistura",
  em_mistura: "Em Mistura",
  aguardando_linha: "Aguardando Linha",
  em_linha: "Em Linha",
  aguardando_liberacao: "Aguardando Liberação",
  concluido: "Concluído",
};

const MOTIVOS: Record<string, string> = {
  manutencao: "Manutenção",
  sem_material: "Sem Material",
  problema_processo: "Problemas de Processo",
  falta_energia: "Falta de Energia",
};

function fmtHora(h: string | null | undefined) {
  return h ? String(h).slice(0, 5) : "—";
}

function toH(s: string | null | undefined) {
  if (!s) return 0;
  const [h, m] = String(s).split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

export const DetalheOrdemDialog = memo(function DetalheOrdemDialog({
  ordem,
  onClose,
}: {
  ordem: any | null;
  onClose: () => void;
}) {
  const [hist, setHist] = useState<any[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [paradas, setParadas] = useState<any[]>([]);
  const [formulaItens, setFormulaItens] = useState<{ sequencia: number | null; materia_prima: string; quantidade_kg: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchParadas = useCallback(async (datas: string[]) => {
    if (!ordem || datas.length === 0) return;
    const { data: p } = await supabase
      .from("paradas")
      .select("id, data, motivo, hora_inicio, hora_fim")
      .eq("linha", ordem.linha)
      .in("data", datas)
      .order("data", { ascending: true })
      .order("hora_inicio", { ascending: true });
    setParadas(p ?? []);
  }, [ordem?.id, ordem?.linha]);

  const handleDeleteParada = useCallback(async (id: string) => {
    if (!window.confirm("Excluir esta parada?")) return;
    await supabase.from("paradas").delete().eq("id", id);
    const datas = [...new Set<string>(registros.map((r: any) => r.data))];
    await fetchParadas(datas);
  }, [registros, fetchParadas]);

  useEffect(() => {
    if (!ordem) return;
    setLoading(true);
    setHist([]); setRegistros([]); setParadas([]); setFormulaItens([]);

    Promise.all([
      supabase
        .from("historico")
        .select("id, status_anterior, status_novo, alterado_em")
        .eq("ordem_id", ordem.id)
        .order("alterado_em", { ascending: true }),
      (supabase as any)
        .from("registros_diarios")
        .select("id, data, hora_inicio, hora_fim, registro_producao")
        .eq("ordem_id", ordem.id)
        .order("data", { ascending: true }),
      (supabase as any)
        .from("ordens_formula")
        .select("sequencia, materia_prima, quantidade_kg")
        .eq("ordem_id", ordem.id)
        .order("sequencia", { ascending: true }),
    ]).then(async ([h, r, f]) => {
      setHist(h.data ?? []);
      setRegistros(r.data ?? []);

      const datas: string[] = [...new Set<string>((r.data ?? []).map((rd: any) => rd.data))];
      await fetchParadas(datas);

      if (f.data && (f.data as any[]).length > 0) {
        setFormulaItens(f.data);
      } else if (ordem.formula_id) {
        const { data: padrao } = await (supabase as any)
          .from("formulas")
          .select("sequencia, materia_prima, percentual")
          .eq("formula_id", ordem.formula_id)
          .order("sequencia", { ascending: true });
        if (padrao && padrao.length > 0) {
          const batelada = ordem.tamanho_batelada ?? ordem.quantidade;
          setFormulaItens(padrao.map((item: any) => ({
            sequencia: item.sequencia,
            materia_prima: item.materia_prima,
            quantidade_kg: batelada ? (item.percentual / 100) * batelada : item.percentual,
          })));
        }
      }

      setLoading(false);
    });
  }, [ordem?.id]);

  const reprovaCount = useMemo(() => {
    const fromHist = hist.filter((h) => h.status_anterior === "aguardando_liberacao" && h.status_novo === "em_linha").length;
    return Math.max(fromHist, ordem?.motivo_reprovacao ? 1 : 0);
  }, [hist, ordem?.motivo_reprovacao]);

  const totalProduzido = useMemo(() => {
    const registrosFiltrados = ordem?.data_reprovacao
      ? registros.filter((r: any) => r.data > ordem.data_reprovacao)
      : registros;
    return registrosFiltrados.reduce((sum: number, r: any) => {
      const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
      return sum + items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.peso || 0), 0);
    }, 0);
  }, [registros, ordem?.data_reprovacao]);

  const obsItems = useMemo(() => parseObsItems(ordem?.obs ?? null), [ordem?.obs]);

  const registrosComputados = useMemo(() => {
    return registros.map((r: any) => {
      const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
      const filled = items.filter((i) => i.qty || i.peso);
      const prodStr = filled.map((i: any) => `${i.qty}× ${formatKg(i.peso)} kg`).join(" + ");
      const totalReg = filled.reduce((s: number, i: any) => s + (i.qty || 0) * (i.peso || 0), 0);
      const horas = parseHoras(r.hora_inicio, r.hora_fim);
      const horasParadas = paradas
        .filter((p: any) => p.data === r.data && toH(p.hora_inicio) < toH(r.hora_fim) && toH(p.hora_fim) > toH(r.hora_inicio))
        .reduce((acc: number, p: any) => acc + Math.min(toH(p.hora_fim), toH(r.hora_fim)) - Math.max(toH(p.hora_inicio), toH(r.hora_inicio)), 0);
      const horasNet = horas !== null ? Math.max(0, horas - horasParadas) : null;
      const kgH = horasNet && horasNet > 0 && totalReg > 0 ? totalReg / horasNet : null;
      return { ...r, prodStr, totalReg, horas, horasNet, kgH };
    });
  }, [registros, paradas]);

  const totalHorasParadas = useMemo(
    () => paradas.reduce((acc: number, p: any) => acc + Math.max(0, toH(p.hora_fim) - toH(p.hora_inicio)), 0),
    [paradas]
  );

  if (!ordem) return null;

  return (
    <Dialog open={!!ordem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="leading-tight text-base">
            Detalhes da OP — Lote {ordem.lote}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{ordem.produto}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5 py-1">

            {/* 1. Dados da OP */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Dados da OP</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm rounded-lg border bg-muted/30 px-4 py-3">
                <div><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{ordem.produto}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-muted-foreground">Marca:</span> <MarcaBadge marca={ordem.marca} size="sm" /></div>
                <div><span className="text-muted-foreground">Lote:</span> <span className="font-mono font-medium">{ordem.lote}</span></div>
                <div><span className="text-muted-foreground">Fórmula:</span> <span className="font-medium">{ordem.formula_id ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Qtd programada:</span> <span className="font-medium">{formatKg(ordem.quantidade)} kg</span></div>
                <div><span className="text-muted-foreground">Qtd real:</span> <span className="font-semibold">{ordem.quantidade_real != null ? `${formatKg(ordem.quantidade_real)} kg` : "—"}</span></div>
                <div><span className="text-muted-foreground">Linha:</span> <span className="font-medium">L{ordem.linha}</span></div>
                <div><span className="text-muted-foreground">Balança:</span> <span className="font-medium">{ordem.balanca ? `B${ordem.balanca}` : "—"}</span></div>
                <div><span className="text-muted-foreground">Data prog.:</span> <span className="font-medium">{format(new Date(ordem.data_programacao + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span></div>
                <div className="flex items-center gap-1"><span className="text-muted-foreground">Status:</span> <StatusBadge status={ordem.status} /></div>
              </div>
            </section>

            {/* 2. Produção total */}
            {totalProduzido > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Produção Total (registros)</h3>
                <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <div><span className="text-muted-foreground">Programado:</span> <span className="font-semibold">{formatKg(ordem.quantidade)} kg</span></div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><span className="text-muted-foreground">Produzido:</span> <span className="font-bold text-primary">{formatKg(totalProduzido)} kg</span></div>
                  {ordem.quantidade > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Math.round((totalProduzido / ordem.quantidade) * 100)}%
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* 3. Adições para mistura */}
            {ordem.obs && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Adições para Mistura</h3>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  {obsItems ? (
                    <ul className="space-y-0.5">
                      {obsItems.map((item, i) => (
                        <li key={i} className="font-mono text-amber-900">{formatObsLine(item)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-amber-900 whitespace-pre-wrap">{ordem.obs}</p>
                  )}
                </div>
              </section>
            )}

            {/* 4. Fórmula Utilizada */}
            {formulaItens.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fórmula Utilizada</h3>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-xs">
                        <th className="text-left px-3 py-1.5 font-medium">Seq.</th>
                        <th className="text-left px-3 py-1.5 font-medium">Matéria-Prima</th>
                        <th className="text-right px-3 py-1.5 font-medium">Qtd (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulaItens.map((item, i) => (
                        <tr key={`${item.sequencia ?? i}-${item.materia_prima}`} className="border-t last:border-b-0">
                          <td className="px-3 py-1.5 text-muted-foreground font-mono">{item.sequencia ?? i + 1}</td>
                          <td className="px-3 py-1.5 font-medium">{item.materia_prima}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{formatKg(item.quantidade_kg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 5. Obs linha */}
            {ordem.obs_linha && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações da Linha</h3>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{ordem.obs_linha}</p>
              </section>
            )}

            {/* 5. Observações do Laboratório */}
            {ordem.obs_laboratorio && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
                  Observações do Laboratório
                </h3>
                <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900 whitespace-pre-wrap">
                  {ordem.obs_laboratorio}
                </div>
              </section>
            )}

            {/* 6. Temperaturas de Processo */}
            {ordem.temperaturas && Object.values(ordem.temperaturas as Record<string, number | null>).some((v) => v != null) && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Thermometer className="h-3.5 w-3.5 text-blue-500" />
                  Temperaturas de Processo
                </h3>
                <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  {(["zona1", "zona2", "zona3", "zona9", "zona10", "zona12"] as const).map((z) => {
                    const val = (ordem.temperaturas as Record<string, number | null>)[z];
                    return (
                      <div key={z}>
                        <span className="text-muted-foreground">Zona {z.replace("zona", "")}:</span>{" "}
                        <span className="font-semibold">{val != null ? `${val}°C` : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 7. Reprovações */}
            {(reprovaCount > 0 || ordem.motivo_reprovacao) && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  Reprovações ({reprovaCount}×)
                </h3>
                {ordem.motivo_reprovacao && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 whitespace-pre-wrap">
                    {ordem.data_reprovacao && (
                      <p className="text-xs text-red-600 mb-1 font-medium">
                        {format(new Date(ordem.data_reprovacao + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                    {ordem.motivo_reprovacao}
                  </div>
                )}
              </section>
            )}

            {/* 7. Timeline de status */}
            <div className="hidden">
            {hist.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Timeline de Status</h3>
                <div className="space-y-1">
                  {hist.map((h, i) => (
                    <div key={h.id} className="flex items-start gap-2 text-sm">
                      <div className="flex flex-col items-center shrink-0 mt-0.5">
                        <div className={`h-2 w-2 rounded-full ${i === hist.length - 1 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                        {i < hist.length - 1 && <div className="w-px flex-1 bg-border min-h-[16px]" />}
                      </div>
                      <div className="flex-1 pb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-muted-foreground">{STATUS_LABEL[h.status_anterior ?? ""] ?? h.status_anterior}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                          <span className="font-medium">{STATUS_LABEL[h.status_novo ?? ""] ?? h.status_novo}</span>
                          {h.alterado_em && (
                            <span className="ml-auto text-xs text-muted-foreground font-mono shrink-0">
                              {format(new Date(h.alterado_em), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            </div>

            {/* 8. Registros diários */}
            {registros.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Registros de Produção ({registros.length})
                </h3>
                <div className="space-y-2">
                  {registrosComputados.map((r: any) => (
                    <div key={r.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-semibold">
                          {format(new Date(r.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {fmtHora(r.hora_inicio)} – {fmtHora(r.hora_fim)}
                          {r.horas !== null && <span className="ml-1">({r.horas.toFixed(1)}h)</span>}
                        </span>
                        {r.totalReg > 0 && (
                          <span className="font-bold text-primary ml-auto">{formatKg(r.totalReg)} kg</span>
                        )}
                      </div>
                      {r.prodStr && <p className="text-xs font-mono text-muted-foreground">{r.prodStr}</p>}
                      {r.kgH !== null && (
                        <p className="text-xs text-muted-foreground/70">{formatKg(r.kgH)} kg/h</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Registros de Produção</h3>
                <p className="text-sm text-muted-foreground text-center py-3 rounded-lg border border-dashed">
                  Nenhum registro salvo ainda
                </p>
              </section>
            )}

            {/* 9. Paradas */}
            {paradas.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-orange-500" />
                  Paradas ({paradas.length})
                </h3>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-xs">
                        <th className="text-left px-3 py-1.5 font-medium">Motivo</th>
                        <th className="text-left px-3 py-1.5 font-medium">Data</th>
                        <th className="text-right px-3 py-1.5 font-medium">Início</th>
                        <th className="text-right px-3 py-1.5 font-medium">Fim</th>
                        <th className="text-right px-3 py-1.5 font-medium">Duração</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {paradas.map((p: any) => {
                        const dur = Math.max(0, toH(p.hora_fim) - toH(p.hora_inicio));
                        return (
                          <tr key={p.id} className="border-t last:border-b-0 group">
                            <td className="px-3 py-1.5 font-medium">{MOTIVOS[p.motivo] ?? p.motivo}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">
                              {format(new Date(p.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">{fmtHora(p.hora_inicio)}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{fmtHora(p.hora_fim)}</td>
                            <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">{dur.toFixed(1)}h</td>
                            <td className="px-1.5 py-1.5 text-right">
                              <button
                                onClick={() => handleDeleteParada(p.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                title="Excluir parada"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/40">
                        <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">
                          Total de paradas:
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold font-mono text-orange-600">
                          {totalHorasParadas.toFixed(1)}h
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
