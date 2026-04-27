import { useState } from "react";
import { useHistorico } from "@/hooks/useOrdens";
import { StatusBadge } from "@/components/StatusBadge";
import { MarcaBadge } from "@/components/MarcaBadge";
import { Loader2, History, Pencil, Eye } from "lucide-react";
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
import { formatKg } from "@/lib/utils";
import { DetalheOrdemDialog } from "@/components/DetalheOrdemDialog";

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
