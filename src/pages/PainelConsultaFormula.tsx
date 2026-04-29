import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Loader2, FlaskConical, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { MarcaBadge } from "@/components/MarcaBadge";
import { DetalheOrdemDialog } from "@/components/DetalheOrdemDialog";
import { formatKg } from "@/lib/utils";

interface Ordem {
  id: string;
  lote: string;
  produto: string;
  formula_id: string | null;
  data_programacao: string;
  status: string;
  quantidade: number;
  obs_laboratorio: string | null;
  marca: string | null;
  linha: number | null;
  balanca: number | null;
  tamanho_batelada: number | null;
  obs: string | null;
  requer_mistura: boolean | null;
  data_emissao: string | null;
  criado_em: string | null;
}

const hoje = format(new Date(), "yyyy-MM-dd");

export default function PainelConsultaFormula() {
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(false);
  const [ordemDetalhe, setOrdemDetalhe] = useState<Ordem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarOrdens = async (termo: string, ini: string, fim: string) => {
    if (!termo.trim() && !ini && !fim) {
      setOrdens([]);
      return;
    }
    setLoading(true);

    let query = supabase
      .from("ordens")
      .select(
        "id, lote, produto, formula_id, data_programacao, status, quantidade, obs_laboratorio, marca, linha, balanca, tamanho_batelada, obs, requer_mistura, data_emissao, criado_em"
      )
      .order("criado_em", { ascending: false })
      .limit(100);

    if (termo.trim()) {
      query = query.or(
        `produto.ilike.%${termo.trim()}%,formula_id.ilike.%${termo.trim()}%`
      );
    }
    if (ini) query = query.gte("data_programacao", ini);
    if (fim) query = query.lte("data_programacao", fim);

    const { data } = await query;
    setOrdens((data as Ordem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      buscarOrdens(busca, dataInicio, dataFim);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca, dataInicio, dataFim]);

  const limparFiltros = () => {
    setBusca("");
    setDataInicio("");
    setDataFim("");
  };

  const temFiltro = busca.trim() || dataInicio || dataFim;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por produto ou fórmula..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            className="w-38 text-sm"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            placeholder="De"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            className="w-38 text-sm"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            placeholder="Até"
          />
        </div>
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limparFiltros} className="gap-1 text-muted-foreground">
            <X className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      {!temFiltro && (
        <p className="text-sm text-muted-foreground text-center py-12 border border-dashed rounded-lg">
          Digite um produto ou fórmula para consultar as ordens
        </p>
      )}

      {temFiltro && loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {temFiltro && !loading && ordens.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-12 border border-dashed rounded-lg">
          Nenhuma ordem encontrada
        </p>
      )}

      {!loading && ordens.length > 0 && (
        <div className="space-y-1.5">
          {ordens.map((o) => (
            <button
              key={o.id}
              onClick={() => setOrdemDetalhe(o)}
              className={`w-full text-left rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors space-y-1 ${
                o.obs_laboratorio
                  ? "border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-700"
                  : "bg-card"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm leading-tight">{o.produto}</span>
                {o.obs_laboratorio && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 bg-violet-100 dark:bg-violet-900/40 border border-violet-300 dark:border-violet-700 rounded-full px-2 py-0">
                    <FlaskConical className="h-3 w-3" /> Lab
                  </span>
                )}
                <MarcaBadge marca={o.marca} size="sm" />
                <span className="ml-auto"><StatusBadge status={o.status} /></span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span>Lote <span className="font-mono text-foreground">{o.lote}</span></span>
                {o.formula_id && (
                  <span>Fórmula <span className="font-mono text-foreground">{o.formula_id}</span></span>
                )}
                <span>{formatKg(o.quantidade)} kg</span>
                <span>
                  {format(new Date(o.data_programacao + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                </span>
                {o.criado_em && (
                  <span className="ml-auto text-muted-foreground/60">
                    criado {format(new Date(o.criado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </span>
                )}
              </div>

              {o.obs_laboratorio && (
                <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5 line-clamp-2">
                  {o.obs_laboratorio}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      <DetalheOrdemDialog
        ordem={ordemDetalhe}
        onClose={() => setOrdemDetalhe(null)}
      />
    </div>
  );
}
