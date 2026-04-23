import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatKg } from "@/lib/utils";

export interface OrdemEditavel {
  id: string;
  produto: string;
  lote: string | number;
  quantidade: number;
  status: string;
  linha: number;
  balanca: number | null;
  formula_id: string | null;
  tamanho_batelada: number | null;
  obs: string | null;
  marca: string | null;
  requer_mistura: boolean | null;
  data_programacao: string;
}

interface FormulaItem {
  sequencia: number | null;
  materia_prima: string;
  unidade?: string | null;
  quantidade_kg: number;
}

function parseObsItems(obs: string | null): { qty: string; mp: string }[] {
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

export function EditarOrdemDialog({
  ordem,
  onClose,
  onSalvar,
}: {
  ordem: OrdemEditavel | null;
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
  const [formulaId, setFormulaId] = useState("");
  const [obsItems, setObsItems] = useState(Array.from({ length: 4 }, () => ({ qty: "", mp: "" })));

  const [formulaItens, setFormulaItens] = useState<FormulaItem[]>([]);
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [formulaFonte, setFormulaFonte] = useState<"ordens_formula" | "padrao" | null>(null);

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
    setFormulaId(ordem.formula_id ?? "");
    setObsItems(parseObsItems(ordem.obs));

    // Carrega ingredientes
    setFormulaItens([]);
    setFormulaFonte(null);

    if (!ordem.formula_id) return;

    setLoadingFormula(true);
    let cancelled = false;

    const carregarFormula = async () => {
      // 1. Tenta ordens_formula
      const { data: custom } = await supabase
        .from("ordens_formula")
        .select("sequencia, materia_prima, quantidade_kg")
        .eq("ordem_id", ordem.id)
        .order("sequencia", { ascending: true });

      if (cancelled) return;

      if (custom && custom.length > 0) {
        setFormulaItens(custom as FormulaItem[]);
        setFormulaFonte("ordens_formula");
        setLoadingFormula(false);
        return;
      }

      // 2. Fallback: fórmula padrão
      const tb = ordem.tamanho_batelada;
      if (!tb || tb <= 0) {
        setLoadingFormula(false);
        return;
      }

      const { data: padrao } = await supabase
        .from("formulas")
        .select("sequencia, materia_prima, unidade, percentual")
        .eq("formula_id", ordem.formula_id)
        .order("sequencia", { ascending: true });

      if (cancelled) return;

      if (padrao && padrao.length > 0) {
        setFormulaItens(
          padrao.map((row: any) => ({
            sequencia: row.sequencia,
            materia_prima: row.materia_prima,
            unidade: row.unidade,
            quantidade_kg: parseFloat(((row.percentual / 100) * tb).toFixed(3)),
          }))
        );
        setFormulaFonte("padrao");
      }
      setLoadingFormula(false);
    };

    carregarFormula();
    return () => { cancelled = true; };
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

    // Salva campos da ordem
    await onSalvar(ordem.id, {
      quantidade: qtd,
      tamanho_batelada: tamanhoBatelada ? parseFloat(tamanhoBatelada) : null,
      linha: parseInt(linha),
      balanca: balanca ? parseInt(balanca) : null,
      data_programacao: dataProg,
      requer_mistura: requerMistura,
      marca: marca || null,
      formula_id: formulaId.trim() || null,
      obs: obsJson,
    });

    // Salva ingredientes (se existirem)
    if (formulaItens.length > 0) {
      await supabase.from("ordens_formula").delete().eq("ordem_id", ordem.id);
      await supabase.from("ordens_formula").insert(
        formulaItens.map((item) => ({
          ordem_id: ordem.id,
          sequencia: item.sequencia,
          materia_prima: item.materia_prima,
          quantidade_kg: item.quantidade_kg,
        }))
      );
    }

    setSaving(false);
    onClose();
  };

  const updateQtd = (idx: number, val: string) => {
    const num = parseFloat(val);
    setFormulaItens((prev) =>
      prev.map((item, i) => i === idx ? { ...item, quantidade_kg: isNaN(num) ? 0 : num } : item)
    );
  };

  return (
    <Dialog open={!!ordem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="leading-tight">
            Editar OP — Lote {ordem.lote}
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{ordem.produto}</p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Quantidade (kg)</label>
            <input
              type="number"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Data de Programação</label>
            <input
              type="date"
              value={dataProg}
              onChange={(e) => setDataProg(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

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

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fórmula (ID)</label>
            <input
              type="text"
              value={formulaId}
              onChange={(e) => setFormulaId(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Ingredientes da fórmula */}
          {loadingFormula && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando ingredientes...
            </div>
          )}

          {!loadingFormula && formulaItens.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Ingredientes</label>
                {formulaFonte === "padrao" && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    fórmula padrão — edite as quantidades
                  </span>
                )}
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5">Seq</th>
                      <th className="text-left px-2 py-1.5">Matéria-Prima</th>
                      <th className="text-right px-2 py-1.5">Qtd (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formulaItens.map((item, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-2 py-1.5 text-muted-foreground">{item.sequencia ?? "-"}</td>
                        <td className="px-2 py-1.5 font-medium">{item.materia_prima}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="0.001"
                            value={item.quantidade_kg}
                            onChange={(e) => updateQtd(idx, e.target.value)}
                            className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring ml-auto block"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={2} className="px-2 py-1.5 text-xs text-muted-foreground/60 text-right">total</td>
                      <td className="px-2 py-1.5 text-right text-xs text-muted-foreground/60">
                        {formatKg(formulaItens.reduce((s, i) => s + (i.quantidade_kg || 0), 0))} kg
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

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
          <Button onClick={handleSalvar} disabled={saving || loadingFormula}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
