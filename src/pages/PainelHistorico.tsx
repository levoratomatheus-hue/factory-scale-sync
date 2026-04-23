import { useState, useEffect } from "react";
import { useHistorico } from "@/hooks/useOrdens";
import { StatusBadge } from "@/components/StatusBadge";
import { MarcaBadge } from "@/components/MarcaBadge";
import { Loader2, History, Pencil, Eye, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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

function fmtHora(h: string | null) {
  return h ? String(h).slice(0, 5) : "—";
}

function DetalheOrdemDialog({ ordem, onClose }: { ordem: any | null; onClose: () => void }) {
  const [hist, setHist] = useState<any[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [paradas, setParadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ordem) return;
    setLoading(true);
    setHist([]); setRegistros([]); setParadas([]);

    const dateFim = ordem.data_conclusao?.slice(0, 10) ?? ordem.data_programacao;

    Promise.all([
      supabase.from("historico").select("*").eq("ordem_id", ordem.id).order("alterado_em", { ascending: true }),
      (supabase as any).from("registros_diarios").select("*").eq("ordem_id", ordem.id).order("data", { ascending: true }),
      supabase.from("paradas").select("*").eq("linha", ordem.linha).gte("data", ordem.data_programacao).lte("data", dateFim).order("data", { ascending: true }),
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
    return sum + items.reduce((s: number, i: any) => s + ((i.qty || 0) * (i.peso || 0)), 0);
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

            {/* ── 1. Dados da OP ── */}
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
                <div><span className="text-muted-foreground">Balança:</span> <span className="font-medium">B{ordem.balanca}</span></div>
                <div><span className="text-muted-foreground">Data:</span> <span className="font-medium">{format(new Date(ordem.data_programacao + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span></div>
                <div className="flex items-center gap-1"><span className="text-muted-foreground">Status:</span> <StatusBadge status={ordem.status} /></div>
              </div>
            </section>

            {/* ── 2. Quantidade real vs programada ── */}
            {totalProduzido > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Produção Total (registros)</h3>
                <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <div><span className="text-muted-foreground">Programado:</span> <span className="font-semibold">{formatKg(ordem.quantidade)} kg</span></div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div><span className="text-muted-foreground">Produzido:</span> <span className="font-bold text-primary">{formatKg(totalProduzido)} kg</span></div>
                  {totalProduzido > 0 && ordem.quantidade > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Math.round((totalProduzido / ordem.quantidade) * 100)}%
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* ── 3. Adições para mistura ── */}
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

            {/* ── 4. Obs linha ── */}
            {ordem.obs_linha && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações da Linha</h3>
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{ordem.obs_linha}</p>
              </section>
            )}

            {/* ── 5. Reprovações ── */}
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

            {/* ── 6. Timeline de status ── */}
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

            {/* ── 7. Registros diários ── */}
            {registros.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Registros de Produção</h3>
                <div className="space-y-2">
                  {registros.map((r: any) => {
                    const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
                    const prodStr = items.filter((i) => i.qty || i.peso)
                      .map((i) => `${i.qty}× ${formatKg(i.peso)} kg`)
                      .join(" / ");
                    const totalReg = items.reduce((s, i) => s + (i.qty || 0) * (i.peso || 0), 0);
                    const horas = parseHoras(r.hora_inicio, r.hora_fim);
                    const kgH = horas && horas > 0 && totalReg > 0 ? totalReg / horas : null;
                    return (
                      <div key={r.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm space-y-0.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold">{format(new Date(r.data + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {fmtHora(r.hora_inicio)} – {fmtHora(r.hora_fim)}
                            {horas !== null && <span className="ml-1">({horas.toFixed(1)}h)</span>}
                          </span>
                          {totalReg > 0 && <span className="font-bold text-primary ml-auto">{formatKg(totalReg)} kg</span>}
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
            )}

            {/* ── 8. Paradas ── */}
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
                      <span className="font-mono text-xs text-muted-foreground">{fmtHora(p.hora_inicio)} – {fmtHora(p.hora_fim)}</span>
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

type Modo = "dia" | "periodo";

export default function PainelHistorico() {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(todayStr);
  const [dataInicio, setDataInicio] = useState(todayStr);
  const [dataFim, setDataFim] = useState(todayStr);

  const filtroInicio = modo === "dia" ? dia : dataInicio;
  const filtroFim = modo === "dia" ? dia : dataFim;

  const { ordens, loading } = useHistorico(filtroInicio, filtroFim);

  // Local overrides applied after edits (avoids re-fetching the whole list)
  const [overrides, setOverrides] = useState<Record<string, Partial<{ hora_inicio: string | null; hora_fim: string | null; quantidade_real: number | null }>>>({});

  const [ordemDetalhe, setOrdemDetalhe] = useState<any | null>(null);
  const [editandoOrdem, setEditandoOrdem] = useState<any | null>(null);
  const [editHoraInicio, setEditHoraInicio] = useState("");
  const [editHoraFim, setEditHoraFim] = useState("");
  const [editQtdReal, setEditQtdReal] = useState("");
  const [saving, setSaving] = useState(false);

  const abrirEdicao = (ordem: any) => {
    const ov = overrides[ordem.id] ?? {};
    const hi = "hora_inicio" in ov ? ov.hora_inicio : ordem.hora_inicio;
    const hf = "hora_fim" in ov ? ov.hora_fim : ordem.hora_fim;
    const qr = "quantidade_real" in ov ? ov.quantidade_real : ordem.quantidade_real;
    setEditHoraInicio(hi?.slice(0, 5) ?? "");
    setEditHoraFim(hf?.slice(0, 5) ?? "");
    setEditQtdReal(qr != null ? String(qr).replace(".", ",") : "");
    setEditandoOrdem(ordem);
  };

  const salvarEdicao = async () => {
    if (!editandoOrdem) return;
    setSaving(true);
    const qtd = parseFloat(editQtdReal.replace(",", "."));
    const { error } = await supabase
      .from("ordens")
      .update({
        hora_inicio: editHoraInicio || null,
        hora_fim: editHoraFim || null,
        ...(isNaN(qtd) ? {} : { quantidade_real: qtd }),
      } as any)
      .eq("id", editandoOrdem.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    setOverrides((prev) => ({
      ...prev,
      [editandoOrdem.id]: {
        hora_inicio: editHoraInicio || null,
        hora_fim: editHoraFim || null,
        quantidade_real: isNaN(qtd) ? null : qtd,
      },
    }));
    toast({ title: "Ordem atualizada com sucesso!" });
    setEditandoOrdem(null);
  };

  const descricaoFiltro =
    modo === "dia"
      ? `em ${format(new Date(dia + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}`
      : dataInicio === dataFim
      ? `em ${format(new Date(dataInicio + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}`
      : `de ${format(new Date(dataInicio + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })} até ${format(new Date(dataFim + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <History className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h2 className="text-xl font-bold">Histórico de Ordens</h2>
          <p className="text-sm text-muted-foreground">
            {ordens.length} ordem{ordens.length !== 1 ? "s" : ""} concluída{ordens.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-md border border-input overflow-hidden text-sm">
            <button
              onClick={() => setModo("dia")}
              className={`px-3 py-1.5 transition-colors ${
                modo === "dia"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Dia específico
            </button>
            <button
              onClick={() => setModo("periodo")}
              className={`px-3 py-1.5 transition-colors border-l border-input ${
                modo === "periodo"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Período
            </button>
          </div>

          {modo === "dia" ? (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Data:</label>
              <input
                type="date"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm font-medium text-muted-foreground">De:</label>
              <input
                type="date"
                value={dataInicio}
                max={dataFim}
                onChange={(e) => setDataInicio(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <label className="text-sm font-medium text-muted-foreground">Até:</label>
              <input
                type="date"
                value={dataFim}
                min={dataInicio}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold">#</th>
              <th className="px-4 py-3 text-left font-semibold">Lote</th>
              <th className="px-4 py-3 text-left font-semibold">Produto</th>
              <th className="px-4 py-3 text-left font-semibold">Qtd Prog.</th>
              <th className="px-4 py-3 text-left font-semibold">Qtd Real</th>
              <th className="px-4 py-3 text-left font-semibold">Horário</th>
              <th className="px-4 py-3 text-left font-semibold">Linha</th>
              <th className="px-4 py-3 text-left font-semibold">Balança</th>
              <th className="px-4 py-3 text-left font-semibold">Data</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ordens.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma ordem concluída {descricaoFiltro}
                </td>
              </tr>
            )}
            {ordens.map((ordem) => {
              const ov = overrides[ordem.id] ?? {};
              const horaInicio = ("hora_inicio" in ov ? ov.hora_inicio : ordem.hora_inicio)?.slice(0, 5) ?? null;
              const horaFim = ("hora_fim" in ov ? ov.hora_fim : ordem.hora_fim)?.slice(0, 5) ?? null;
              const qtdReal = "quantidade_real" in ov ? ov.quantidade_real : ordem.quantidade_real;
              return (
                <tr
                  key={ordem.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setOrdemDetalhe(ordem)}
                >
                  <td className="px-4 py-3 font-mono text-muted-foreground">{ordem.id.slice(0, 6)}</td>
                  <td className="px-4 py-3 font-medium">{ordem.lote}</td>
                  <td className="px-4 py-3">{ordem.produto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{ordem.quantidade} kg</td>
                  <td className="px-4 py-3 font-semibold">
                    {qtdReal != null ? `${qtdReal} kg` : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {horaInicio && horaFim ? `${horaInicio} – ${horaFim}` : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3">L{ordem.linha}</td>
                  <td className="px-4 py-3">B{ordem.balanca}</td>
                  <td className="px-4 py-3">
                    {format(new Date(ordem.data_programacao), "dd/MM/yyyy", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ordem.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setOrdemDetalhe(ordem); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); abrirEdicao(ordem); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DetalheOrdemDialog ordem={ordemDetalhe} onClose={() => setOrdemDetalhe(null)} />

      {/* Modal de edição */}
      <Dialog open={!!editandoOrdem} onOpenChange={(open) => !open && setEditandoOrdem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar OP</DialogTitle>
            {editandoOrdem && (
              <p className="text-sm text-muted-foreground">
                Lote {editandoOrdem.lote} · {editandoOrdem.produto}
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Hora Início</label>
                <Input
                  type="time"
                  value={editHoraInicio}
                  onChange={(e) => setEditHoraInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Hora Fim</label>
                <Input
                  type="time"
                  value={editHoraFim}
                  onChange={(e) => setEditHoraFim(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Quantidade Real (kg)</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,000"
                value={editQtdReal}
                onChange={(e) => setEditQtdReal(e.target.value.replace(/[^0-9,]/g, ""))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoOrdem(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
