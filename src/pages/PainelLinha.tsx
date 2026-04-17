import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFormula } from "@/hooks/useFormula";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Loader2, Factory, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
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

interface PainelLinhaProps {
  linha: number;
}

const today = new Date().toISOString().split("T")[0];
const fmtQtd = (n: number) => n.toFixed(3).replace(".", ",");

export default function PainelLinha({ linha }: PainelLinhaProps) {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [obsLinha, setObsLinha] = useState('');
  const iniciado = useRef(false);

  const linhaOrdens = ordens.filter((o) =>
    ["aguardando_linha", "em_linha"].includes(o.status)
  );
  const emLinha = linhaOrdens.find((o) => o.status === "em_linha");
  const emAberto = linhaOrdens.filter((o) => o.status === "aguardando_linha");
  const concluidasHoje = ordens.filter((o) => o.status === "concluido").length;
  const totalHoje = ordens.length;

  const { itens, loading: loadingFormula } = useFormula(
    emLinha?.formula_id ?? null,
    emLinha?.tamanho_batelada ?? null
  );

  // Reset registro ao trocar de ordem
  useEffect(() => {
    setObsLinha('');
  }, [emLinha?.id]);

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .eq("linha", linha)
      .eq("data_programacao", today)
      .in("status", ["aguardando_linha", "em_linha", "aguardando_liberacao", "concluido"])
      .order("posicao", { ascending: true, nullsFirst: false });
    if (data) setOrdens(data);
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

  const concluirOrdem = async (ordemId: string) => {
    const ordem = ordens.find((o) => o.id === ordemId);
    if (!ordem) return;

    await supabase
      .from("ordens")
      .update({ status: "aguardando_liberacao", obs_linha: obsLinha.trim() || null } as any)
      .eq("id", ordemId);

    await supabase.from("historico").insert({
      ordem_id: ordemId,
      status_anterior: "em_linha",
      status_novo: "aguardando_liberacao",
    });

    const next = linhaOrdens.find(
      (o) => o.status === "aguardando_linha" && o.id !== ordemId
    );
    if (next) {
      await supabase.from("ordens").update({ status: "em_linha" }).eq("id", next.id);
      await supabase.from("historico").insert({
        ordem_id: next.id,
        status_anterior: "aguardando_linha",
        status_novo: "em_linha",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      {/* Ordem atual em linha */}
      {emLinha ? (
        <div className="bg-card rounded-xl border-2 border-status-line/40 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Factory className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-muted-foreground shrink-0">Linha {linha}</span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <StatusBadge status="em_linha" />
            </div>
            <span className="text-sm text-muted-foreground shrink-0">Lote {emLinha.lote}</span>
          </div>

          <div className="text-xl font-bold leading-tight">{emLinha.produto}</div>

          <div className="text-4xl font-extrabold text-primary">
            {emLinha.quantidade}{" "}
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
                <span className="text-foreground font-bold">{emLinha.tamanho_batelada} kg</span> cada
              </span>
            </div>
          )}

          {emLinha.obs && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Observações</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{emLinha.obs}</p>
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
              <p className="text-sm font-medium text-muted-foreground">
                Fórmula: <span className="text-foreground">{emLinha.formula_id}</span>
                {emLinha.tamanho_batelada > 0 && (
                  <span className="ml-2">· Batelada: {emLinha.tamanho_batelada} kg</span>
                )}
              </p>
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
                        <td className="px-3 py-2 text-right font-bold text-lg">{fmtQtd(item.quantidade_kg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Registro de Produção</label>
            <p className="text-xs text-muted-foreground">Ex: 3x25,000 + 1x24,000</p>
            <textarea
              value={obsLinha}
              onChange={(e) => setObsLinha(e.target.value)}
              placeholder="Informe as quantidades produzidas..."
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {obsLinha.trim() && (
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
          )}

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir ordem</AlertDialogTitle>
                <AlertDialogDescription>
                  Deseja marcar esta ordem como concluída?
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
      ) : (
        <div className="bg-card rounded-xl border p-6 text-center text-muted-foreground">
          {emAberto.length === 0 && totalHoje > 0 ? (
            "Todas as ordens do dia foram concluídas!"
          ) : (
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
          )}
        </div>
      )}

      {/* Próximas ordens */}
      {emAberto.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Próximas ordens</h2>
          <div className="space-y-2">
            {emAberto.map((ordem, i) => (
              <div key={ordem.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground">
                    Lote {ordem.lote} · {ordem.quantidade} kg
                    {ordem.tamanho_batelada > 0 && (
                      <> · {Math.round(ordem.quantidade / ordem.tamanho_batelada)} bat.</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
