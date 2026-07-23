import { useState, useMemo, useEffect } from "react";
import { useHistorico } from "@/hooks/useOrdens";
import { StatusBadge } from "@/components/StatusBadge";
import { MarcaBadge } from "@/components/MarcaBadge";
import { Loader2, History, Pencil, Eye, RotateCcw, FlaskConical, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DetalheOrdemDialog } from "@/components/DetalheOrdemDialog";
import { EditarRegistrosDiariosModal } from "@/components/EditarRegistrosDiariosModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function LabDialog({ ordem, onClose, onSalvo }: {
  ordem: any;
  onClose: () => void;
  onSalvo: (id: string, obsOp: string) => void;
}) {
  const [textoOP, setTextoOP] = useState(ordem.obs_laboratorio ?? "");
  const [textoFixo, setTextoFixo] = useState("");
  const [loadingFixo, setLoadingFixo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!ordem.formula_id) return;
    setLoadingFixo(true);
    (supabase as any)
      .from("inf_lab_fixa")
      .select("texto")
      .eq("formula_id", ordem.formula_id)
      .maybeSingle()
      .then(({ data }: { data: { texto: string } | null }) => {
        setTextoFixo(data?.texto ?? "");
        setLoadingFixo(false);
      });
  }, [ordem.formula_id]);

  async function salvar() {
    setSalvando(true);
    const ops: Promise<any>[] = [
      supabase.from("ordens").update({ obs_laboratorio: textoOP } as any).eq("id", ordem.id),
    ];
    if (ordem.formula_id) {
      ops.push(
        (supabase as any).from("inf_lab_fixa").upsert(
          { formula_id: ordem.formula_id, texto: textoFixo, atualizado_em: new Date().toISOString() },
          { onConflict: "formula_id" }
        )
      );
    }
    const results = await Promise.all(ops);
    setSalvando(false);
    if (results.some((r) => r.error)) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }
    onSalvo(ordem.id, textoOP);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-violet-500" />
            Informações de Laboratório
          </DialogTitle>
          <DialogDescription className="text-xs">{ordem.produto} · Lote {ordem.lote}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inf Lab OP</label>
            <p className="text-xs text-muted-foreground">Exclusiva desta OP.</p>
            <textarea
              className="w-full rounded-md border bg-muted/30 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={textoOP}
              onChange={(e) => setTextoOP(e.target.value)}
              placeholder="Anotações específicas desta OP..."
              autoFocus
            />
          </div>
          {ordem.formula_id && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Inf Lab Fixa</label>
              <p className="text-xs text-muted-foreground">
                Vale para todas as OPs com fórmula <span className="font-medium text-foreground">{ordem.formula_id}</span>.
              </p>
              {loadingFixo ? (
                <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : (
                <textarea
                  className="w-full rounded-md border border-violet-200 bg-violet-50/50 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                  rows={3}
                  value={textoFixo}
                  onChange={(e) => setTextoFixo(e.target.value)}
                  placeholder="Informação fixa para esta fórmula..."
                />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Modo = "dia" | "periodo";

export default function PainelHistorico() {
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(todayStr);
  const [dataInicio, setDataInicio] = useState(todayStr);
  const [dataFim, setDataFim] = useState(todayStr);

  const filtroInicio = modo === "dia" ? dia : dataInicio;
  const filtroFim = modo === "dia" ? dia : dataFim;

  const { ordens, loading } = useHistorico(filtroInicio, filtroFim);

  // Local overrides aplicados após edição (evita re-fetch da lista)
  const [overrides, setOverrides] = useState<Record<string, Partial<{ quantidade_real: number | null }>>>({});

  const [ordemDetalhe, setOrdemDetalhe] = useState<any | null>(null);
  const [editandoRegistrosOrdem, setEditandoRegistrosOrdem] = useState<any | null>(null);

  const [reabrindo, setReabrindo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordemLab, setOrdemLab] = useState<any | null>(null);
  // Atualiza obs_laboratorio localmente após salvar no dialog de lab
  const [labOverrides, setLabOverrides] = useState<Record<string, string>>({});

  async function handleReabrir(ordem: any, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = window.confirm(`Reabrir a OP ${ordem.lote} — ${ordem.produto}?\nO status voltará para "Aguardando Liberação" e a data de conclusão será removida.`);
    if (!ok) return;
    setReabrindo(ordem.id);
    const { error } = await (supabase as any)
      .from("ordens")
      .update({ status: "aguardando_liberacao", data_conclusao: null })
      .eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao reabrir OP", description: error.message, variant: "destructive" });
      setReabrindo(null);
      return;
    }
    await (supabase as any).from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "concluido",
      status_novo: "aguardando_liberacao",
    });
    toast({ title: `OP ${ordem.lote} reaberta`, description: "Status voltou para Aguardando Liberação." });
    setReabrindo(null);
  }

  const handleRegistroSalvo = (ordemId: string, novaQtdReal: number) => {
    setOverrides((prev) => ({
      ...prev,
      [ordemId]: { quantidade_real: novaQtdReal },
    }));
  };

  const ordensFiltradas = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return ordens;
    return ordens.filter((o) =>
      o.produto.toLowerCase().includes(termo) ||
      o.lote.toLowerCase().includes(termo)
    );
  }, [ordens, busca]);

  const totalQuantidade = useMemo(
    () => ordensFiltradas.reduce((s, o) => s + (o.quantidade || 0), 0),
    [ordensFiltradas],
  );

  const totalReal = useMemo(
    () => ordensFiltradas.reduce((s, o) => {
      const ov = overrides[o.id] ?? {};
      const qtdReal = "quantidade_real" in ov ? ov.quantidade_real : o.quantidade_real;
      return s + (qtdReal ?? 0);
    }, 0),
    [ordensFiltradas, overrides],
  );

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
          <h2 className="text-xl font-bold dark:text-white">Histórico de Ordens</h2>
          <p className="text-sm text-muted-foreground">
            {ordensFiltradas.length}{busca ? ` de ${ordens.length}` : ""} ordem{ordens.length !== 1 ? "s" : ""} concluída{ordens.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-md border border-input dark:border-gray-700 overflow-hidden text-sm">
            <button
              onClick={() => setModo("dia")}
              className={`px-3 py-1.5 transition-colors ${
                modo === "dia"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background dark:bg-gray-800 text-muted-foreground dark:text-gray-400 hover:bg-muted"
              }`}
            >
              Dia específico
            </button>
            <button
              onClick={() => setModo("periodo")}
              className={`px-3 py-1.5 transition-colors border-l border-input dark:border-gray-700 ${
                modo === "periodo"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background dark:bg-gray-800 text-muted-foreground dark:text-gray-400 hover:bg-muted"
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
                className="rounded-md border border-input dark:border-gray-600 bg-background dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="rounded-md border border-input dark:border-gray-600 bg-background dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <label className="text-sm font-medium text-muted-foreground">Até:</label>
              <input
                type="date"
                value={dataFim}
                min={dataInicio}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded-md border border-input dark:border-gray-600 bg-background dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código ou nome do material..."
          className="w-full rounded-md border border-input dark:border-gray-600 bg-background dark:bg-gray-800 dark:text-white pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-lg border dark:border-gray-700 bg-card dark:bg-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b dark:border-gray-700 bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">#</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Lote</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Produto</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Qtd Prog.</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Qtd Real</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Horário</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Linha</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Balança</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Data</th>
              <th className="px-4 py-3 text-left font-semibold dark:text-gray-300">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ordensFiltradas.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                  {ordens.length === 0
                    ? `Nenhuma ordem concluída ${descricaoFiltro}`
                    : "Nenhuma ordem encontrada para a busca aplicada."}
                </td>
              </tr>
            )}
            {ordensFiltradas.map((ordem) => {
              const ov = overrides[ordem.id] ?? {};
              const horaInicio = ordem.hora_inicio?.slice(0, 5) ?? null;
              const horaFim = ordem.hora_fim?.slice(0, 5) ?? null;
              const qtdReal = "quantidade_real" in ov ? ov.quantidade_real : ordem.quantidade_real;
              return (
                <tr
                  key={ordem.id}
                  className="border-b dark:border-gray-700 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setOrdemDetalhe(ordem)}
                >
                  <td className="px-4 py-3 font-mono text-muted-foreground dark:text-gray-400">{ordem.id.slice(0, 6)}</td>
                  <td className="px-4 py-3 font-medium dark:text-gray-300">{ordem.lote}</td>
                  <td className="px-4 py-3 dark:text-gray-300">{ordem.produto}</td>
                  <td className="px-4 py-3 text-muted-foreground dark:text-gray-400">{ordem.quantidade} kg</td>
                  <td className="px-4 py-3 font-semibold">
                    {qtdReal != null ? `${qtdReal} kg` : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {horaInicio && horaFim ? `${horaInicio} – ${horaFim}` : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-3 dark:text-gray-300">L{ordem.linha}</td>
                  <td className="px-4 py-3 dark:text-gray-300">B{ordem.balanca}</td>
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
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setEditandoRegistrosOrdem(ordem); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 w-7 p-0 ${(labOverrides[ordem.id] ?? ordem.obs_laboratorio) ? "text-violet-500 hover:text-violet-600" : "text-muted-foreground/40 hover:text-violet-500"}`}
                        title="Inf Lab OP / Inf Lab Fixa"
                        onClick={(e) => { e.stopPropagation(); setOrdemLab({ ...ordem, obs_laboratorio: labOverrides[ordem.id] ?? ordem.obs_laboratorio }); }}
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                      </Button>
                      {ordem.status === "concluido" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                          disabled={reabrindo === ordem.id}
                          onClick={(e) => handleReabrir(ordem, e)}
                          title="Reabrir OP"
                        >
                          {reabrindo === ordem.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {ordens.length > 0 && (
            <tfoot>
              <tr className="border-t-2 dark:border-gray-700 bg-muted/70 font-semibold text-sm">
                <td colSpan={3} className="px-4 py-3 text-right text-muted-foreground dark:text-gray-400">Total</td>
                <td className="px-4 py-3">
                  {totalQuantidade.toLocaleString("pt-BR")} kg
                </td>
                <td className="px-4 py-3">
                  {totalReal > 0 ? `${totalReal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—"}
                </td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <DetalheOrdemDialog ordem={ordemDetalhe} onClose={() => setOrdemDetalhe(null)} />

      {ordemLab && (
        <LabDialog
          ordem={ordemLab}
          onClose={() => setOrdemLab(null)}
          onSalvo={(id, obsOp) => {
            setLabOverrides((prev) => ({ ...prev, [id]: obsOp }));
            setOrdemLab(null);
          }}
        />
      )}

      <EditarRegistrosDiariosModal
        ordem={editandoRegistrosOrdem}
        onClose={() => setEditandoRegistrosOrdem(null)}
        onSaved={handleRegistroSalvo}
      />
    </div>
  );
}
