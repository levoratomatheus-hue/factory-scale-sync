import { useEffect, useRef, useState } from "react";
import { useOrdens } from "@/hooks/useOrdens";
import { useFormula } from "@/hooks/useFormula";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

const fmtQtd = (n: number) => n.toFixed(3).replace(".", ",");

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
  const { ordens, loading, concluirOrdem, initBalanca } = useOrdens();
  const iniciado = useRef(false);

  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [tamanhoBatelada, setTamanhoBatelada] = useState<number | null>(null);
  const [customItens, setCustomItens] = useState<FormulaRow[]>([]);
  const [hasCustom, setHasCustom] = useState(false);
  const [checkedItens, setCheckedItens] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [carga, setCarga] = useState(1);

  const balancaOrdens = ordens.filter(
    (o) => o.balanca === balanca && ["pendente", "em_pesagem"].includes(o.status)
  );

  const emPesagem = balancaOrdens.find((o) => o.status === "em_pesagem");
  const emAberto = balancaOrdens.filter((o) => o.status === "pendente");

  // Fetch formula_id, tamanho_batelada and ordens_formula for the active order
  useEffect(() => {
    if (!emPesagem?.id) {
      setFormulaId(null);
      setTamanhoBatelada(null);
      setCustomItens([]);
      setHasCustom(false);
      return;
    }

    setCheckedItens(new Set());
    setCarga(1);

    supabase
      .from("ordens")
      .select("formula_id, tamanho_batelada")
      .eq("id", emPesagem.id)
      .single()
      .then(({ data }) => {
        const row = data as any;
        setFormulaId(row?.formula_id ?? null);
        setTamanhoBatelada(row?.tamanho_batelada ?? null);
      });

    supabase
      .from("ordens_formula")
      .select("sequencia, materia_prima, quantidade_kg")
      .eq("ordem_id", emPesagem.id)
      .order("sequencia", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCustomItens(data as FormulaRow[]);
          setHasCustom(true);
        } else {
          setCustomItens([]);
          setHasCustom(false);
        }
      });
  }, [emPesagem?.id]);

  const { itens: formulaItens, loading: loadingFormula } = useFormula(
    hasCustom ? null : formulaId,
    hasCustom ? null : tamanhoBatelada
  );

  const displayItens: FormulaRow[] = hasCustom ? customItens : formulaItens;

  const totalHoje = ordens.filter((o) => o.balanca === balanca).length;

  useEffect(() => {
    if (!loading && balancaOrdens.length > 0 && !iniciado.current) {
      iniciado.current = true;
      initBalanca(balanca).then((err) => {
        if (err) toast({ title: "Erro ao iniciar fila automaticamente", description: err, variant: "destructive" });
      });
    }
  }, [loading, balancaOrdens.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-16">
      {/* Ordem atual em pesagem */}
      {emPesagem ? (
        <div className="bg-card rounded-xl border-2 border-status-weighing/40 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Scale className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-muted-foreground shrink-0">Balança {balanca}</span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <StatusBadge status="em_pesagem" />
            </div>
            <span className="text-sm text-muted-foreground shrink-0">Lote {emPesagem.lote}</span>
          </div>
          <div className="text-xl font-bold leading-tight">{emPesagem.produto}</div>
          <div className="text-4xl font-extrabold text-primary">
            {emPesagem.quantidade} <span className="text-lg font-semibold text-muted-foreground">kg</span>
          </div>

          {tamanhoBatelada && tamanhoBatelada > 0 && (
            <div className="text-sm font-medium text-muted-foreground">
              <span className="text-foreground font-bold">
                {Math.round(emPesagem.quantidade / tamanhoBatelada)}
              </span>{' '}
              batelada{Math.round(emPesagem.quantidade / tamanhoBatelada) !== 1 ? 's' : ''} de{' '}
              <span className="text-foreground font-bold">{tamanhoBatelada} kg</span> cada
            </div>
          )}

          {!hasCustom && loadingFormula && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando fórmula...
            </div>
          )}

          {displayItens.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Fórmula: <span className="text-foreground">{formulaId}</span>
                {tamanhoBatelada && <span className="ml-2">· Batelada: {tamanhoBatelada} kg</span>}
                {hasCustom && <span className="ml-2 text-status-weighing">· Quantidades customizadas</span>}
              </p>
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
                        <td className={cn("px-3 py-2 font-medium", checkedItens.has(idx) && "line-through text-muted-foreground")}>{item.materia_prima}</td>
                        {!hasCustom && <td className="px-3 py-2 text-muted-foreground">{(item as any).unidade ?? '-'}</td>}
                        <td className="px-3 py-2 text-right font-bold text-lg">{fmtQtd(item.quantidade_kg)}</td>
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
                </table>
              </div>
            </div>
          )}

          {(displayItens.length === 0 || checkedItens.size === displayItens.length) && !loadingFormula && (
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
                <AlertDialogAction onClick={() => concluirOrdem(emPesagem.id)}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {emPesagem.obs && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Observações</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{emPesagem.obs}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-xl border p-6 text-center text-muted-foreground">
          {emAberto.length === 0 && totalHoje > 0 ? (
            "Todas as ordens foram pesadas!"
          ) : (
            <div className="space-y-3">
              <p>Nenhuma ordem em pesagem</p>
              <Button
                variant="outline"
                onClick={async () => {
                  iniciado.current = false;
                  const err = await initBalanca(balanca);
                  if (err) {
                    toast({ title: "Erro ao iniciar fila", description: err, variant: "destructive" });
                  }
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
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-status-open-bg text-status-open font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground">
                    Lote {ordem.lote} · {ordem.quantidade} kg
                  </div>
                </div>
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
