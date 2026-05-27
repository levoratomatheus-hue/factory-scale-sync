import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Wrench, Play, CheckCircle2, Clock, RefreshCw } from "lucide-react";

interface OS {
  id: string;
  equipamento_id: string | null;
  descricao_problema: string;
  prioridade: string;
  status: string;
  aberta_por: string | null;
  tecnico_id: string | null;
  tecnico_nome: string | null;
  solucao_aplicada: string | null;
  aberta_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  equipamentos?: { nome: string; tag: string | null; linha: number | null } | null;
}

interface PainelManutencaoProps {
  papel: string;
  perfilId: string;
  perfilNome: string;
}

const PRIORIDADE_CONFIG: Record<string, { label: string; class: string }> = {
  baixa:   { label: "Baixa",   class: "bg-slate-100 text-slate-600" },
  media:   { label: "Média",   class: "bg-blue-100 text-blue-700" },
  alta:    { label: "Alta",    class: "bg-amber-100 text-amber-700" },
  critica: { label: "Crítica", class: "bg-red-100 text-red-700 font-bold" },
};

const STATUS_TABS = [
  { value: "aberta",                label: "Aberta" },
  { value: "em_andamento",          label: "Em Andamento" },
  { value: "aguardando_aprovacao",  label: "Aguard. Aprovação" },
  { value: "concluida",             label: "Concluída" },
] as const;

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  aberta:               { label: "Aberta",             class: "bg-slate-100 text-slate-700" },
  em_andamento:         { label: "Em Andamento",        class: "bg-blue-100 text-blue-700" },
  aguardando_aprovacao: { label: "Aguard. Aprovação",   class: "bg-amber-100 text-amber-700" },
  concluida:            { label: "Concluída",           class: "bg-green-100 text-green-700" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export default function PainelManutencao({ papel, perfilId, perfilNome }: PainelManutencaoProps) {
  const [oss, setOss] = useState<OS[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabAtiva, setTabAtiva] = useState<string>("aberta");

  const [solucao_aplicadaDialogOS, setSolucaoDialogOS] = useState<OS | null>(null);
  const [solucao_aplicadaText, setSolucaoText] = useState("");
  const [savingSolucao, setSavingSolucao] = useState(false);

  const [confirmarConclusaoOS, setConfirmarConclusaoOS] = useState<OS | null>(null);
  const [savingConclusao, setSavingConclusao] = useState(false);

  const [iniciarConfirmOS, setIniciarConfirmOS] = useState<OS | null>(null);

  const fetchOss = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("ordens_servico")
      .select("*, equipamentos(nome, tag, linha)")
      .order("aberta_em", { ascending: false });
    if (!error) setOss(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOss();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("ordens-servico-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens_servico" }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => fetchOss(), 600);
      })
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [fetchOss]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    oss.forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; });
    return c;
  }, [oss]);

  const ossFiltradas = useMemo(
    () => oss.filter((o) => o.status === tabAtiva),
    [oss, tabAtiva],
  );

  async function iniciarOS(os: OS) {
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "em_andamento",
      tecnico_id: perfilId,
      tecnico_nome: perfilNome,
      iniciado_em: new Date().toISOString(),
    }).eq("id", os.id);
    if (error) toast({ title: "Erro ao iniciar OS", description: error.message, variant: "destructive" });
    else { toast({ title: "OS iniciada!" }); setIniciarConfirmOS(null); }
  }

  async function registrarSolucao() {
    if (!solucao_aplicadaDialogOS) return;
    if (!solucao_aplicadaText.trim()) {
      toast({ title: "Descreva a solução aplicada", variant: "destructive" });
      return;
    }
    setSavingSolucao(true);
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "aguardando_aprovacao",
      solucao_aplicada: solucao_aplicadaText.trim(),
    }).eq("id", solucao_aplicadaDialogOS.id);
    setSavingSolucao(false);
    if (error) toast({ title: "Erro ao registrar solução", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Solução registrada — aguardando aprovação do gestor" });
      setSolucaoDialogOS(null);
      setSolucaoText("");
    }
  }

  async function concluirOS(os: OS) {
    setSavingConclusao(true);
    const { error } = await (supabase as any).from("ordens_servico").update({
      status: "concluida",
      concluido_em: new Date().toISOString(),
    }).eq("id", os.id);
    setSavingConclusao(false);
    if (error) toast({ title: "Erro ao concluir OS", description: error.message, variant: "destructive" });
    else { toast({ title: "OS concluída!" }); setConfirmarConclusaoOS(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Painel de Manutenção</h2>
            <p className="text-sm text-muted-foreground">{oss.length} OS{oss.length !== 1 ? "s" : ""} no total</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOss} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(({ value, label }) => {
          const count = value === "todas" ? oss.length : (counts[value] ?? 0);
          return (
            <button
              key={value}
              onClick={() => setTabAtiva(value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tabAtiva === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  tabAtiva === value ? "bg-white/20" : "bg-background"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista de OS */}
      {ossFiltradas.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
          Nenhuma OS com status "{STATUS_TABS.find(t => t.value === tabAtiva)?.label}".
        </div>
      ) : (
        <div className="space-y-3">
          {ossFiltradas.map((os) => {
            const prio = PRIORIDADE_CONFIG[os.prioridade] ?? { label: os.prioridade, class: "bg-muted text-muted-foreground" };
            const st = STATUS_CONFIG[os.status] ?? { label: os.status, class: "bg-muted text-muted-foreground" };
            const equip = os.equipamentos;

            return (
              <div key={os.id} className="bg-card rounded-lg border p-4 space-y-3">
                {/* Topo */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-base">
                        {equip?.nome ?? "Equipamento removido"}
                      </span>
                      {equip?.tag && (
                        <span className="font-mono text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                          {equip.tag}
                        </span>
                      )}
                      {equip?.linha != null && (
                        <span className="text-xs text-muted-foreground">L{equip.linha}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2">{os.descricao_problema}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${prio.class}`}>
                      {prio.label}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${st.class}`}>
                      {st.label}
                    </span>
                  </div>
                </div>

                {/* Solução (se houver) */}
                {os.solucao_aplicada && (
                  <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm">
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Solução: </span>
                    {os.solucao_aplicada}
                  </div>
                )}

                {/* Metadados */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Aberta {fmtDate(os.aberta_em)} por {os.aberta_por ?? "—"}
                  </span>
                  {os.tecnico_nome && (
                    <span>· Técnico: <span className="font-medium text-foreground">{os.tecnico_nome}</span></span>
                  )}
                  {os.concluido_em && (
                    <span>· Concluída {fmtDate(os.concluido_em)}</span>
                  )}
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {/* Técnico: iniciar OS aberta */}
                  {(papel === "tecnico" || papel === "gestor") && os.status === "aberta" && (
                    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setIniciarConfirmOS(os)}>
                      <Play className="h-3 w-3" />
                      Iniciar
                    </Button>
                  )}

                  {/* Técnico: registrar solução */}
                  {(papel === "tecnico" || papel === "gestor") && os.status === "em_andamento" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => { setSolucaoDialogOS(os); setSolucaoText(os.solucao_aplicada ?? ""); }}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Registrar Solução
                    </Button>
                  )}

                  {/* Gestor: aprovar/concluir */}
                  {papel === "gestor" && os.status === "aguardando_aprovacao" && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setConfirmarConclusaoOS(os)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Aprovar e Concluir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Registrar Solução */}
      <Dialog open={!!solucao_aplicadaDialogOS} onOpenChange={(o) => { if (!o) setSolucaoDialogOS(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Solução</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {solucao_aplicadaDialogOS && (
              <p className="text-sm text-muted-foreground">
                {solucao_aplicadaDialogOS.equipamentos?.nome} — {solucao_aplicadaDialogOS.descricao_problema}
              </p>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Solução aplicada *</label>
              <textarea
                value={solucao_aplicadaText}
                onChange={(e) => setSolucaoText(e.target.value)}
                rows={4}
                placeholder="Descreva o que foi feito para resolver o problema..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSolucaoDialogOS(null)}>Cancelar</Button>
            <Button onClick={registrarSolucao} disabled={savingSolucao}>
              {savingSolucao && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar para Aprovação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Iniciar OS */}
      <AlertDialog open={!!iniciarConfirmOS} onOpenChange={(o) => { if (!o) setIniciarConfirmOS(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar atendimento</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que você vai iniciar o atendimento desta OS?
              Seu nome ficará registrado como técnico responsável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => iniciarConfirmOS && iniciarOS(iniciarConfirmOS)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: Concluir OS */}
      <AlertDialog open={!!confirmarConclusaoOS} onOpenChange={(o) => { if (!o) setConfirmarConclusaoOS(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar e concluir OS</AlertDialogTitle>
            <AlertDialogDescription>
              Confirma que a solução foi verificada e a OS pode ser marcada como concluída?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingConclusao}
              onClick={() => confirmarConclusaoOS && concluirOS(confirmarConclusaoOS)}
            >
              {savingConclusao && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Conclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
