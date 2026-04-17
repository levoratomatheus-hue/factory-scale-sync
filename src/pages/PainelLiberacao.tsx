import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function PainelLiberacao() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liberarOrdem, setLiberarOrdem] = useState<any | null>(null);
  const [reprovarOrdem, setReprovarOrdem] = useState<any | null>(null);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .eq("status", "aguardando_liberacao")
      .order("posicao", { ascending: true, nullsFirst: false });
    if (data) setOrdens(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrdens();
    const channel = supabase
      .channel("liberacao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, fetchOrdens)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const liberar = async (ordem: any) => {
    await supabase
      .from("ordens")
      .update({ status: "concluido", data_conclusao: new Date().toISOString() })
      .eq("id", ordem.id);
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_liberacao",
      status_novo: "concluido",
    });
  };

  const reprovar = async (ordem: any) => {
    await supabase
      .from("ordens")
      .update({ status: "em_linha", obs: motivoReprovacao.trim() || null } as any)
      .eq("id", ordem.id);
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_liberacao",
      status_novo: "em_linha",
    });
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
          {ordens.map((ordem) => (
            <div key={ordem.id} className="bg-card rounded-xl border-2 border-orange-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StatusBadge status="aguardando_liberacao" />
                  <span className="text-sm text-muted-foreground shrink-0">Linha {ordem.linha}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-sm text-muted-foreground shrink-0">Lote {ordem.lote}</span>
                </div>
                <span className="text-sm font-semibold text-muted-foreground shrink-0">
                  {ordem.quantidade} kg
                </span>
              </div>

              <div className="text-lg font-bold leading-tight">{ordem.produto}</div>

              {ordem.obs_linha && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Registro de Produção</p>
                  <p className="text-sm text-blue-900 whitespace-pre-wrap">{ordem.obs_linha}</p>
                </div>
              )}

              {ordem.obs && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Observações</p>
                  <p className="text-sm text-amber-900 whitespace-pre-wrap">{ordem.obs}</p>
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
          ))}
        </div>
      )}

      {/* Dialog — Liberar */}
      <AlertDialog open={!!liberarOrdem} onOpenChange={(open) => !open && setLiberarOrdem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar ordem</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma a liberação de <strong>{liberarOrdem?.produto}</strong> (Lote {liberarOrdem?.lote})?
              O status será marcado como <strong>Concluído</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await liberar(liberarOrdem); setLiberarOrdem(null); }}>
              Confirmar
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
              A ordem <strong>{reprovarOrdem?.produto}</strong> (Lote {reprovarOrdem?.lote}) voltará para
              <strong> Em Linha</strong> para retrabalho.
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
