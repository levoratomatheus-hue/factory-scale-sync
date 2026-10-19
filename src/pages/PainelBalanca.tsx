import { useEffect, useState, useMemo } from "react";
import { useOrdens } from "@/hooks/useOrdens";
import { useAuth } from "@/hooks/useAuth";
import { parseObsItems, formatObsLine } from "@/lib/obsUtils";
import { useFormula } from "@/hooks/useFormula";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Eye, FlaskConical, Loader2, PauseCircle, Play, Printer, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatKg, sortOrdens } from "@/lib/utils";
import { MarcaBadge } from "@/components/MarcaBadge";
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
  const [bateladasJaPesadas, setBateladasJaPesadas] = useState(0);
  const [jaConcluida, setJaConcluida] = useState(false);
  const [jaProduzidoKg, setJaProduzidoKg] = useState(0);
  const [bateladasSessaoPausa, setBateladasSessaoPausa] = useState('');
  const [obsPausaInicial, setObsPausaInicial] = useState<string | null>(null);
  const [pausarOpen, setPausarOpen] = useState(false);
  const [pausaObs, setPausaObs] = useState('');
  const [pausando, setPausando] = useState(false);

  const [operadores, setOperadores] = useState<{ id: string; nome: string }[]>([]);
  const [ordemParaIniciar, setOrdemParaIniciar] = useState<any>(null);
  const [operadorSelecionadoId, setOperadorSelecionadoId] = useState("");
  const [iniciandoPesagem, setIniciandoPesagem] = useState(false);

  // ── "Ver" (gestor) ──
  const { perfil: perfilAuth } = useAuth();
  const isGestor = perfilAuth?.papel === 'gestor';
  const [ordemParaVer, setOrdemParaVer] = useState<any | null>(null);
  const [verItens, setVerItens] = useState<FormulaRow[]>([]);
  const [verLoading, setVerLoading] = useState(false);
  const [verHasCustom, setVerHasCustom] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from("operadores")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }: any) => setOperadores(data ?? []));
  }, []);

  useEffect(() => {
    if (!ordemParaVer) { setVerItens([]); setVerHasCustom(false); return; }
    setVerLoading(true);
    setVerItens([]);
    const tb: number | null = ordemParaVer.tamanho_batelada ?? null;
    const fid: string | null = ordemParaVer.formula_id ?? null;

    (supabase as any)
      .from("ordens_formula")
      .select("sequencia, materia_prima, quantidade_kg")
      .eq("ordem_id", ordemParaVer.id)
      .order("sequencia", { ascending: true })
      .then(({ data: customData }: any) => {
        if (customData && customData.length > 0) {
          setVerHasCustom(true);
          setVerItens(customData as FormulaRow[]);
          setVerLoading(false);
        } else if (fid && tb && tb > 0) {
          setVerHasCustom(false);
          (supabase as any)
            .from("formulas")
            .select("sequencia, materia_prima, unidade, percentual")
            .eq("formula_id", fid)
            .order("sequencia", { ascending: true })
            .then(({ data: fData }: any) => {
              setVerItens(
                (fData ?? []).map((f: any) => ({
                  sequencia: f.sequencia,
                  materia_prima: f.materia_prima,
                  unidade: f.unidade ?? null,
                  quantidade_kg: parseFloat(((f.percentual / 100) * tb).toFixed(3)),
                }))
              );
              setVerLoading(false);
            });
        } else {
          setVerHasCustom(false);
          setVerLoading(false);
        }
      });
  }, [ordemParaVer]);

  const balancaOrdens = useMemo(
    () =>
      ordens
        .filter((o) => o.balanca === balanca && ["pendente", "em_pesagem", "aguardando_liberacao", "concluido"].includes(o.status))
        .sort((a, b) => {
          if (a.posicao_balanca == null && b.posicao_balanca == null) return 0;
          if (a.posicao_balanca == null) return 1;
          if (b.posicao_balanca == null) return -1;
          return a.posicao_balanca - b.posicao_balanca;
        }),
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
      setBateladasJaPesadas(0);
      setJaConcluida(false);
      setJaProduzidoKg(0);
      return;
    }

    setCheckedItens(new Set());
    setObsPausaInicial(null);
    // Limpa imediatamente para não exibir dados de outra OP
    setFormulaId(null);
    setTamanhoBatelada(null);
    setCustomItens([]);
    setHasCustom(false);
    setLoadingOrdem(true);

    let cancelled = false;

    Promise.all([
      supabase.from("ordens").select("formula_id, tamanho_batelada, obs_pausa").eq("id", emPesagem.id).single(),
      supabase.from("ordens_formula").select("sequencia, materia_prima, quantidade_kg").eq("ordem_id", emPesagem.id).order("sequencia", { ascending: true }),
      (supabase as any).from("pesagens").select("bateladas, motivo_fim, kg_nominal").eq("ordem_id", emPesagem.id).not("fim", "is", null),
    ]).then(([ordemRes, formulaRes, pesagensRes]) => {
      if (cancelled) return;
      const row = ordemRes.data as any;
      const hasC = !!(formulaRes.data && formulaRes.data.length > 0);
      const sessoesFechadas = (pesagensRes.data ?? []) as { bateladas: number | null; motivo_fim: string | null; kg_nominal: number | null }[];
      setFormulaId(row?.formula_id ?? null);
      setTamanhoBatelada(row?.tamanho_batelada ?? null);
      setBateladasJaPesadas(sessoesFechadas.reduce((s, p) => s + (p.bateladas ?? 0), 0));
      setJaConcluida(sessoesFechadas.some((p) => p.motivo_fim === 'conclusao'));
      setJaProduzidoKg(sessoesFechadas.reduce((s, p) => s + (p.kg_nominal ?? 0), 0));
      setObsPausaInicial(row?.obs_pausa ?? null);
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

  const displayItens: FormulaRow[] = useMemo(() => {
    if (!hasCustom) return formulaItens;
    // Fórmula custom: se a OP voltou com nova batelada, escalar proporcionalmente
    if (jaProduzidoKg > 0 && tamanhoBatelada && tamanhoBatelada > 0 && customItens.length > 0) {
      const originalSum = customItens.reduce((s, i) => s + (i.quantidade_kg || 0), 0);
      if (originalSum > 0) {
        const fator = tamanhoBatelada / originalSum;
        return customItens.map((i) => ({ ...i, quantidade_kg: Math.round(i.quantidade_kg * fator * 1000) / 1000 }));
      }
    }
    return customItens;
  }, [hasCustom, customItens, formulaItens, jaProduzidoKg, tamanhoBatelada]);
  const somaFormula = useMemo(() => displayItens.reduce((s, i) => s + (i.quantidade_kg || 0), 0), [displayItens]);
  const isLoadingFormula = loadingOrdem || (!hasCustom && loadingFormula);
  const formulaNaoEncontrada = !isLoadingFormula && !hasCustom && !!formulaId && !!tamanhoBatelada && displayItens.length === 0;
  const obsItemsPesagem = useMemo(() => parseObsItems(emPesagem?.obs ?? null), [emPesagem?.obs]);

  const totalHoje = useMemo(() => ordens.filter((o) => o.balanca === balanca).length, [ordens, balanca]);

  const iniciarPesagem = async (ordem: any, operadorId: string, operadorNome: string) => {
    const { error } = await supabase.from("ordens").update({ status: "em_pesagem" }).eq("id", ordem.id);
    if (error) {
      toast({ title: "Erro ao iniciar pesagem", description: error.message, variant: "destructive" });
      return;
    }
    supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "pendente",
      status_novo: "em_pesagem",
    });
    const { data: ordemData } = await (supabase as any)
      .from("ordens")
      .select("bateladas_feitas")
      .eq("id", ordem.id)
      .single();
    const { error: errPesagem } = await (supabase as any)
      .from("pesagens")
      .insert({
        ordem_id:        ordem.id,
        operador_id:     operadorId,
        operador_nome:   operadorNome,
        balanca,
        lote:            ordem.lote,
        produto:         ordem.produto,
        bateladas_inicio: ordemData?.bateladas_feitas ?? 0,
      });
    if (errPesagem) {
      toast({ title: "Aviso: sessão não registrada", description: errPesagem.message, variant: "destructive" });
    }
    await fetchOrdens();
  };

  async function fecharSessaoPesagem(
    ordemId: string,
    bateladas: number,
    kgPesado: number,
    kgNominal: number,
    motivo: string
  ) {
    const { data } = await (supabase as any)
      .from("pesagens")
      .select("id")
      .eq("ordem_id", ordemId)
      .is("fim", null)
      .order("inicio", { ascending: false })
      .limit(1)
      .single();
    if (!data) return;
    const { error } = await (supabase as any)
      .from("pesagens")
      .update({ fim: new Date().toISOString(), bateladas, kg_pesado: kgPesado, kg_nominal: kgNominal, motivo_fim: motivo })
      .eq("id", data.id);
    if (error) {
      toast({ title: "Aviso: fim de sessão não registrado", description: error.message, variant: "destructive" });
    }
  }

  const pausarOrdem = async () => {
    if (!emPesagem) return;
    setPausando(true);
    const temBatelada = !!(tamanhoBatelada && tamanhoBatelada > 0);
    const bateladasSessao = temBatelada ? Math.max(0, parseInt(bateladasSessaoPausa) || 0) : 0;
    const novasBateladasFeitas = bateladasJaPesadas + bateladasSessao;
    const { error } = await (supabase as any).from("ordens").update({
      status: 'pendente',
      bateladas_feitas: novasBateladasFeitas,
      obs_pausa: pausaObs.trim() || null,
    }).eq("id", emPesagem.id);
    if (error) {
      toast({ title: "Erro ao pausar", description: error.message, variant: "destructive" });
      setPausando(false);
      return;
    }
    await (supabase as any).from("historico").insert({
      ordem_id: emPesagem.id,
      status_anterior: "em_pesagem",
      status_novo: "pendente",
      obs: pausaObs.trim()
        ? `Pausado (${bateladasSessao} bat.): ${pausaObs.trim()}`
        : `Pausado (${bateladasSessao} bat.)`,
    });
    const kgPesado  = temBatelada ? bateladasSessao * somaFormula       : 0;
    const kgNominal = temBatelada ? bateladasSessao * tamanhoBatelada!  : 0;
    await fecharSessaoPesagem(emPesagem.id, bateladasSessao, kgPesado, kgNominal, "pausa");
    setPausarOpen(false);
    setPausaObs('');
    setBateladasSessaoPausa('');
    setPausando(false);
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
            <div className="flex items-center gap-2">
              {isGestor && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOrdemParaVer(emPesagem)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Ver
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const { imprimirEtiqueta } = await import("@/lib/printEtiqueta");
                    await imprimirEtiqueta({
                      ordemId: emPesagem.id,
                      produto: emPesagem.produto,
                      marca: emPesagem.marca,
                      lote: emPesagem.lote,
                      quantidade: emPesagem.quantidade,
                      formulaId,
                      tamanhoBatelada,
                      itens: displayItens,
                      obs: emPesagem.obs,
                    });
                  } catch {
                    toast({ title: "Erro ao gerar etiqueta", variant: "destructive" });
                  }
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                Etiqueta
              </Button>
            </div>
          </div>

          <div className="max-w-2xl mx-auto w-full bg-card rounded-xl border-2 border-status-weighing/40 p-3 sm:p-6 space-y-4">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-xl font-bold leading-tight">{emPesagem.produto}</div>
              <MarcaBadge marca={emPesagem.marca} />
              <span className="text-sm text-muted-foreground ml-auto shrink-0">Lote {emPesagem.lote}</span>
            </div>
          <div className="text-4xl font-extrabold text-primary">
            {formatKg(emPesagem.quantidade)} <span className="text-lg font-semibold text-muted-foreground">kg</span>
          </div>

          {tamanhoBatelada && tamanhoBatelada > 0 && !(jaProduzidoKg > 0 && emPesagem.quantidade - jaProduzidoKg > 0) && (() => {
            const totalBateladas = Math.round(emPesagem.quantidade / tamanhoBatelada);
            return (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-700 px-4 py-3">
                <div className="font-extrabold leading-tight text-amber-900 dark:text-amber-100 uppercase">
                  <span className="text-2xl text-amber-600 dark:text-amber-400 tabular-nums">{totalBateladas}</span>
                  <span className="text-xl"> batelada{totalBateladas !== 1 ? 's' : ''} de </span>
                  <span className="text-2xl text-amber-600 dark:text-amber-400 tabular-nums">{formatKg(tamanhoBatelada)} kg</span>
                </div>
              </div>
            );
          })()}

          {jaProduzidoKg > 0 && tamanhoBatelada && tamanhoBatelada > 0 && (() => {
            const faltaKg = Math.max(0, emPesagem.quantidade - jaProduzidoKg);
            const bateladasRestantes = Math.round(faltaKg / tamanhoBatelada);
            if (faltaKg <= 0) return null;
            return (
              <div className="rounded-xl bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-400 dark:border-orange-600 px-4 py-3 flex items-start gap-3">
                <span className="text-orange-500 text-xl shrink-0 mt-0.5">⚠️</span>
                <p className="text-sm font-bold text-orange-900 dark:text-orange-200 leading-snug">
                  OP já tem {formatKg(jaProduzidoKg)} kg pesados — pese {bateladasRestantes} batelada{bateladasRestantes !== 1 ? 's' : ''} de {formatKg(tamanhoBatelada)} kg (faltam {formatKg(faltaKg)} kg).
                </p>
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
              <div className="rounded-md border overflow-x-auto">
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
                        className={cn("border-t cursor-pointer", checkedItens.has(idx) && "bg-green-50 [&_td]:!text-gray-800")}
                        onClick={() =>
                          setCheckedItens((prev) => {
                            const next = new Set(prev);
                            next.has(idx) ? next.delete(idx) : next.add(idx);
                            return next;
                          })
                        }
                      >
                        <td className="px-3 py-3 sm:py-2 text-muted-foreground">{item.sequencia ?? '-'}</td>
                        <td className={cn("px-3 py-3 sm:py-2 font-medium", checkedItens.has(idx) && "line-through text-muted-foreground", item.quantidade_kg === 0 && "line-through text-muted-foreground/50")}>{item.materia_prima}</td>
                        {!hasCustom && <td className="px-3 py-3 sm:py-2 text-muted-foreground">{(item as any).unidade ?? '-'}</td>}
                        <td className={cn("px-3 py-3 sm:py-2 text-right font-bold text-lg", item.quantidade_kg === 0 && "line-through text-muted-foreground/50")}>{formatKg(item.quantidade_kg)}</td>
                        <td className="px-3 py-3 sm:py-2 text-center">
                          <input
                            type="checkbox"
                            readOnly
                            checked={checkedItens.has(idx)}
                            className="h-6 w-6 sm:h-5 sm:w-5 accent-green-600 cursor-pointer"
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
            <div className="flex gap-2 justify-end flex-wrap">
              <Button
                variant="outline"
                className="min-h-[44px] sm:min-h-0 text-base sm:text-sm"
                onClick={() => { setPausaObs(''); setBateladasSessaoPausa(''); setPausarOpen(true); }}
              >
                <PauseCircle className="mr-2 h-5 w-5 sm:h-4 sm:w-4" />
                Pausar
              </Button>
              <Button
                className="bg-status-done hover:bg-status-done/90 text-primary-foreground w-full sm:w-auto min-h-[44px] sm:min-h-0 text-base sm:text-sm"
                onClick={() => { setConfirmOpen(true); }}
              >
                <CheckCircle2 className="mr-2 h-5 w-5 sm:h-4 sm:w-4" />
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
              {tamanhoBatelada && tamanhoBatelada > 0 && (() => {
                const faltaKg = Math.max(0, emPesagem.quantidade - jaProduzidoKg);
                const bateladasSessao = Math.round(faltaKg / tamanhoBatelada);
                return (
                  <div className="rounded-lg bg-muted/50 border px-4 py-3 text-sm space-y-0.5">
                    <p className="font-medium">
                      {bateladasSessao} batelada{bateladasSessao !== 1 ? 's' : ''} serão registradas nesta conclusão
                    </p>
                    {jaProduzidoKg > 0 && (
                      <p className="text-muted-foreground text-xs">
                        {formatKg(jaProduzidoKg)} kg já pesados em etapas anteriores — faltam {formatKg(faltaKg)} kg
                      </p>
                    )}
                  </div>
                );
              })()}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setConfirmOpen(false);
                    const temBatelada = !!(tamanhoBatelada && tamanhoBatelada > 0);
                    const faltaKgConc = temBatelada ? Math.max(0, emPesagem.quantidade - jaProduzidoKg) : 0;
                    const bateladasSessao = temBatelada ? Math.round(faltaKgConc / tamanhoBatelada!) : 0;
                    const kgPesado  = temBatelada ? bateladasSessao * somaFormula      : somaFormula;
                    const kgNominal = temBatelada ? bateladasSessao * tamanhoBatelada! : faltaKgConc || emPesagem.quantidade;
                    await fecharSessaoPesagem(emPesagem.id, bateladasSessao, kgPesado, kgNominal, "conclusao");
                    await (supabase as any).from("ordens").update({ bateladas_feitas: 0, obs_pausa: null }).eq("id", emPesagem.id);
                    const err = await concluirOrdem(emPesagem.id);
                    if (err) toast({ title: "Erro ao concluir pesagem", description: err, variant: "destructive" });
                    await fetchOrdens();
                  }}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={pausarOpen} onOpenChange={(open) => { if (!open) setPausarOpen(false); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Pausar pesagem</AlertDialogTitle>
                <AlertDialogDescription>
                  A OP voltará para a fila com o progresso salvo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                {tamanhoBatelada && tamanhoBatelada > 0 && (() => {
                  const faltaKgPausa   = Math.max(0, emPesagem.quantidade - jaProduzidoKg);
                  const maxPermitido   = Math.round(faltaKgPausa / tamanhoBatelada);
                  const valorNum       = parseInt(bateladasSessaoPausa);
                  const excedeu        = bateladasSessaoPausa !== '' && (!Number.isInteger(valorNum) || valorNum > maxPermitido);
                  return (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Quantas bateladas você pesou nesta vez?</label>
                      <input
                        type="number"
                        min={0}
                        max={maxPermitido}
                        value={bateladasSessaoPausa}
                        onChange={(e) => setBateladasSessaoPausa(e.target.value)}
                        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${excedeu ? 'border-destructive focus:ring-destructive' : ''}`}
                      />
                      {excedeu ? (
                        <p className="text-xs text-destructive font-medium">
                          Máximo de {maxPermitido} batelada{maxPermitido !== 1 ? 's' : ''} restante{maxPermitido !== 1 ? 's' : ''} nesta OP.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Faltam {maxPermitido} batelada{maxPermitido !== 1 ? 's' : ''} ({formatKg(faltaKgPausa)} kg restantes)
                        </p>
                      )}
                    </div>
                  );
                })()}
                <Textarea
                  placeholder="Motivo da pausa (opcional)"
                  value={pausaObs}
                  onChange={(e) => setPausaObs(e.target.value)}
                  rows={3}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pausando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pausando || !!(tamanhoBatelada && tamanhoBatelada > 0 && (
                    bateladasSessaoPausa === '' ||
                    parseInt(bateladasSessaoPausa) > Math.round(Math.max(0, emPesagem.quantidade - jaProduzidoKg) / tamanhoBatelada)
                  ))}
                  onClick={(e) => { e.preventDefault(); pausarOrdem(); }}
                >
                  {pausando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Pausar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {obsPausaInicial && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 flex items-start gap-2">
              <PauseCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Retomada — pausa anterior</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">{obsPausaInicial}</p>
              </div>
            </div>
          )}

          {emPesagem.obs && (
            <div className="flex overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {/* faixa lateral âmbar */}
              <div className="w-1.5 shrink-0 bg-amber-400 dark:bg-amber-500 rounded-l-xl" />
              <div className="flex-1 px-4 py-3 space-y-2.5">
                {/* rótulo */}
                <p className="flex items-center gap-1.5 text-[13px] font-medium tracking-widest uppercase text-amber-600 dark:text-amber-400">
                  <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                  Adições para Mistura
                </p>
                {/* itens */}
                {obsItemsPesagem ? (
                  <ul className="space-y-2">
                    {obsItemsPesagem.map((item, i) => (
                      <li key={i} className="flex items-baseline gap-3">
                        <span className="text-2xl font-medium tabular-nums leading-none text-amber-500 dark:text-amber-400 shrink-0">
                          {item.qty}×
                        </span>
                        <span className="text-lg font-medium leading-snug text-foreground">{item.mp}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-base text-foreground whitespace-pre-wrap">{emPesagem.obs}</p>
                )}
              </div>
            </div>
          )}

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
            {emAberto.map((ordem, i) => {
              const pausada = (ordem as any).bateladas_feitas > 0;
              const obsPausa = (ordem as any).obs_pausa as string | null;
              return (
                <div key={ordem.id} className="bg-card rounded-lg border p-3 flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-status-open-bg text-status-open font-bold text-sm shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{ordem.produto}</span>
                      {pausada && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                          <PauseCircle className="h-3 w-3" />
                          Pausada — bat. {(ordem as any).bateladas_feitas}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg
                      <MarcaBadge marca={ordem.marca} size="sm" />
                    </div>
                    {pausada && obsPausa && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 truncate" title={obsPausa}>{obsPausa}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isGestor && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => setOrdemParaVer(ordem)}
                        title="Ver detalhes da OP"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {!emPesagem && (
                      <Button
                        variant="outline"
                        onClick={() => { setOrdemParaIniciar(ordem); setOperadorSelecionadoId(""); }}
                        className="min-h-[44px] sm:min-h-0 sm:h-8 px-3 text-sm"
                      >
                        {pausada ? (
                          <>
                            <Play className="h-4 w-4 sm:h-3 sm:w-3 mr-1.5 sm:mr-1" />
                            Retomar
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 sm:h-3 sm:w-3 mr-1.5 sm:mr-1" />
                            Iniciar Pesagem
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Dialog: Ver detalhes da OP (gestor) */}
      <Dialog open={!!ordemParaVer} onOpenChange={(o) => { if (!o) setOrdemParaVer(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>{ordemParaVer?.produto ?? '—'}</span>
              {ordemParaVer?.marca && <MarcaBadge marca={ordemParaVer.marca} />}
            </DialogTitle>
          </DialogHeader>

          {ordemParaVer && (() => {
            const tb: number | null = ordemParaVer.tamanho_batelada ?? null;
            const totalBateladas = tb && tb > 0 ? Math.round(ordemParaVer.quantidade / tb) : null;
            const obsItems = parseObsItems(ordemParaVer.obs ?? null);
            const somaVer = verItens.reduce((s: number, i) => s + (i.quantidade_kg || 0), 0);

            return (
              <div className="space-y-4 py-1">
                {/* Dados básicos */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="text-muted-foreground">Lote</div>
                  <div className="font-medium">{ordemParaVer.lote ?? '—'}</div>
                  <div className="text-muted-foreground">Quantidade</div>
                  <div className="font-medium">{formatKg(ordemParaVer.quantidade)} kg</div>
                  {totalBateladas != null && (
                    <>
                      <div className="text-muted-foreground">Bateladas</div>
                      <div className="font-medium">
                        {totalBateladas}× de {formatKg(tb!)} kg
                      </div>
                    </>
                  )}
                </div>

                {/* Fórmula */}
                {verLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando fórmula…
                  </div>
                ) : verItens.length > 0 ? (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2">Seq</th>
                          <th className="text-left px-3 py-2">Matéria-Prima</th>
                          {!verHasCustom && <th className="text-left px-3 py-2">Un</th>}
                          <th className="text-right px-3 py-2">Qtd (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verItens.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2 text-muted-foreground">{item.sequencia ?? '–'}</td>
                            <td className="px-3 py-2 font-medium">{item.materia_prima}</td>
                            {!verHasCustom && <td className="px-3 py-2 text-muted-foreground">{(item as any).unidade ?? '–'}</td>}
                            <td className="px-3 py-2 text-right font-bold">{formatKg(item.quantidade_kg)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t">
                          <td colSpan={verHasCustom ? 2 : 3} className="px-3 py-1.5 text-xs text-muted-foreground/60 text-right">total fórmula</td>
                          <td className="px-3 py-1.5 text-right text-xs text-muted-foreground/60">{formatKg(somaVer)} kg</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : null}

                {/* Adições para Mistura */}
                {ordemParaVer.obs && (
                  <div className="flex overflow-hidden rounded-xl border border-border bg-card">
                    <div className="w-1.5 shrink-0 bg-amber-400 dark:bg-amber-500 rounded-l-xl" />
                    <div className="flex-1 px-4 py-3 space-y-2">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium tracking-widest uppercase text-amber-600 dark:text-amber-400">
                        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                        Adições para Mistura
                      </p>
                      {obsItems ? (
                        <ul className="space-y-1.5">
                          {obsItems.map((item, i) => (
                            <li key={i} className="flex items-baseline gap-3">
                              <span className="text-xl font-medium tabular-nums leading-none text-amber-500 dark:text-amber-400 shrink-0">{item.qty}×</span>
                              <span className="text-base font-medium leading-snug">{item.mp}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{ordemParaVer.obs}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Orientações */}
                {ordemParaVer.orientacoes && (
                  <div className="rounded-lg border-2 border-green-700 bg-green-600 px-4 py-3 space-y-1.5 shadow-md">
                    <p className="text-sm font-extrabold text-white uppercase tracking-widest">📋 ORIENTAÇÕES DE PRODUÇÃO</p>
                    <p className="text-sm font-bold text-white whitespace-pre-wrap">{ordemParaVer.orientacoes}</p>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOrdemParaVer(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: selecionar operador para iniciar/retomar */}
      <Dialog open={!!ordemParaIniciar} onOpenChange={(o) => { if (!o) { setOrdemParaIniciar(null); setOperadorSelecionadoId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Selecionar operador</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {ordemParaIniciar && (
              <p className="text-sm text-muted-foreground">
                OP {ordemParaIniciar.lote} — {ordemParaIniciar.produto}
              </p>
            )}
            <Select value={operadorSelecionadoId} onValueChange={setOperadorSelecionadoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o operador" />
              </SelectTrigger>
              <SelectContent>
                {operadores.map((op) => (
                  <SelectItem key={op.id} value={op.id}>{op.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOrdemParaIniciar(null); setOperadorSelecionadoId(""); }}>
              Cancelar
            </Button>
            <Button
              disabled={!operadorSelecionadoId || iniciandoPesagem}
              onClick={async () => {
                const op = operadores.find((o) => o.id === operadorSelecionadoId);
                if (!ordemParaIniciar || !op) return;
                setIniciandoPesagem(true);
                await iniciarPesagem(ordemParaIniciar, op.id, op.nome);
                setIniciandoPesagem(false);
                setOrdemParaIniciar(null);
                setOperadorSelecionadoId("");
              }}
            >
              {iniciandoPesagem ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Iniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
