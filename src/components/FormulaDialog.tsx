import { memo } from "react";
import { Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { MarcaBadge } from "@/components/MarcaBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormula } from "@/hooks/useFormula";
import { formatKg } from "@/lib/utils";

export interface FormulaOrdemLike {
  produto: string;
  lote: string;
  quantidade: number;
  status: string;
  formula_id: string | null;
  tamanho_batelada: number | null;
  obs: string | null;
  marca: string | null;
}

export const FormulaDialog = memo(function FormulaDialog({
  ordem,
  onClose,
}: {
  ordem: FormulaOrdemLike | null;
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
          <div className="overflow-y-auto overflow-x-auto flex-1 rounded-md border">
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
