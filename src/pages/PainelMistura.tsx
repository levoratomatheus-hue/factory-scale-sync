import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseObsItems, formatObsLine } from "@/lib/obsUtils";
import { formatKg, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
import { useFormula } from "@/hooks/useFormula";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Loader2, FlaskConical, Layers, Play, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { imprimirEtiqueta } from "@/lib/printEtiqueta";
import { recalcularPosicoes } from "@/lib/recalcularPosicoes";

interface FormulaRow {
  sequencia: number | null;
  materia_prima: string;
  unidade?: string | null;
  quantidade_kg: number;
}

export default function PainelMistura() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customItens, setCustomItens] = useState<FormulaRow[]>([]);
  const [hasCustom, setHasCustom] = useState(false);
  const [loadingOrdemFormula, setLoadingOrdemFormula] = useState(false);

  const sorted = useMemo(() => sortOrdens(ordens), [ordens]);
  const emMistura = useMemo(() => sorted.find((o) => o.status === "em_mistura") ?? null, [sorted]);
  const aguardando = useMemo(() => sorted.filter((o) => o.status === "aguardando_mistura"), [sorted]);

  const { itens: formulaItens, loading: loadingFormula, error: formulaError } = useFormula(
    hasCustom ? null : (emMistura?.formula_id ?? null),
    hasCustom ? null : (emMistura?.tamanho_batelada ?? null)
  );

  const displayItens: FormulaRow[] = hasCustom ? customItens : formulaItens;
  const isLoadingFormula = loadingOrdemFormula || (!hasCustom && loadingFormula);
  const formulaNaoEncontrada =
    !isLoadingFormula &&
    !hasCustom &&
    !!(emMistura?.formula_id) &&
    !!(emMistura?.tamanho_batelada) &&
    displayItens.length === 0;

  useEffect(() => {
    if (!emMistura?.id) {
      setCustomItens([]);
      setHasCustom(false);
      setLoadingOrdemFormula(false);
      return;
    }

    // Limpa imediatamente para não exibir dados de outra OP
    setCustomItens([]);
    setHasCustom(false);
    setLoadingOrdemFormula(true);

    let cancelled = false;

    supabase
      .from("ordens_formula")
      .select("sequencia, materia_prima, quantidade_kg")
      .eq("ordem_id", emMistura.id)
      .order("sequencia", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data && data.length > 0) {
          setCustomItens(data as FormulaRow[]);
          setHasCustom(true);
        }
        setLoadingOrdemFormula(false);
      });

    return () => { cancelled = true; };
  }, [emMistura?.id]);

  const fetchOrdens = useCallback(async () => {
    const { data } = await supabase
      .from("ordens")
      .select("id, produto, lote, quantidade, status, posicao, linha, formula_id, tamanho_batelada, obs, marca, requer_mistura, balanca")
      .in("status", ["aguardando_mistura", "em_mistura"])
      .order("posicao", { ascending: true, nullsFirst: false });
    if (data) setOrdens(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrdens();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("mistura-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchOrdens(), 600);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchOrdens]);

  const iniciarMistura = async (ordem: any) => {
    const { error } = await supabase.from("ordens").update({ status: "em_mistura" }).eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao iniciar mistura", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_mistura",
      status_novo: "em_mistura",
    });
    await fetchOrdens();
  };

  const concluirMistura = async (ordem: any) => {
    if (!ordem.linha) {
      toast({ title: "Linha de destino não definida", description: "Edite a ordem e defina a linha antes de concluir.", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("ordens")
      .update({ status: "aguardando_linha", linha: ordem.linha })
      .eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao concluir mistura", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "em_mistura",
      status_novo: "aguardando_linha",
    });
    await recalcularPosicoes(ordem.linha);
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
      {/* Ordem em mistura */}
      {emMistura ? (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <FlaskConical className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-muted-foreground shrink-0">Mistura</span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <StatusBadge status="em_mistura" />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                imprimirEtiqueta({
                  ordemId: emMistura.id,
                  produto: emMistura.produto,
                  marca: emMistura.marca,
                  lote: emMistura.lote,
                  quantidade: emMistura.quantidade,
                  formulaId: emMistura.formula_id,
                  tamanhoBatelada: emMistura.tamanho_batelada,
                  itens: displayItens.map((i) => ({
                    sequencia: i.sequencia,
                    materia_prima: i.materia_prima,
                    quantidade_kg: i.quantidade_kg,
                  })),
                  obs: emMistura.obs,
                }).catch(() => toast({ title: "Erro ao gerar etiqueta", variant: "destructive" }))
              }
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              Etiqueta
            </Button>
          </div>

          <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border-2 border-status-mixing/40 p-6 space-y-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-xl font-bold leading-tight">{emMistura.produto}</div>
              <MarcaBadge marca={emMistura.marca} />
              <span className="text-sm text-muted-foreground ml-auto shrink-0">Lote {emMistura.lote}</span>
            </div>

            <div className="flex items-start gap-4">
              <div className="space-y-2 min-w-0">
                <div className="text-4xl font-extrabold text-primary">
                  {formatKg(emMistura.quantidade)} <span className="text-lg font-semibold text-muted-foreground">kg</span>
                </div>

                {emMistura.tamanho_batelada > 0 && (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Layers className="h-4 w-4 shrink-0" />
                    <span>
                      <span className="text-foreground font-bold">
                        {Math.round(emMistura.quantidade / emMistura.tamanho_batelada)}
                      </span>{" "}
                      batelada{Math.round(emMistura.quantidade / emMistura.tamanho_batelada) !== 1 ? "s" : ""} de{" "}
                      <span className="text-foreground font-bold">{formatKg(emMistura.tamanho_batelada)} kg</span> cada
                    </span>
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  Linha: <span className="font-semibold text-foreground">{emMistura.linha}</span>
                </div>
              </div>

              {emMistura.obs && (() => {
                const items = parseObsItems(emMistura.obs);
                return (
                  <div className="flex-1 rounded-md border-2 border-blue-800 bg-blue-700 px-3 py-2 space-y-1 shadow-md">
                    <p className="text-xs font-extrabold text-white uppercase tracking-widest">⚠️ ADIÇÕES PARA MISTURA</p>
                    {items ? (
                      <ul className="space-y-0.5">
                        {items.map((item, i) => (
                          <li key={i} className="text-sm font-bold text-white font-mono">{formatObsLine(item)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm font-bold text-white whitespace-pre-wrap">{emMistura.obs}</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {emMistura.orientacoes && (
              <div className="rounded-lg border-2 border-green-700 bg-green-600 px-4 py-3 space-y-2 shadow-md">
                <p className="text-sm font-extrabold text-white uppercase tracking-widest">📋 ORIENTAÇÕES DE PRODUÇÃO</p>
                <p className="text-base font-bold text-white whitespace-pre-wrap">{emMistura.orientacoes}</p>
              </div>
            )}

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
                      </tr>
                    </thead>
                    <tbody>
                      {displayItens.map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{item.sequencia ?? '-'}</td>
                          <td className={`px-3 py-2 font-medium${item.quantidade_kg === 0 ? " line-through text-muted-foreground/50" : ""}`}>{item.materia_prima}</td>
                          {!hasCustom && <td className="px-3 py-2 text-muted-foreground">{item.unidade ?? '-'}</td>}
                          <td className={`px-3 py-2 text-right font-bold text-lg${item.quantidade_kg === 0 ? " line-through text-muted-foreground/50" : ""}`}>{formatKg(item.quantidade_kg)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={hasCustom ? 2 : 3} className="px-3 py-1.5 text-xs text-muted-foreground/60 text-right">total fórmula</td>
                        <td className="px-3 py-1.5 text-right text-xs text-muted-foreground/60">
                          {formatKg(displayItens.reduce((s, i) => s + (i.quantidade_kg || 0), 0))} kg
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {!isLoadingFormula && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="bg-status-done hover:bg-status-done/90 text-primary-foreground"
                  onClick={() => concluirMistura(emMistura)}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Concluir → Linha {emMistura.linha}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border p-6 text-center text-muted-foreground">
          Nenhuma ordem em mistura
        </div>
      )}

      {/* Fila aguardando mistura */}
      {aguardando.length > 0 && (
        <div className="max-w-2xl mx-auto w-full">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            Aguardando mistura ({aguardando.length})
          </h2>
          <div className="space-y-2">
            {aguardando.map((ordem, i) => (
              <div key={ordem.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-status-mixing-bg text-status-mixing font-bold text-sm shrink-0">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ordem.produto}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg · Linha {ordem.linha}
                    <MarcaBadge marca={ordem.marca} size="sm" />
                  </div>
                </div>
                {!emMistura && (
                  <Button size="sm" variant="outline" onClick={() => iniciarMistura(ordem)}>
                    <Play className="h-3 w-3 mr-1" />
                    Iniciar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {ordens.length === 0 && (
        <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border p-6 text-center text-muted-foreground">
          Nenhuma ordem aguardando mistura
        </div>
      )}
    </div>
  );
}
