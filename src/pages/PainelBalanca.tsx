import { useEffect, useState, useMemo } from "react";
import { useOrdens } from "@/hooks/useOrdens";
import { parseObsItems, formatObsLine } from "@/lib/obsUtils";
import { useFormula } from "@/hooks/useFormula";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Loader2, Minus, Play, Plus, Printer, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatKg, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { toast } from "@/hooks/use-toast";
import { imprimirEtiqueta } from "@/lib/printEtiqueta";
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

interface PainelBalancaProps {
  balanca: number;
}

interface FormulaRow {
  sequencia: number | null;
  materia_prima: string;
  unidade?: string | null;
  quantidade_kg: number;
}

export default function PainelBalanca({ balanca }: PainelBalancaProps) {
  const { ordens, loading, concluirOrdem, fetchOrdens } = useOrdens();

  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [tamanhoBatelada, setTamanhoBatelada] = useState<number | null>(null);
  const [customItens, setCustomItens] = useState<FormulaRow[]>([]);
  const [hasCustom, setHasCustom] = useState(false);
  const [loadingOrdem, setLoadingOrdem] = useState(false);
  const [checkedItens, setCheckedItens] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [carga, setCarga] = useState(1);
  const [bateladaAtual, setBateladaAtual] = useState(1);

  const balancaOrdens = useMemo(
    () => sortOrdens(ordens.filter((o) => o.balanca === balanca && ["pendente", "em_pesagem", "aguardando_liberacao", "concluido"].includes(o.status))),
    [ordens, balanca]
  );

  const emPesagem = useMemo(() => balancaOrdens.find((o) => o.status === "em_pesagem"), [balancaOrdens]);
  const emAberto = useMemo(() => balancaOrdens.filter((o) => o.status === "pendente"), [balancaOrdens]);

  useEffect(() => {
    if (!emPesagem?.id) {
      setFormulaId(null);
      setTamanhoBatelada(null);
      setCustomItens([]);
      setHasCustom(false);
      setLoadingOrdem(false);
      return;
    }

    setCheckedItens(new Set());
    setCarga(1);
    setBateladaAtual(1);
    // Limpa imediatamente para não exibir dados de outra OP
    setFormulaId(null);
    setTamanhoBatelada(null);
    setCustomItens([]);
    setHasCustom(false);
    setLoadingOrdem(true);

    let cancelled = false;

    Promise.all([
      supabase.from("ordens").select("formula_id, tamanho_batelada").eq("id", emPesagem.id).single(),
      supabase.from("ordens_formula").select("sequencia, materia_prima, quantidade_kg").eq("ordem_id", emPesagem.id).order("sequencia", { ascending: true }),
    ]).then(([ordemRes, formulaRes]) => {
      if (cancelled) return;
      const row = ordemRes.data as any;
      const hasC = !!(formulaRes.data && formulaRes.data.length > 0);
      setFormulaId(row?.formula_id ?? null);
      setTamanhoBatelada(row?.tamanho_batelada ?? null);
      if (hasC) {
        setCustomItens(formulaRes.data as FormulaRow[]);
        setHasCustom(true);
      }
      setLoadingOrdem(false);
    });

    return () => { cancelled = true; };
  }, [emPesagem?.id]);

  const { itens: formulaItens, loading: loadingFormula, error: formulaError } = useFormula(
    hasCustom ? null : formulaId,
    hasCustom ? null : tamanhoBatelada
  );

  const displayItens: FormulaRow[] = hasCustom ? customItens : formulaItens;
  const isLoadingFormula = loadingOrdem || (!hasCustom && loadingFormula);
  const formulaNaoEncontrada = !isLoadingFormula && !hasCustom && !!formulaId && !!tamanhoBatelada && displayItens.length === 0;

  const totalHoje = useMemo(() => ordens.filter((o) => o.balanca === balanca).length, [ordens, balanca]);

  const iniciarPesagem = async (ordem: { id: string }) => {
    const { error } = await supabase.from("ordens").update({ status: "em_pesagem" }).eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao iniciar pesagem", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "pendente",
      status_novo: "em_pesagem",
    });
    await fetchOrdens();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full pb-16">
      {/* Ordem atual em pesagem */}
      {emPesagem ? (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <Scale className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-muted-foreground shrink-0">Balança {balanca}</span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <StatusBadge status="em_pesagem" />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                imprimirEtiqueta({
                  ordemId: emPesagem.id,
                  produto: emPesagem.produto,
                  marca: emPesagem.marca,
                  lote: emPesagem.lote,
                  quantidade: emPesagem.quantidade,
                  formulaId,
                  tamanhoBatelada,
                  itens: displayItens,
                  obs: emPesagem.obs,
                }).catch(() => toast({ title: "Erro ao gerar etiqueta", variant: "destructive" }))
              }
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              Etiqueta
            </Button>
          </div>

          <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border-2 border-status-weighing/40 p-6 space-y-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-xl font-bold leading-tight">{emPesagem.produto}</div>
              <MarcaBadge marca={emPesagem.marca} />
              <span className="text-sm text-muted-foreground ml-auto shrink-0">Lote {emPesagem.lote}</span>
            </div>
          <div className="text-4xl font-extrabold text-primary">
            {formatKg(emPesagem.quantidade)} <span className="text-lg font-semibold text-muted-foreground">kg</span>
          </div>

          {tamanhoBatelada && tamanhoBatelada > 0 && (
            <div className="text-sm font-medium text-muted-foreground">
              <span className="text-foreground font-bold">
                {Math.round(emPesagem.quantidade / tamanhoBatelada)}
              </span>{' '}
              batelada{Math.round(emPesagem.quantidade / tamanhoBatelada) !== 1 ? 's' : ''} de{' '}
              <span className="text-foreground font-bold">{formatKg(tamanhoBatelada)} kg</span> cada
            </div>
          )}

          {tamanhoBatelada && tamanhoBatelada > 0 && (() => {
            const totalBateladas = Math.round(emPesagem.quantidade / tamanhoBatelada);
            const progresso = Math.min(bateladaAtual, totalBateladas);
            const pct = Math.round((progresso / totalBateladas) * 100);
            return (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bateladas</span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {progresso} de {totalBateladas}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    className="flex items-center justify-center h-10 w-10 rounded-full border-2 border-primary/40 bg-background hover:bg-primary/10 transition-colors disabled:opacity-30"
                    onClick={() => setBateladaAtual((b) => Math.max(1, b - 1))}
                    disabled={bateladaAtual <= 1}
                  >
                    <Minus className="h-5 w-5 text-primary" />
                  </button>
                  <div className="text-center">
                    <div className="text-5xl font-extrabold text-primary leading-none">{bateladaAtual}</div>
                    <div className="text-xs text-muted-foreground mt-1">batelada atual</div>
                  </div>
                  <button
                    className="flex items-center justify-center h-10 w-10 rounded-full border-2 border-primary/40 bg-background hover:bg-primary/10 transition-colors disabled:opacity-30"
                    onClick={() => setBateladaAtual((b) => Math.min(totalBateladas + 1, b + 1))}
                    disabled={bateladaAtual > totalBateladas}
                  >
                    <Plus className="h-5 w-5 text-primary" />
                  </button>
                </div>
                <div className="space-y-1">
                  <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-muted-foreground">{pct}%</div>
                </div>
              </div>
            );
          })()}

          {isLoadingFormula && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando fórmula...
            </div>
          )}

          {formulaNaoEncontrada && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive font-medium">
              {formulaError ?? "Fórmula não encontrada"}
            </div>
          )}

          {!isLoadingFormula && displayItens.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-base">
                  <thead className="bg-muted text-muted-foreground text-sm">
                    <tr>
                      <th className="text-left px-3 py-2">Seq</th>
                      <th className="text-left px-3 py-2">Matéria-Prima</th>
                      {!hasCustom && <th className="text-left px-3 py-2">Un</th>}
                      <th className="text-right px-3 py-2">Qtd (kg)</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayItens.map((item, idx) => (
                      <tr
                        key={idx}
                        className={cn("border-t cursor-pointer", checkedItens.has(idx) && "bg-green-50")}
                        onClick={() =>
                          setCheckedItens((prev) => {
                            const next = new Set(prev);
                            next.has(idx) ? next.delete(idx) : next.add(idx);
                            return next;
                          })
                        }
                      >
                        <td className="px-3 py-2 text-muted-foreground">{item.sequencia ?? '-'}</td>
                        <td className={cn("px-3 py-2 font-medium", checkedItens.has(idx) && "line-through text-muted-foreground", item.quantidade_kg === 0 && "line-through text-muted-foreground/50")}>{item.materia_prima}</td>
                        {!hasCustom && <td className="px-3 py-2 text-muted-foreground">{(item as any).unidade ?? '-'}</td>}
                        <td className={cn("px-3 py-2 text-right font-bold text-lg", item.quantidade_kg === 0 && "line-through text-muted-foreground/50")}>{formatKg(item.quantidade_kg)}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            readOnly
                            checked={checkedItens.has(idx)}
                            className="h-5 w-5 accent-green-600 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                            onChange={() =>
                              setCheckedItens((prev) => {
                                const next = new Set(prev);
                                next.has(idx) ? next.delete(idx) : next.add(idx);
                                return next;
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={hasCustom ? 3 : 4} className="px-3 py-1.5 text-xs text-muted-foreground/60 text-right">total fórmula</td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground/60">
                        {formatKg(displayItens.reduce((s, i) => s + (i.quantidade_kg || 0), 0))} kg
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {(displayItens.length === 0 || checkedItens.size === displayItens.length) && !isLoadingFormula && (
            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-status-done hover:bg-status-done/90 text-primary-foreground"
                onClick={() => setConfirmOpen(true)}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Concluir pesagem
              </Button>
            </div>
          )}

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Finalizar pesagem</AlertDialogTitle>
                <AlertDialogDescription>
                  Deseja finalizar a pesagem desta ordem?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => {
                  setConfirmOpen(false);
                  concluirOrdem(emPesagem.id).then(async (err) => {
                    if (err) toast({ title: "Erro ao concluir pesagem", description: err, variant: "destructive" });
                    await fetchOrdens();
                  });
                }}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {emPesagem.obs && (() => {
            const items = parseObsItems(emPesagem.obs);
            return (
              <div className="rounded-lg border-2 border-blue-800 bg-blue-700 px-4 py-3 space-y-2 shadow-md">
                <p className="text-sm font-extrabold text-white uppercase tracking-widest">⚠️ ADIÇÕES PARA MISTURA</p>
                {items ? (
                  <ul className="space-y-1">
                    {items.map((item, i) => (
                      <li key={i} className="text-base font-bold text-white font-mono">{formatObsLine(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-base font-bold text-white whitespace-pre-wrap">{emPesagem.obs}</p>
                )}
              </div>
            );
          })()}

          {emPesagem.orientacoes && (
            <div className="rounded-lg border-2 border-green-700 bg-green-600 px-4 py-3 space-y-2 shadow-md">
              <p className="text-sm font-extrabold text-white uppercase tracking-widest">📋 ORIENTAÇÕES DE PRODUÇÃO</p>
              <p className="text-base font-bold text-white whitespace-pre-wrap">{emPesagem.orientacoes}</p>
            </div>
          )}
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border p-6 text-center text-muted-foreground">
          {emAberto.length === 0 && totalHoje > 0
            ? "Todas as ordens foram pesadas!"
            : "Nenhuma ordem em pesagem"}
        </div>
      )}

      {/* Próximas ordens */}
      {emAberto.length > 0 && (
        <div className="max-w-2xl mx-auto w-full">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            Fila de pesagem ({emAberto.length})
          </h2>
          <div className="space-y-2">
            {emAberto.map((ordem, i) => (
              <div key={ordem.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-status-open-bg text-status-open font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg
                    <MarcaBadge marca={ordem.marca} size="sm" />
                  </div>
                </div>
                {!emPesagem && (
                  <Button size="sm" variant="outline" onClick={() => iniciarPesagem(ordem)}>
                    <Play className="h-3 w-3 mr-1" />
                    Iniciar Pesagem
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {emPesagem && (
        <div className="fixed bottom-4 left-4 flex items-center gap-2 bg-card border rounded-lg px-3 py-2 shadow-md z-20">
          <span className="text-xs font-semibold text-muted-foreground">Carga {carga}</span>
          <div className="w-px h-4 bg-border" />
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              setCheckedItens(new Set());
              setCarga((c) => c + 1);
            }}
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
