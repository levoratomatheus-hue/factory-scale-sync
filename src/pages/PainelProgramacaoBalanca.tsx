import { useState, useEffect, useCallback, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { GripVertical, Loader2, CalendarDays, Pencil, Trash2, AlertTriangle, CheckCircle2, ArrowRightLeft, Undo2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useFormula } from "@/hooks/useFormula";
import { formatKg, sortOrdens } from "@/lib/utils";
import { diasUteis } from "@/lib/diasUteis";
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
  data_emissao: string | null;
}

const FormulaDialog = memo(function FormulaDialog({
  ordem,
  onClose,
}: {
  ordem: Ordem | null;
  onClose: () => void;
}) {
  const { itens, loading } = useFormula(
    ordem?.formula_id ?? null,
    ordem?.tamanho_batelada ?? null
  );

  if (!ordem) return null;

  const nbateladas =
    ordem.tamanho_batelada && ordem.tamanho_batelada > 0
      ? Math.round(ordem.quantidade / ordem.tamanho_batelada)
      : null;

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
                <span className="font-semibold text-foreground">{nbateladas}</span>{" "}
                batelada{nbateladas !== 1 ? "s" : ""} de{" "}
                <span className="font-semibold text-foreground">{ordem.tamanho_batelada} kg</span>
              </>
            )}
          </p>
          {ordem.formula_id && (
            <p>Fórmula: <span className="font-medium text-foreground">{ordem.formula_id}</span></p>
          )}
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
});

function SortableCard({
  ordem,
  onReprogramarClick,
  onDblClick,
  onEditar,
  onExcluir,
  onAvancar,
  onMoverParaBalanca,
  onDevolverParaFila,
}: {
  ordem: Ordem;
  onReprogramarClick: (ordem: Ordem) => void;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
  onExcluir: (ordem: Ordem) => void;
  onAvancar: (ordem: Ordem) => void;
  onMoverParaBalanca: (ordem: Ordem, novaBalanca: number) => void;
  onDevolverParaFila: (ordem: Ordem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ordem.id });

  const du = ordem.data_emissao ? diasUteis(ordem.data_emissao, ordem.data_programacao) : 0;
  const atrasado = du > 7;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`bg-card border rounded-lg p-2.5 flex items-start gap-1.5 select-none ${atrasado ? "border-red-500" : ""}`}
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
        {atrasado && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0 leading-4">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            {du - 7} {du - 7 === 1 ? "dia" : "dias"} em atraso
          </span>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onEditar(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onExcluir(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-destructive shrink-0"
        title="Excluir"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onReprogramarClick(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
        title="Reprogramar"
      >
        <CalendarDays className="h-3.5 w-3.5" />
      </button>
      {ordem.status === 'em_pesagem' && (
        <button
          onClick={(e) => { e.stopPropagation(); onDevolverParaFila(ordem); }}
          className="mt-0.5 text-muted-foreground/50 hover:text-orange-500 shrink-0"
          title="Devolver para fila"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
      )}
      {ordem.balanca !== null && (
        <button
          onClick={(e) => { e.stopPropagation(); onMoverParaBalanca(ordem, ordem.balanca === 1 ? 2 : 1); }}
          className="mt-0.5 text-muted-foreground/50 hover:text-blue-600 shrink-0"
          title={`Mover para Balança ${ordem.balanca === 1 ? 2 : 1}`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onAvancar(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-green-600 shrink-0"
        title="Forçar Avanço"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BalancaColumn({
  balanca,
  ordens,
  onReprogramarClick,
  onDblClick,
  onEditar,
  onExcluir,
  onAvancar,
  onMoverParaBalanca,
  onDevolverParaFila,
}: {
  balanca: number;
  ordens: Ordem[];
  onReprogramarClick: (ordem: Ordem) => void;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
  onExcluir: (ordem: Ordem) => void;
  onAvancar: (ordem: Ordem) => void;
  onMoverParaBalanca: (ordem: Ordem, novaBalanca: number) => void;
  onDevolverParaFila: (ordem: Ordem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `balanca-${balanca}` });

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <div className="mb-2">
        <div className="bg-muted rounded-md py-1.5 px-2 flex items-center justify-between">
          <span className="text-xs font-bold">Balança {balanca}</span>
          <span className="text-xs text-muted-foreground">{ordens.length}</span>
        </div>
      </div>
      <SortableContext items={ordens.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 overflow-y-auto space-y-1.5 rounded-lg transition-colors ${isOver ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
          style={{ maxHeight: "calc(100vh - 200px)", minHeight: "200px" }}
        >
          {ordens.length === 0 ? (
            <div className="flex items-center justify-center h-20 rounded-lg border border-dashed text-xs text-muted-foreground">
              Sem ordens
            </div>
          ) : (
            ordens.map((ordem) => (
              <SortableCard
                key={ordem.id}
                ordem={ordem}
                onReprogramarClick={onReprogramarClick}
                onDblClick={onDblClick}
                onEditar={onEditar}
                onExcluir={onExcluir}
                onAvancar={onAvancar}
                onMoverParaBalanca={onMoverParaBalanca}
                onDevolverParaFila={onDevolverParaFila}
              />
            ))
          )}
        </div>
      </SortableContext>
      <div className="mt-2 border-t pt-2">
        <p className="text-xs font-semibold text-muted-foreground text-right">
          Total:{" "}
          <span className="text-foreground">
            {formatKg(ordens.reduce((acc, o) => acc + (Number(o.quantidade) || 0), 0))} kg
          </span>
        </p>
      </div>
    </div>
  );
}

const FIELDS =
  "id, produto, lote, quantidade, status, posicao, linha, balanca, formula_id, tamanho_batelada, obs, marca, requer_mistura, data_programacao, data_emissao";

export default function PainelProgramacaoBalanca() {
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordemFormula, setOrdemFormula] = useState<Ordem | null>(null);
  const [ordemEditando, setOrdemEditando] = useState<Ordem | null>(null);
  const [ordemParaExcluir, setOrdemParaExcluir] = useState<Ordem | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [ordemParaReprogramar, setOrdemParaReprogramar] = useState<Ordem | null>(null);
  const [novaDataReprogramar, setNovaDataReprogramar] = useState("");
  const [salvandoReprogramar, setSalvandoReprogramar] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchOrdens = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ordens")
      .select(FIELDS)
      .in("status", ["pendente", "em_pesagem"])
      .not("balanca", "is", null)
      .order("posicao", { ascending: true, nullsFirst: false });
    setOrdens((data as Ordem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrdens();
  }, []);

  const ordensParaBalanca = useCallback(
    (b: number) => sortOrdens(ordens.filter((o) => o.balanca === b)),
    [ordens]
  );

  const handleReorder = async (balanca: number, reordered: Ordem[]) => {
    const anterior = ordens;
    const comPosicao = reordered.map((o, i) => ({ ...o, posicao: i + 1 }));
    setOrdens((prev) => [
      ...prev.filter((o) => o.balanca !== balanca),
      ...comPosicao,
    ]);
    const results = await Promise.all(
      comPosicao.map((o) =>
        supabase.from("ordens").update({ posicao: o.posicao }).eq("id", o.id)
      )
    );
    if (results.some((r) => r.error)) {
      setOrdens(anterior);
      toast({ title: "Erro ao salvar sequência", description: "Tente novamente.", variant: "destructive" });
    }
  };

  const handleMoverBalanca = async (id: string, novaBalanca: number) => {
    const { count } = await supabase
      .from("ordens")
      .select("*", { count: "exact", head: true })
      .in("status", ["pendente", "em_pesagem"])
      .eq("balanca", novaBalanca)
      .neq("id", id);

    const novaPosicao = (count ?? 0) + 1;

    const { error } = await supabase
      .from("ordens")
      .update({ balanca: novaBalanca, posicao: novaPosicao } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao mover ordem", description: error.message, variant: "destructive" });
      return;
    }
    setOrdens((prev) =>
      prev.map((o) => o.id === id ? { ...o, balanca: novaBalanca, posicao: novaPosicao } : o)
    );
    toast({ title: `Ordem movida para Balança ${novaBalanca}` });
  };

  const handleReprogramar = async (id: string, novaData: string) => {
    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: novaData } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao reprogramar ordem", description: error.message, variant: "destructive" });
    } else {
      setOrdens((prev) => prev.map((o) => o.id === id ? { ...o, data_programacao: novaData } : o));
      toast({ title: "Ordem reprogramada com sucesso" });
    }
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

  const avancarStatus = async (ordem: Ordem) => {
    let novoStatus = "";

    if (ordem.status === "pendente") {
      novoStatus = "em_pesagem";
    } else if (ordem.status === "em_pesagem") {
      novoStatus = ordem.requer_mistura ? "aguardando_mistura" : "aguardando_linha";
    }

    if (!novoStatus) return;

    const { error } = await supabase
      .from("ordens")
      .update({ status: novoStatus } as any)
      .eq("id", ordem.id);

    if (!error) {
      await supabase.from("historico").insert({
        ordem_id: ordem.id,
        status_anterior: ordem.status,
        status_novo: novoStatus,
      });
      toast({ title: `Ordem avançada para ${novoStatus}` });
      fetchOrdens();
    } else {
      toast({ title: "Erro ao avançar status", description: error.message, variant: "destructive" });
    }
  };

  const devolverParaFila = async (ordem: Ordem) => {
    const { error } = await supabase.from("ordens").update({ status: "pendente" } as any).eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao devolver ordem", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "em_pesagem",
      status_novo: "pendente",
    });
    setOrdens((prev) => prev.map((o) => o.id === ordem.id ? { ...o, status: "pendente" } : o));
    toast({ title: "Ordem devolvida para a fila" });
  };

  const handleEditar = async (id: string, payload: Record<string, unknown>) => {
    const { error } = await supabase.from("ordens").update(payload as any).eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar ordem", description: error.message, variant: "destructive" });
      return;
    }
    await fetchOrdens();
    toast({ title: "Ordem atualizada com sucesso" });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeOrdem = ordens.find((o) => o.id === activeId);
    if (!activeOrdem) return;

    let targetBalanca: number;
    if (overId.startsWith("balanca-")) {
      targetBalanca = parseInt(overId.replace("balanca-", ""), 10);
    } else {
      const overOrdem = ordens.find((o) => o.id === overId);
      if (!overOrdem) return;
      targetBalanca = overOrdem.balanca!;
    }

    if (activeOrdem.balanca !== targetBalanca) {
      await handleMoverBalanca(activeId, targetBalanca);
    } else {
      if (activeId === overId) return;
      const colOrdens = ordensParaBalanca(activeOrdem.balanca!);
      const oldIndex = colOrdens.findIndex((o) => o.id === activeId);
      const newIndex = colOrdens.findIndex((o) => o.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        await handleReorder(activeOrdem.balanca!, arrayMove(colOrdens, oldIndex, newIndex));
      }
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-3 w-full pb-4">
            {[1, 2].map((b) => (
              <BalancaColumn
                key={b}
                balanca={b}
                ordens={ordensParaBalanca(b)}
                onReprogramarClick={(o) => { setOrdemParaReprogramar(o); setNovaDataReprogramar(""); }}
                onDblClick={setOrdemFormula}
                onEditar={setOrdemEditando}
                onExcluir={setOrdemParaExcluir}
                onAvancar={avancarStatus}
                onMoverParaBalanca={(o, nova) => handleMoverBalanca(o.id, nova)}
                onDevolverParaFila={devolverParaFila}
              />
            ))}
          </div>
        </DndContext>
      )}

      <Dialog
        open={!!ordemParaReprogramar}
        onOpenChange={(open) => { if (!open) { setOrdemParaReprogramar(null); setNovaDataReprogramar(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reprogramar OP</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaReprogramar?.produto}</span>
              <br />
              Selecione a nova data de programação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <label className="text-sm font-medium">Nova data</label>
            <input
              type="date"
              value={novaDataReprogramar}
              onChange={(e) => setNovaDataReprogramar(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaReprogramar(null)} disabled={salvandoReprogramar}>
              Cancelar
            </Button>
            <Button
              disabled={!novaDataReprogramar || salvandoReprogramar}
              onClick={async () => {
                if (!ordemParaReprogramar) return;
                setSalvandoReprogramar(true);
                await handleReprogramar(ordemParaReprogramar.id, novaDataReprogramar);
                setSalvandoReprogramar(false);
                setOrdemParaReprogramar(null);
                setNovaDataReprogramar("");
              }}
            >
              {salvandoReprogramar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormulaDialog ordem={ordemFormula} onClose={() => setOrdemFormula(null)} />

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

      <EditarOrdemDialog
        ordem={ordemEditando}
        onClose={() => setOrdemEditando(null)}
        onSave={handleEditar}
      />
    </div>
  );
}
