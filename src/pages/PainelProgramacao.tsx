import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { GripVertical, Loader2, CalendarDays, ArrowRightLeft, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormula } from "@/hooks/useFormula";
import { formatKg, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
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

const EDITAVEIS = new Set(["pendente", "aguardando_linha"]);

function parseObsItemsEdit(obs: string | null): { qty: string; mp: string }[] {
  const vazio = Array.from({ length: 4 }, () => ({ qty: "", mp: "" }));
  if (!obs) return vazio;
  try {
    const parsed = JSON.parse(obs);
    if (Array.isArray(parsed)) {
      const filled = parsed.map((i: any) => ({ qty: String(i.qty ?? ""), mp: String(i.mp ?? "") }));
      while (filled.length < 4) filled.push({ qty: "", mp: "" });
      return filled.slice(0, 4);
    }
  } catch { /* não é JSON */ }
  return vazio;
}

function EditarOrdemDialog({
  ordem,
  onClose,
  onSalvar,
}: {
  ordem: Ordem | null;
  onClose: () => void;
  onSalvar: (id: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [quantidade, setQuantidade] = useState("");
  const [tamanhoBatelada, setTamanhoBatelada] = useState("");
  const [linha, setLinha] = useState("");
  const [balanca, setBalanca] = useState("");
  const [dataProg, setDataProg] = useState("");
  const [requerMistura, setRequerMistura] = useState(true);
  const [marca, setMarca] = useState("");
  const [obsItems, setObsItems] = useState(Array.from({ length: 4 }, () => ({ qty: "", mp: "" })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ordem) return;
    setQuantidade(String(ordem.quantidade ?? ""));
    setTamanhoBatelada(ordem.tamanho_batelada ? String(ordem.tamanho_batelada) : "");
    setLinha(String(ordem.linha ?? ""));
    setBalanca(ordem.balanca ? String(ordem.balanca) : "");
    setDataProg(ordem.data_programacao ?? "");
    setRequerMistura(ordem.requer_mistura !== false);
    setMarca(ordem.marca ?? "");
    setObsItems(parseObsItemsEdit(ordem.obs));
  }, [ordem?.id]);

  if (!ordem) return null;

  const handleSalvar = async () => {
    const qtd = parseFloat(quantidade.replace(",", "."));
    if (isNaN(qtd) || qtd <= 0) {
      toast({ title: "Informe uma quantidade válida", variant: "destructive" });
      return;
    }
    if (!linha) {
      toast({ title: "Selecione a linha", variant: "destructive" });
      return;
    }
    if (!marca) {
      toast({ title: "Selecione a marca", variant: "destructive" });
      return;
    }

    const filledObs = obsItems.filter((r) => r.mp.trim() || r.qty.trim());
    const obsJson = filledObs.length > 0
      ? JSON.stringify(filledObs.map((r) => ({ qty: parseInt(r.qty) || 0, mp: r.mp.trim() })))
      : null;

    setSaving(true);
    await onSalvar(ordem.id, {
      quantidade: qtd,
      tamanho_batelada: tamanhoBatelada ? parseFloat(tamanhoBatelada) : null,
      linha: parseInt(linha),
      balanca: balanca ? parseInt(balanca) : null,
      data_programacao: dataProg,
      requer_mistura: requerMistura,
      marca: marca || null,
      obs: obsJson,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={!!ordem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="leading-tight">
            Editar OP — Lote {ordem.lote}
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{ordem.produto}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quantidade */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quantidade (kg)</label>
            <input
              type="number"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Tamanho de batelada */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tamanho de Batelada (kg)</label>
            <input
              type="number"
              value={tamanhoBatelada}
              onChange={(e) => setTamanhoBatelada(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Linha + Balança */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Linha</label>
              <Select value={linha} onValueChange={setLinha}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={String(l)}>Linha {l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Balança</label>
              <Select value={balanca} onValueChange={setBalanca}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Balança 1</SelectItem>
                  <SelectItem value="2">Balança 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data programação */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Data de Programação</label>
            <input
              type="date"
              value={dataProg}
              onChange={(e) => setDataProg(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Marca */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Marca</label>
            <Select value={marca} onValueChange={setMarca}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Selecione a marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pigma">Pigma</SelectItem>
                <SelectItem value="Zan Collor">Zan Collor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Requer mistura */}
          <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Requer Mistura</p>
              <p className="text-xs text-muted-foreground">
                {requerMistura ? "Pesagem → Mistura → Linha" : "Pesagem → Linha (sem mistura)"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requerMistura}
              onClick={() => setRequerMistura((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${requerMistura ? "bg-primary" : "bg-input"}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform ${requerMistura ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>

          {/* Adições para mistura */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Adições para Mistura</label>
            <div className="space-y-1.5">
              {obsItems.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setObsItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                    }}
                    placeholder="0"
                    className="w-14 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">x</span>
                  <input
                    type="text"
                    value={row.mp}
                    onChange={(e) =>
                      setObsItems((prev) => prev.map((r, j) => j === i ? { ...r, mp: e.target.value.toUpperCase() } : r))
                    }
                    placeholder="Matéria-Prima"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
}: {
  ordem: Ordem;
  onReprogramar: (id: string, novaData: string) => Promise<void>;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
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
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-semibold leading-tight truncate">{ordem.produto}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
          Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg
          <MarcaBadge marca={ordem.marca} size="sm" />
        </p>
        <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
      </div>
      {EDITAVEIS.has(ordem.status) && (
        <button
          onClick={(e) => { e.stopPropagation(); onEditar(ordem); }}
          className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
          title="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
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
}: {
  linha: number;
  ordens: Ordem[];
  onReprogramar: (id: string, novaData: string) => Promise<void>;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `linha-${linha}` });

  return (
    <div className="flex flex-col w-48 shrink-0">
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
          style={{ maxHeight: "calc(100vh - 230px)", minHeight: "80px" }}
        >
          {ordens.length === 0 ? (
            <div className="flex items-center justify-center h-20 rounded-lg border border-dashed text-xs text-muted-foreground">
              Sem ordens
            </div>
          ) : (
            ordens.map((ordem) => (
              <SortableCard key={ordem.id} ordem={ordem} onReprogramar={onReprogramar} onDblClick={onDblClick} onEditar={onEditar} />
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
          <div className="flex gap-3 overflow-x-auto pb-4">
            {[1, 2, 3, 4, 5].map((l) => (
              <LinhaColumn
                key={l}
                linha={l}
                ordens={ordensParaLinha(l)}
                onReprogramar={handleReprogramar}
                onDblClick={setOrdemFormula}
                onEditar={setOrdemEditando}
              />
            ))}
          </div>
        </DndContext>
      )}

      <FormulaDialog ordem={ordemFormula} onClose={() => setOrdemFormula(null)} onMoverLinha={handleMoverLinha} />
    </div>
  );
}
