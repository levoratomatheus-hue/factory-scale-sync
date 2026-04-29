import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { GripVertical, Loader2, CalendarDays, ArrowRightLeft, Pencil, Trash2, Undo2, CheckCircle2, AlertTriangle, CalendarCheck2, Clock, FlaskConical, Lock, LockOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormula } from "@/hooks/useFormula";
import { formatKg, sortOrdens } from "@/lib/utils";
import { diasUteis, proximoDiaUtil } from "@/lib/diasUteis";
import { recalcularPosicoes } from "@/lib/recalcularPosicoes";
import { MarcaBadge } from "@/components/MarcaBadge";
import { EditarOrdemDialog } from "@/components/EditarOrdemDialog";
import { DetalheOrdemDialog } from "@/components/DetalheOrdemDialog";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  TouchSensor,
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
  obs_laboratorio: string | null;
  marca: string | null;
  requer_mistura: boolean | null;
  data_programacao: string;
  data_emissao: string | null;
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

function LabObsDialog({
  ordem,
  onClose,
  onSalvo,
}: {
  ordem: Ordem;
  onClose: () => void;
  onSalvo: (id: string, obs: string) => void;
}) {
  const [texto, setTexto] = useState(ordem.obs_laboratorio ?? "");
  const [salvando, setSalvando] = useState(false);

  const handleSalvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from("ordens").update({ obs_laboratorio: texto } as any).eq("id", ordem.id);
    setSalvando(false);
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } else {
      onSalvo(ordem.id, texto);
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-violet-500" />
            Obs. Laboratório
          </DialogTitle>
          <DialogDescription className="text-xs">{ordem.produto} · Lote {ordem.lote}</DialogDescription>
        </DialogHeader>
        <textarea
          className="w-full rounded-md border bg-muted/30 p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Anotações do laboratório..."
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableCard({
  ordem,
  registro,
  onReprogramarClick,
  onDblClick,
  onEditar,
  onExcluir,
  onVoltarFila,
  onForcarConclusao,
  onRegistrarDia,
  onVerDetalhes,
  onLab,
  onToggleConfirmado,
}: {
  ordem: Ordem;
  registro?: any;
  onReprogramarClick: (ordem: Ordem) => void;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
  onExcluir: (ordem: Ordem) => void;
  onVoltarFila: (ordem: Ordem) => void;
  onForcarConclusao: (ordem: Ordem) => void;
  onRegistrarDia: (ordem: Ordem) => void;
  onVerDetalhes: (ordem: Ordem) => void;
  onLab: (ordem: Ordem) => void;
  onToggleConfirmado: (ordem: Ordem) => void;
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
      className={`bg-card border rounded-lg p-2.5 flex items-start gap-1.5 select-none cursor-pointer ${atrasado ? 'border-red-500' : ''}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (ordem.status === "em_linha" || ordem.status === "aguardando_linha") onVerDetalhes(ordem);
      }}
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
        <p className="text-xs font-semibold leading-tight line-clamp-2">{ordem.produto}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap leading-snug">
          <span>Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg</span>
          <MarcaBadge marca={ordem.marca} size="sm" />
        </p>
        {ordem.criado_em && (
          <p className="text-xs text-muted-foreground">
            Criado: {format(new Date(ordem.criado_em), "dd/MM/yyyy")}
          </p>
        )}
        <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
        {!registro && (ordem.status === "em_linha" || ordem.status === "aguardando_linha") && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded px-1 py-0 leading-4">
            <Clock className="h-2.5 w-2.5 shrink-0" />
            aguardando registro
          </span>
        )}
        {registro && (() => {
          const items: any[] = Array.isArray(registro.registro_producao) ? registro.registro_producao : [];
          const total = items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
          const hi = registro.hora_inicio ? String(registro.hora_inicio).slice(0, 5) : null;
          const hf = registro.hora_fim ? String(registro.hora_fim).slice(0, 5) : null;
          if (!total && !(hi && hf)) return null;
          return (
            <span className="inline-flex flex-col gap-0 text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-tight">
              {total > 0 && <span>{total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</span>}
              {hi && hf && <span>{hi}–{hf}</span>}
            </span>
          );
        })()}
        {atrasado && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0 leading-4">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            {du - 7} {du - 7 === 1 ? 'dia' : 'dias'} em atraso
          </span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleConfirmado(ordem); }}
        className={`mt-0.5 shrink-0 ${ordem.programacao_confirmada ? "text-green-500 hover:text-green-600" : "text-orange-400 hover:text-orange-500"}`}
        title={ordem.programacao_confirmada ? "Confirmado — clique para desconfirmar" : "Não confirmado — clique para confirmar"}
      >
        {ordem.programacao_confirmada ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onEditar(ordem); }}
        className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {(ordem.status === "em_linha" || ordem.status === "aguardando_linha") && (
        <button
          onClick={(e) => { e.stopPropagation(); onRegistrarDia(ordem); }}
          className="mt-0.5 text-muted-foreground/50 hover:text-blue-600 shrink-0"
          title="Registrar Dia"
        >
          <CalendarCheck2 className="h-3.5 w-3.5" />
        </button>
      )}
      {(ordem.status === "em_linha" || ordem.status === "aguardando_linha") && (
        <button
          onClick={(e) => { e.stopPropagation(); onForcarConclusao(ordem); }}
          className="mt-0.5 text-muted-foreground/50 hover:text-green-600 shrink-0"
          title="Forçar Conclusão"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
      )}
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
        onClick={(e) => { e.stopPropagation(); onLab(ordem); }}
        className={`mt-0.5 shrink-0 ${ordem.obs_laboratorio ? "text-violet-500 hover:text-violet-600" : "text-muted-foreground/50 hover:text-violet-500"}`}
        title="Obs. Laboratório"
      >
        <FlaskConical className="h-3.5 w-3.5" />
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
    </div>
  );
}

function LinhaColumn({
  linha,
  ordens,
  registrosDoDia,
  onReprogramarClick,
  onDblClick,
  onEditar,
  onExcluir,
  onVoltarFila,
  onForcarConclusao,
  onRegistrarDia,
  onVerDetalhes,
  onLab,
  onToggleConfirmado,
}: {
  linha: number;
  ordens: Ordem[];
  registrosDoDia: Record<string, any>;
  onReprogramarClick: (ordem: Ordem) => void;
  onDblClick: (ordem: Ordem) => void;
  onEditar: (ordem: Ordem) => void;
  onExcluir: (ordem: Ordem) => void;
  onVoltarFila: (ordem: Ordem) => void;
  onForcarConclusao: (ordem: Ordem) => void;
  onRegistrarDia: (ordem: Ordem) => void;
  onVerDetalhes: (ordem: Ordem) => void;
  onLab: (ordem: Ordem) => void;
  onToggleConfirmado: (ordem: Ordem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `linha-${linha}` });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px]">
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
              <SortableCard key={ordem.id} ordem={ordem} registro={registrosDoDia[ordem.id]} onReprogramarClick={onReprogramarClick} onDblClick={onDblClick} onEditar={onEditar} onExcluir={onExcluir} onVoltarFila={onVoltarFila} onForcarConclusao={onForcarConclusao} onRegistrarDia={onRegistrarDia} onVerDetalhes={onVerDetalhes} onLab={onLab} onToggleConfirmado={onToggleConfirmado} />
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
  const [registrosDoDia, setRegistrosDoDia] = useState<Record<string, any>>({});
  const [excluindo, setExcluindo] = useState(false);
  const [ordemParaVoltar, setOrdemParaVoltar] = useState<Ordem | null>(null);
  const [voltando, setVoltando] = useState(false);
  const [ordemParaForcar, setOrdemParaForcar] = useState<Ordem | null>(null);
  const [forcarHoraInicio, setForcarHoraInicio] = useState("");
  const [forcarHoraFim, setForcarHoraFim] = useState("");
  const [forcarProdItems, setForcarProdItems] = useState([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [forcarQtdReal, setForcarQtdReal] = useState("");
  const [forcando, setForcando] = useState(false);
  const [ordemParaRegistrar, setOrdemParaRegistrar] = useState<Ordem | null>(null);
  const [ordemParaReprogramar, setOrdemParaReprogramar] = useState<Ordem | null>(null);
  const [novaDataReprogramar, setNovaDataReprogramar] = useState("");
  const [salvandoReprogramar, setSalvandoReprogramar] = useState(false);
  const [ordemDetalhe, setOrdemDetalhe] = useState<Ordem | null>(null);
  const [regDia, setRegDia] = useState(todayStr);
  const [regHoraInicio, setRegHoraInicio] = useState("");
  const [regHoraFim, setRegHoraFim] = useState("");
  const [regProdItems, setRegProdItems] = useState([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [registrando, setRegistrando] = useState(false);
  const [ordemLab, setOrdemLab] = useState<Ordem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const fetchOrdens = async (dataSel: string) => {
    setLoading(true);
    const fields = "id, produto, lote, quantidade, status, posicao, linha, balanca, formula_id, tamanho_batelada, obs, obs_laboratorio, marca, requer_mistura, data_programacao, data_emissao";

    // Busca em paralelo: OPs programadas para a data + registros do dia
    const [{ data: programadas }, { data: regs }] = await Promise.all([
      supabase
        .from("ordens")
        .select(fields)
        .eq("data_programacao", dataSel)
        .not("linha", "is", null)
        .order("posicao", { ascending: true, nullsFirst: false }),
      (supabase as any)
        .from("registros_diarios")
        .select("ordem_id, registro_producao, hora_inicio, hora_fim")
        .eq("data", dataSel),
    ]);

    // Mapa de registros do dia
    const regMap: Record<string, any> = {};
    (regs ?? []).forEach((r: any) => { regMap[r.ordem_id] = r; });
    setRegistrosDoDia(regMap);

    // OPs com registro nesta data mas data_programacao diferente
    const programadasIds = new Set((programadas ?? []).map((o: any) => o.id));
    const extraIds = Object.keys(regMap).filter((id) => !programadasIds.has(id));

    let extraOrdens: Ordem[] = [];
    if (extraIds.length > 0) {
      const { data: extraRows } = await supabase
        .from("ordens")
        .select(fields)
        .in("id", extraIds)
        .not("linha", "is", null);
      extraOrdens = (extraRows as Ordem[]) ?? [];
    }

    const all = [...(programadas ?? []) as Ordem[], ...extraOrdens];
    const deduped = [...new Map(all.map((o) => [o.id, o])).values()];
    setOrdens(deduped);
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

  const handleToggleConfirmado = async (ordem: Ordem) => {
    const novoValor = !ordem.programacao_confirmada;
    const { error } = await supabase
      .from("ordens")
      .update({ programacao_confirmada: novoValor } as any)
      .eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao atualizar confirmação", description: error.message, variant: "destructive" });
    } else {
      setOrdens((prev) => prev.map((o) => o.id === ordem.id ? { ...o, programacao_confirmada: novoValor } : o));
    }
  };

  const handleReprogramar = async (id: string, novaData: string) => {
    const ordem = ordens.find((o) => o.id === id);
    if (!ordem) return;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataSelecionada = new Date(novaData + "T00:00:00");
    if (dataSelecionada < hoje) {
      const confirmado = window.confirm("A data selecionada é anterior a hoje. Tem certeza que deseja reprogramar para o passado?");
      if (!confirmado) return;
    }

    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: novaData } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao reprogramar ordem", description: error.message, variant: "destructive" });
    } else {
      await recalcularPosicoes(ordem.linha);
      setOrdens((prev) => prev.filter((o) => o.id !== id));
      toast({ title: "Ordem reprogramada com sucesso" });
    }
  };

  const handleMoverLinha = async (id: string, novaLinha: number) => {
    const ordemAtual = ordens.find((o) => o.id === id);

    const { error } = await supabase
      .from("ordens")
      .update({ linha: novaLinha } as any)
      .eq("id", id);

    if (error) {
      toast({ title: "Erro ao mover ordem", description: error.message, variant: "destructive" });
      return;
    }

    await Promise.all([
      recalcularPosicoes(novaLinha),
      ...(ordemAtual && ordemAtual.linha !== novaLinha ? [recalcularPosicoes(ordemAtual.linha)] : []),
    ]);

    setOrdens((prev) =>
      prev.map((o) => o.id === id ? { ...o, linha: novaLinha } : o)
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

  const handleForcarConclusao = async () => {
    if (!ordemParaForcar) return;
    setForcando(true);

    const filledItems = forcarProdItems.filter((r) => r.qty.trim() || r.peso.trim());
    if (filledItems.length > 0) {
      const { error: errReg } = await (supabase as any).from("registros_diarios").insert({
        ordem_id: ordemParaForcar.id,
        data: ordemParaForcar.data_programacao,
        hora_inicio: forcarHoraInicio || null,
        hora_fim: forcarHoraFim || null,
        registro_producao: filledItems.map((r) => ({
          qty: parseInt(r.qty) || 0,
          peso: parseFloat(r.peso.replace(",", ".")) || 0,
        })),
      });

      if (errReg) {
        toast({ title: "Erro ao salvar registro de produção", description: errReg.message, variant: "destructive" });
        setForcando(false);
        return;
      }
    }

    const statusAnterior = ordemParaForcar.status;
    const payload: any = { status: "aguardando_liberacao", hora_inicio: forcarHoraInicio || null, hora_fim: forcarHoraFim || null, motivo_reprovacao: null };
    if (forcarQtdReal.trim()) payload.quantidade_real = parseFloat(forcarQtdReal.replace(",", "."));

    const { error } = await supabase.from("ordens").update(payload as any).eq("id", ordemParaForcar.id);
    if (!error) {
      await supabase.from("historico").insert({
        ordem_id: ordemParaForcar.id,
        status_anterior: statusAnterior,
        status_novo: "aguardando_liberacao",
      });
      setOrdens((prev) => prev.map((o) => o.id === ordemParaForcar.id ? { ...o, status: "aguardando_liberacao" } : o));
      toast({ title: "Ordem enviada para aguardando liberação" });
    } else {
      toast({ title: "Erro ao concluir ordem", description: error.message, variant: "destructive" });
    }
    setForcando(false);
    setOrdemParaForcar(null);
    setForcarHoraInicio("");
    setForcarHoraFim("");
    setForcarProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    setForcarQtdReal("");
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

  const handleRegistrarDia = async () => {
    if (!ordemParaRegistrar) return;
    const dataRegistro = (regDia || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRegistro)) {
      toast({ title: "Data inválida", description: "Selecione uma data válida no formato YYYY-MM-DD.", variant: "destructive" });
      return;
    }
    setRegistrando(true);
    const filledItems = regProdItems.filter((r) => r.qty.trim() || r.peso.trim());
    const { error } = await (supabase as any).from("registros_diarios").insert({
      ordem_id: ordemParaRegistrar.id,
      data: dataRegistro,
      hora_inicio: regHoraInicio || null,
      hora_fim: regHoraFim || null,
      registro_producao: filledItems.map((r) => ({
        qty: parseInt(r.qty) || 0,
        peso: parseFloat(r.peso.replace(",", ".")) || 0,
      })),
    });
    if (error) {
      setRegistrando(false);
      toast({ title: "Erro ao registrar dia", description: error.message, variant: "destructive" });
      return;
    }
    const proximaData = proximoDiaUtil(dataRegistro);
    const { error: errUpdate } = await supabase.from("ordens").update({ data_programacao: proximaData } as any).eq("id", ordemParaRegistrar.id);
    if (errUpdate) {
      setRegistrando(false);
      toast({ title: "Registro salvo, mas erro ao avançar data", description: errUpdate.message, variant: "destructive" });
      return;
    }
    await recalcularPosicoes(ordemParaRegistrar.linha);
    setOrdens((prev) => prev.map((o) => o.id === ordemParaRegistrar!.id ? { ...o, data_programacao: proximaData } : o));
    setRegistrando(false);
    const dataFmt = format(new Date(dataRegistro + "T12:00:00"), "dd/MM/yyyy");
    toast({ title: `Registro de ${dataFmt} salvo — próxima data: ${format(new Date(proximaData + "T12:00:00"), "dd/MM/yyyy")}` });
    setOrdemParaRegistrar(null);
    setRegDia(todayStr);
    setRegHoraInicio("");
    setRegHoraFim("");
    setRegProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    if (dataRegistro !== data) {
      // Navega para a data salva para confirmar o registro visualmente
      setData(dataRegistro);
    } else {
      fetchOrdens(data);
    }
  };

  const ordensParaLinha = useCallback((l: number) => sortOrdens(ordens.filter((o) => o.linha === l)), [ordens]);

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
        <span className="text-sm text-muted-foreground capitalize">
          {format(new Date(data + "T12:00:00"), "EEEE", { locale: ptBR })}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 w-full overflow-x-auto pb-4">
            {[1, 2, 3, 4, 5].map((l) => (
              <LinhaColumn
                key={l}
                linha={l}
                ordens={ordensParaLinha(l)}
                registrosDoDia={registrosDoDia}
                onReprogramarClick={(o) => { setOrdemParaReprogramar(o); setNovaDataReprogramar(""); }}
                onDblClick={setOrdemFormula}
                onEditar={setOrdemEditando}
                onExcluir={setOrdemParaExcluir}
                onVoltarFila={setOrdemParaVoltar}
                onForcarConclusao={setOrdemParaForcar}
                onRegistrarDia={(o) => {
                  setOrdemParaRegistrar(o);
                  setRegDia(o.data_programacao || data);
                }}
                onVerDetalhes={setOrdemDetalhe}
                onLab={setOrdemLab}
                onToggleConfirmado={handleToggleConfirmado}
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

      <FormulaDialog ordem={ordemFormula} onClose={() => setOrdemFormula(null)} onMoverLinha={handleMoverLinha} />
      <DetalheOrdemDialog ordem={ordemDetalhe} onClose={() => setOrdemDetalhe(null)} />
      {ordemLab && (
        <LabObsDialog
          ordem={ordemLab}
          onClose={() => setOrdemLab(null)}
          onSalvo={(id, obs) =>
            setOrdens((prev) => prev.map((o) => o.id === id ? { ...o, obs_laboratorio: obs } : o))
          }
        />
      )}

      <Dialog
        open={!!ordemParaForcar}
        onOpenChange={(open) => {
          if (!open) {
            setOrdemParaForcar(null);
            setForcarHoraInicio("");
            setForcarHoraFim("");
            setForcarProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
            setForcarQtdReal("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forçar Conclusão</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaForcar?.produto}</span>
              <br />
              Registre os dados de produção para concluir esta OP manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={forcarHoraInicio}
                  onChange={(e) => setForcarHoraInicio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={forcarHoraFim}
                  onChange={(e) => setForcarHoraFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Registro de Produção</label>
              {forcarProdItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setForcarProdItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                    }}
                    placeholder="0"
                    className="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.peso}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9,]/g, "");
                      setForcarProdItems((prev) => prev.map((r, j) => j === i ? { ...r, peso: val } : r));
                    }}
                    placeholder="0,000 kg"
                    className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantidade Real (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                value={forcarQtdReal}
                onChange={(e) => setForcarQtdReal(e.target.value.replace(/[^0-9,]/g, ""))}
                placeholder="Opcional"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaForcar(null)} disabled={forcando}>
              Cancelar
            </Button>
            <Button onClick={handleForcarConclusao} disabled={forcando} className="bg-green-600 hover:bg-green-700 text-white">
              {forcando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Enviar para Liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={!!ordemParaRegistrar}
        onOpenChange={(open) => {
          if (!open) {
            setOrdemParaRegistrar(null);
            setRegDia(todayStr);
            setRegHoraInicio("");
            setRegHoraFim("");
            setRegProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Dia</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaRegistrar?.produto}</span>
              <br />
              Insira o registro de produção para o dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data</label>
              <input
                type="date"
                value={regDia}
                onChange={(e) => setRegDia(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={regHoraInicio}
                  onChange={(e) => setRegHoraInicio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={regHoraFim}
                  onChange={(e) => setRegHoraFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Registro de Produção</label>
              {regProdItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setRegProdItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                    }}
                    placeholder="0"
                    className="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.peso}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9,]/g, "");
                      setRegProdItems((prev) => prev.map((r, j) => j === i ? { ...r, peso: val } : r));
                    }}
                    placeholder="0,000 kg"
                    className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaRegistrar(null)} disabled={registrando}>
              Cancelar
            </Button>
            <Button onClick={handleRegistrarDia} disabled={registrando || !regDia} className="bg-blue-600 hover:bg-blue-700 text-white">
              {registrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CalendarCheck2 className="mr-1.5 h-4 w-4" />
              Salvar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
