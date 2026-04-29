import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, AlertTriangle, ArrowRight } from "lucide-react";
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

export function DetalheOrdemDialog({
  ordem,
  onClose,
}: {
  ordem: any | null;
  onClose: () => void;
}) {
  const [hist, setHist] = useState<any[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [paradas, setParadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ordem) return;
    setLoading(true);
    setHist([]); setRegistros([]); setParadas([]);

    const today = format(new Date(), "yyyy-MM-dd");
    const dateFim = ordem.data_conclusao?.slice(0, 10) ?? today;

    Promise.all([
      supabase
        .from("historico")
        .select("*")
        .eq("ordem_id", ordem.id)
        .order("alterado_em", { ascending: true }),
      (supabase as any)
        .from("registros_diarios")
        .select("*")
        .eq("ordem_id", ordem.id)
        .order("data", { ascending: true }),
      supabase
        .from("paradas")
        .select("*")
        .eq("linha", ordem.linha)
        .gte("data", ordem.data_programacao)
        .lte("data", dateFim)
        .order("data", { ascending: true }),
    ]).then(([h, r, p]) => {
      setHist(h.data ?? []);
      setRegistros(r.data ?? []);
      setParadas(p.data ?? []);
      setLoading(false);
    });
  }, [ordem?.id]);

  if (!ordem) return null;

  const reprovaCount = hist.filter(
    (h) => h.status_anterior === "aguardando_liberacao" && h.status_novo === "em_linha"
  ).length;

  const obsItems = parseObsItems(ordem.obs);

  const totalProduzido = registros.reduce((sum: number, r: any) => {
    const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
    return sum + items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.peso || 0), 0);
  }, 0);

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

            {/* 4. Obs linha */}
            {ordem.obs_linha && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações da Linha</h3>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{ordem.obs_linha}</p>
              </section>
            )}

            {/* 5. Reprovações */}
            {(reprovaCount > 0 || ordem.motivo_reprovacao) && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  Reprovações ({reprovaCount}×)
                </h3>
                {ordem.motivo_reprovacao && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 whitespace-pre-wrap">
                    {ordem.motivo_reprovacao}
                  </div>
                )}
              </section>
            )}

            {/* 6. Timeline de status */}
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

            {/* 7. Registros diários */}
            {registros.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Registros de Produção ({registros.length})
                </h3>
                <div className="space-y-2">
                  {registros.map((r: any) => {
                    const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
                    const filled = items.filter((i) => i.qty || i.peso);
                    const prodStr = filled.map((i) => `${i.qty}× ${formatKg(i.peso)} kg`).join(" + ");
                    const totalReg = filled.reduce((s, i) => s + (i.qty || 0) * (i.peso || 0), 0);
                    const horas = parseHoras(r.hora_inicio, r.hora_fim);
                    const toH = (s: string | null) => { if (!s) return 0; const [h, m] = s.split(":").map(Number); return (h || 0) + (m || 0) / 60; };
                    const horasParadas = paradas
                      .filter((p: any) => p.data === r.data && toH(p.hora_inicio) < toH(r.hora_fim) && toH(p.hora_fim) > toH(r.hora_inicio))
                      .reduce((acc: number, p: any) => acc + Math.min(toH(p.hora_fim), toH(r.hora_fim)) - Math.max(toH(p.hora_inicio), toH(r.hora_inicio)), 0);
                    const horasNet = horas !== null ? Math.max(0, horas - horasParadas) : null;
                    const kgH = horasNet && horasNet > 0 && totalReg > 0 ? totalReg / horasNet : null;
                    return (
                      <div key={r.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold">
                            {format(new Date(r.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {fmtHora(r.hora_inicio)} – {fmtHora(r.hora_fim)}
                            {horas !== null && <span className="ml-1">({horas.toFixed(1)}h)</span>}
                          </span>
                          {totalReg > 0 && (
                            <span className="font-bold text-primary ml-auto">{formatKg(totalReg)} kg</span>
                          )}
                        </div>
                        {prodStr && <p className="text-xs font-mono text-muted-foreground">{prodStr}</p>}
                        {kgH !== null && (
                          <p className="text-xs text-muted-foreground/70">{formatKg(kgH)} kg/h</p>
                        )}
                      </div>
                    );
                  })}
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

            {/* 8. Paradas */}
            {paradas.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Paradas ({paradas.length})</h3>
                <div className="space-y-1.5">
                  {paradas.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{MOTIVOS[p.motivo] ?? p.motivo}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {format(new Date(p.data + "T12:00:00"), "dd/MM", { locale: ptBR })}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {fmtHora(p.hora_inicio)} – {fmtHora(p.hora_fim)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
