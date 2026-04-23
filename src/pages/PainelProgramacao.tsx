import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { GripVertical, Loader2, CalendarDays, ArrowRightLeft, Pencil, Trash2, Undo2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormula } from "@/hooks/useFormula";
import { formatKg, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { EditarOrdemDialog } from "@/components/EditarOrdemDialog";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Ordem {
  id: string;
  produto: string;
  lote: string;
  quantidade: number;
  status: string;
  posicao: number | null;
  linha: number;
  balanca: number | null;
  formula_id: string | null;
  tamanho_batelada: number | null;
  obs: string | null;
  marca: string | null;
  requer_mistura: boolean | null;
  data_programacao: string;
}


function FormulaDialog({
  ordem,
  onClose,
  onMoverLinha,
}: {
  ordem: Ordem | null;
  onClose: () => void;
  onMoverLinha: (ordemId: string, novaLinha: number) => Promise<void>;
}) {
  const { itens, loading } = useFormula(
    ordem?.formula_id ?? null,
    ordem?.tamanho_batelada ?? null
  );
  const [linhaEdit, setLinhaEdit] = useState<number>(ordem?.linha ?? 1);
  const [movendo, setMovendo] = useState(false);

  // Sync quando a ordem muda (abre outro card)
  useEffect(() => { if (ordem) setLinhaEdit(ordem.linha); }, [ordem?.id]);

  if (!ordem) return null;

  const nbateladas =
    ordem.tamanho_batelada && ordem.tamanho_batelada > 0
      ? Math.round(ordem.quantidade / ordem.tamanho_batelada)
      : null;

  const linhaAlterada = linhaEdit !== ordem.linha;

  return (
    <Dialog open={!!ordem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-baseline gap-3 flex-wrap">
            <DialogTitle className="leading-tight">{ordem.produto}</DialogTitle>
            <MarcaBadge marca={ordem.marca} />
          </div>
        </DialogHeader>

        <div className="text-sm text-muted-foreground space-y-0.5 mb-2">
          <p className="flex items-center gap-2 flex-wrap">
            Lote <span className="font-medium text-foreground">{ordem.lote}</span>
            <span className="mx-1">·</span>
            <StatusBadge status={ordem.status} />
          </p>
          <p>
            Quantidade total:{" "}
            <span className="font-semibold text-foreground">{formatKg(ordem.quantidade)} kg</span>
            {nbateladas && (
              <>
                <span className="mx-2">·</span>
                <span className="font-semibold text-foreground">{nbateladas}</span> batelada{nbateladas !== 1 ? "s" : ""} de{" "}
                <span className="font-semibold text-foreground">{ordem.tamanho_batelada} kg</span>
              </>
            )}
          </p>
          {ordem.formula_id && (
            <p>Fórmula: <span className="font-medium text-foreground">{ordem.formula_id}</span></p>
          )}
        </div>

        {/* Mover para linha */}
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5 mb-1">
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium shrink-0">Linha de destino:</span>
          <select
            value={linhaEdit}
            onChange={(e) => setLinhaEdit(Number(e.target.value))}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>Linha {l}{l === ordem.linha ? " (atual)" : ""}</option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!linhaAlterada || movendo}
            onClick={async () => {
              setMovendo(true);
              await onMoverLinha(ordem.id, linhaEdit);
              setMovendo(false);
              onClose();
            }}
          >
            {movendo ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {linhaAlterada ? `Mover → L${linhaEdit}` : "Mover"}
          </Button>
        </div>

        {ordem.obs && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Observações</p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{ordem.obs}</p>
          </div>
        )}

        {!ordem.formula_id ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem fórmula vinculada</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Fórmula sem itens cadastrados</p>
        ) : (
          <div className="overflow-y-auto flex-1 rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Seq</th>
                  <th className="text-left px-3 py-2">Matéria-Prima</th>
                  <th className="text-left px-3 py-2">Un</th>
                  <th className="text-right px-3 py-2">%</th>
                  <th className="text-right px-3 py-2">Qtd (kg)</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">{item.sequencia ?? "-"}</td>
                    <td className="px-3 py-2 font-medium">{item.materia_prima}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.unidade ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{item.percentual.toFixed(2).replace(".", ",")}%</td>
                    <td className="px-3 py-2 text-right font-bold">{formatKg(item.quantidade_kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SortableCard({
  ordem,
  onReprogramar,
  onDblClick,
  onEditar,
  onExcluir,
  onVoltarFila,
}: {
  ordem: Ordem;
  onReprogramar: (id: string, novaData: string) => Promise<void>;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
  onExcluir: (ordem: Ordem) => void;
  onVoltarFila: (ordem: Ordem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ordem.id });
  const [novaData, setNovaData] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="bg-card border rounded-lg p-2.5 flex items-start gap-1.5 select-none cursor-pointer"
      onDoubleClick={() => onDblClick(ordem)}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 space-y-1 overflow-hidden">
        <p className="text-xs font-semibold leading-tight break-words">{ordem.produto}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
          Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg
          <MarcaBadge marca={ordem.marca} size="sm" />
        </p>
        <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onEditar(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {ordem.status === "em_linha" && (
        <button
          onClick={(e) => { e.stopPropagation(); onVoltarFila(ordem); }}
          className="mt-0.5 text-muted-foreground/50 hover:text-amber-600 shrink-0"
          title="Voltar para Fila"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onExcluir(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-destructive shrink-0"
        title="Excluir"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
            title="Reprogramar"
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3 space-y-3" side="right" align="start">
          <p className="text-xs font-semibold">Mover para o dia:</p>
          <input
            type="date"
            value={novaData}
            onChange={(e) => setNovaData(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            size="sm"
            className="w-full"
            disabled={!novaData || salvando}
            onClick={async () => {
              setSalvando(true);
              await onReprogramar(ordem.id, novaData);
              setSalvando(false);
              setPopoverOpen(false);
              setNovaData("");
            }}
          >
            {salvando ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Confirmar
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LinhaColumn({
  linha,
  ordens,
  onReprogramar,
  onDblClick,
  onEditar,
  onExcluir,
  onVoltarFila,
}: {
  linha: number;
  ordens: Ordem[];
  onReprogramar: (id: string, novaData: string) => Promise<void>;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
  onExcluir: (ordem: Ordem) => void;
  onVoltarFila: (ordem: Ordem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `linha-${linha}` });

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="mb-2">
        <div className="bg-muted rounded-md py-1.5 px-2 flex items-center justify-between">
          <span className="text-xs font-bold">Linha {linha}</span>
          <span className="text-xs text-muted-foreground">{ordens.length}</span>
        </div>
      </div>
      <SortableContext
        items={ordens.map((o) => o.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`flex-1 overflow-y-auto space-y-1.5 rounded-lg transition-colors ${isOver ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
          style={{ maxHeight: "calc(100vh - 230px)", minHeight: "200px" }}
        >
          {ordens.length === 0 ? (
            <div className="flex items-center justify-center h-20 rounded-lg border border-dashed text-xs text-muted-foreground">
              Sem ordens
            </div>
          ) : (
            ordens.map((ordem) => (
              <SortableCard key={ordem.id} ordem={ordem} onReprogramar={onReprogramar} onDblClick={onDblClick} onEditar={onEditar} onExcluir={onExcluir} onVoltarFila={onVoltarFila} />
            ))
          )}
        </div>
      </SortableContext>
      <div className="mt-2 border-t pt-2">
        <p className="text-xs font-semibold text-muted-foreground text-right">
          Total:{" "}
          <span className="text-foreground">
            {formatKg(ordens.reduce((acc, o) => acc + (Number(o.quantidade) || 0), 0))}{" "}
            kg
          </span>
        </p>
      </div>
    </div>
  );
}

export default function PainelProgramacao() {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [data, setData] = useState(todayStr);
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordemFormula, setOrdemFormula] = useState<Ordem | null>(null);
  const [ordemEditando, setOrdemEditando] = useState<Ordem | null>(null);
  const [ordemParaExcluir, setOrdemParaExcluir] = useState<Ordem | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [ordemParaVoltar, setOrdemParaVoltar] = useState<Ordem | null>(null);
  const [voltando, setVoltando] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchOrdens = async (dataSel: string) => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("ordens")
      .select("id, produto, lote, quantidade, status, posicao, linha, balanca, formula_id, tamanho_batelada, obs, marca, requer_mistura, data_programacao")
      .eq("data_programacao", dataSel)
      .not("linha", "is", null)
      .order("posicao", { ascending: true, nullsFirst: false });
    setOrdens((rows as Ordem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrdens(data);
  }, [data]);

  const handleReorder = async (linha: number, reordered: Ordem[]) => {
    const anterior = ordens;

    // Atualiza posicao nos objetos para que ordensParaLinha não reverta a ordem
    const comPosicao = reordered.map((o, i) => ({ ...o, posicao: i + 1 }));

    setOrdens((prev) => [
      ...prev.filter((o) => o.linha !== linha),
      ...comPosicao,
    ]);

    const results = await Promise.all(
      comPosicao.map((o) =>
        supabase.from("ordens").update({ posicao: o.posicao }).eq("id", o.id)
      )
    );

    const falhou = results.some((r) => r.error);
    if (falhou) {
      setOrdens(anterior);
      toast({ title: "Erro ao salvar sequência", description: "Tente novamente.", variant: "destructive" });
    }
  };

  const handleReprogramar = async (id: string, novaData: string) => {
    const ordem = ordens.find((o) => o.id === id);
    if (!ordem) return;

    // Conta quantas OPs já existem no dia/linha de destino (excluindo a própria)
    // para atribuir posicao = count + 1, evitando conflito mesmo com posicao null
    const { count } = await supabase
      .from("ordens")
      .select("*", { count: "exact", head: true })
      .eq("data_programacao", novaData)
      .eq("linha", ordem.linha)
      .neq("id", id);

    const novaPosicao = (count ?? 0) + 1;

    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: novaData, posicao: novaPosicao } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao reprogramar ordem", description: error.message, variant: "destructive" });
    } else {
      setOrdens((prev) => prev.filter((o) => o.id !== id));
      toast({ title: "Ordem reprogramada com sucesso" });
    }
  };

  const handleMoverLinha = async (id: string, novaLinha: number) => {
    const { count } = await supabase
      .from("ordens")
      .select("*", { count: "exact", head: true })
      .eq("data_programacao", data)
      .eq("linha", novaLinha)
      .neq("id", id);

    const novaPosicao = (count ?? 0) + 1;

    const { error } = await supabase
      .from("ordens")
      .update({ linha: novaLinha, posicao: novaPosicao } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao mover ordem", description: error.message, variant: "destructive" });
      return;
    }

    setOrdens((prev) =>
      prev.map((o) => o.id === id ? { ...o, linha: novaLinha, posicao: novaPosicao } : o)
    );
    toast({ title: `Ordem movida para Linha ${novaLinha}` });
  };

  const handleExcluir = async () => {
    if (!ordemParaExcluir) return;
    setExcluindo(true);
    const { error } = await supabase.from("ordens").delete().eq("id", ordemParaExcluir.id);
    setExcluindo(false);
    setOrdemParaExcluir(null);
    if (error) {
      toast({ title: "Erro ao excluir ordem", description: error.message, variant: "destructive" });
    } else {
      setOrdens((prev) => prev.filter((o) => o.id !== ordemParaExcluir.id));
      toast({ title: "Ordem excluída com sucesso!" });
    }
  };

  const handleVoltarFila = async () => {
    if (!ordemParaVoltar) return;
    setVoltando(true);
    const { error } = await supabase
      .from("ordens")
      .update({ status: "aguardando_linha" } as any)
      .eq("id", ordemParaVoltar.id);
    if (!error) {
      await supabase.from("historico").insert({
        ordem_id: ordemParaVoltar.id,
        status_anterior: "em_linha",
        status_novo: "aguardando_linha",
      });
      setOrdens((prev) => prev.map((o) => o.id === ordemParaVoltar.id ? { ...o, status: "aguardando_linha" } : o));
      toast({ title: "Ordem voltou para a fila" });
    } else {
      toast({ title: "Erro ao voltar para fila", description: error.message, variant: "destructive" });
    }
    setVoltando(false);
    setOrdemParaVoltar(null);
  };

  const handleEditar = async (id: string, payload: Record<string, unknown>) => {
    const { error } = await supabase
      .from("ordens")
      .update(payload as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar ordem", description: error.message, variant: "destructive" });
      return;
    }
    await fetchOrdens(data);
    toast({ title: "Ordem atualizada com sucesso" });
  };

  const ordensParaLinha = (l: number) => sortOrdens(ordens.filter((o) => o.linha === l));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeOrdem = ordens.find((o) => o.id === activeId);
    if (!activeOrdem) return;

    // Determine target linha — over can be a column droppable ("linha-N") or a card id
    let targetLinha: number;
    if (overId.startsWith("linha-")) {
      targetLinha = parseInt(overId.replace("linha-", ""), 10);
    } else {
      const overOrdem = ordens.find((o) => o.id === overId);
      if (!overOrdem) return;
      targetLinha = overOrdem.linha;
    }

    if (activeOrdem.linha !== targetLinha) {
      if (["aguardando_liberacao", "concluido"].includes(activeOrdem.status)) {
        toast({ title: "Não é possível mover esta OP pois já foi produzida.", variant: "destructive" });
        return;
      }
      // Cross-column drop → move to target linha
      await handleMoverLinha(activeId, targetLinha);
    } else {
      // Same column → reorder
      if (activeId === overId) return;
      const colOrdens = ordensParaLinha(activeOrdem.linha);
      const oldIndex = colOrdens.findIndex((o) => o.id === activeId);
      const newIndex = colOrdens.findIndex((o) => o.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        await handleReorder(activeOrdem.linha, arrayMove(colOrdens, oldIndex, newIndex));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Data:</label>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-5 gap-3 w-full pb-4">
            {[1, 2, 3, 4, 5].map((l) => (
              <LinhaColumn
                key={l}
                linha={l}
                ordens={ordensParaLinha(l)}
                onReprogramar={handleReprogramar}
                onDblClick={setOrdemFormula}
                onEditar={setOrdemEditando}
                onExcluir={setOrdemParaExcluir}
                onVoltarFila={setOrdemParaVoltar}
              />
            ))}
          </div>
        </DndContext>
      )}

      <FormulaDialog ordem={ordemFormula} onClose={() => setOrdemFormula(null)} onMoverLinha={handleMoverLinha} />

      <Dialog open={!!ordemParaVoltar} onOpenChange={(open) => !open && setOrdemParaVoltar(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Voltar para a fila?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaVoltar?.produto}</span>
              <br />
              O status voltará de <strong>Em Linha</strong> para <strong>Aguardando Linha</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaVoltar(null)} disabled={voltando}>
              Cancelar
            </Button>
            <Button onClick={handleVoltarFila} disabled={voltando}>
              {voltando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ordemParaExcluir} onOpenChange={(open) => !open && setOrdemParaExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir ordem de produção?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaExcluir?.produto}</span>
              <br />
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaExcluir(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleExcluir} disabled={excluindo}>
              {excluindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
