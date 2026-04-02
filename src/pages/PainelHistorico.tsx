import { useHistorico } from "@/hooks/useOrdens";
import { StatusBadge } from "@/components/StatusBadge";
import { Loader2, History } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PainelHistorico() {
  const { ordens, loading } = useHistorico();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Histórico de Ordens</h2>
          <p className="text-sm text-muted-foreground">({ordens.length} ordens no total)</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold">#</th>
              <th className="px-4 py-3 text-left font-semibold">Lote</th>
              <th className="px-4 py-3 text-left font-semibold">Produto</th>
              <th className="px-4 py-3 text-left font-semibold">Qtd</th>
              <th className="px-4 py-3 text-left font-semibold">Linha</th>
              <th className="px-4 py-3 text-left font-semibold">Balança</th>
              <th className="px-4 py-3 text-left font-semibold">Data</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {ordens.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma ordem registrada
                </td>
              </tr>
            )}
            {ordens.map((ordem) => (
              <tr key={ordem.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-muted-foreground">{ordem.id.slice(0, 6)}</td>
                <td className="px-4 py-3 font-medium">{ordem.lote}</td>
                <td className="px-4 py-3">{ordem.produto}</td>
                <td className="px-4 py-3">{ordem.quantidade} kg</td>
                <td className="px-4 py-3">L{ordem.linha}</td>
                <td className="px-4 py-3">B{ordem.balanca}</td>
                <td className="px-4 py-3">
                  {format(new Date(ordem.data_programacao), "dd/MM/yyyy", { locale: ptBR })}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={ordem.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
