import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, PauseCircle, Trash2, RefreshCw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MOTIVOS: Record<string, string> = {
  manutencao: "Manutenção",
  sem_material: "Sem Material",
  problema_processo: "Problemas de Processo",
  falta_energia: "Falta de Energia",
  reuniao: "Reunião",
  outros: "Outros",
};

const MOTIVO_CORES: Record<string, string> = {
  manutencao: "bg-orange-100 text-orange-800 border-orange-200",
  sem_material: "bg-yellow-100 text-yellow-800 border-yellow-200",
  problema_processo: "bg-red-100 text-red-800 border-red-200",
  falta_energia: "bg-red-200 text-red-900 border-red-300",
  reuniao: "bg-violet-100 text-violet-800 border-violet-200",
  outros: "bg-gray-100 text-gray-700 border-gray-200",
};

interface Parada {
  id: string;
  linha: number;
  data: string;
  motivo: string;
  hora_inicio: string;
  hora_fim: string;
  criado_em: string;
}

function toHoras(hi: string, hf: string): number {
  const [hh, mm] = hi.split(":").map(Number);
  const [eh, em] = hf.split(":").map(Number);
  return Math.max(0, (eh + em / 60) - (hh + mm / 60));
}

function fmtHoras(h: number): string {
  const hrs = Math.floor(h);
  const min = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${min}min`;
  if (min === 0) return `${hrs}h`;
  return `${hrs}h ${min}min`;
}

interface Props {
  papel: string;
}

export default function HistoricoParadas({ papel }: Props) {
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [loading, setLoading] = useState(true);

  const hoje = format(new Date(), "yyyy-MM-dd");
  const primeiroDiaMes = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");

  const [dataInicio, setDataInicio] = useState(primeiroDiaMes);
  const [dataFim, setDataFim] = useState(hoje);
  const [linhaFiltro, setLinhaFiltro] = useState("todas");
  const [motivoFiltro, setMotivoFiltro] = useState("todos");

  const fetchParadas = useCallback(async () => {
    setLoading(true);
    let query = (supabase as any)
      .from("paradas")
      .select("id, linha, data, motivo, hora_inicio, hora_fim, criado_em")
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: false })
      .order("hora_inicio", { ascending: false });

    if (linhaFiltro !== "todas") query = query.eq("linha", Number(linhaFiltro));
    if (motivoFiltro !== "todos") query = query.eq("motivo", motivoFiltro);

    const { data, error } = await query;
    if (!error) setParadas(data ?? []);
    setLoading(false);
  }, [dataInicio, dataFim, linhaFiltro, motivoFiltro]);

  useEffect(() => { fetchParadas(); }, [fetchParadas]);

  async function excluirParada(id: string) {
    if (!window.confirm("Excluir esta parada?")) return;
    const { error } = await (supabase as any).from("paradas").delete().eq("id", id);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); return; }
    toast({ title: "Parada excluída" });
    setParadas((prev) => prev.filter((p) => p.id !== id));
  }

  // Resumo por linha
  const resumoPorLinha = useMemo(() => {
    return [1, 2, 3, 4, 5].map((l) => {
      const ps = paradas.filter((p) => p.linha === l);
      const total = ps.reduce((s, p) => s + toHoras(p.hora_inicio, p.hora_fim), 0);
      return { linha: l, qtd: ps.length, total };
    });
  }, [paradas]);

  const totalGeral = useMemo(() =>
    paradas.reduce((s, p) => s + toHoras(p.hora_inicio, p.hora_fim), 0),
  [paradas]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <PauseCircle className="h-6 w-6 text-amber-600" />
        <div>
          <h2 className="text-xl font-bold">Histórico de Paradas</h2>
          <p className="text-sm text-muted-foreground">{paradas.length} registro{paradas.length !== 1 ? "s" : ""} encontrado{paradas.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end rounded-lg border bg-muted/30 p-4">
        <Filter className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Data início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Data fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Linha</label>
          <Select value={linhaFiltro} onValueChange={setLinhaFiltro}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {[1, 2, 3, 4, 5].map((l) => (
                <SelectItem key={l} value={String(l)}>Linha {l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Motivo</label>
          <Select value={motivoFiltro} onValueChange={setMotivoFiltro}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {Object.entries(MOTIVOS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={fetchParadas} className="gap-1.5 mt-5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {/* Cards de resumo por linha */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Geral</p>
          <p className="text-lg font-bold text-amber-600">{fmtHoras(totalGeral)}</p>
          <p className="text-xs text-muted-foreground">{paradas.length} paradas</p>
        </div>
        {resumoPorLinha.map((r) => (
          <div key={r.linha} className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground font-medium mb-1">Linha {r.linha}</p>
            <p className="text-lg font-bold">{r.qtd > 0 ? fmtHoras(r.total) : "—"}</p>
            <p className="text-xs text-muted-foreground">{r.qtd} parada{r.qtd !== 1 ? "s" : ""}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : paradas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          Nenhuma parada registrada no período
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs border-b">
                <th className="text-left px-4 py-2.5 font-medium">Data</th>
                <th className="text-center px-3 py-2.5 font-medium">Linha</th>
                <th className="text-center px-3 py-2.5 font-medium">Início</th>
                <th className="text-center px-3 py-2.5 font-medium">Fim</th>
                <th className="text-center px-3 py-2.5 font-medium">Duração</th>
                <th className="text-left px-3 py-2.5 font-medium">Motivo</th>
                <th className="text-right px-4 py-2.5 font-medium">Registrado em</th>
                {papel === "gestor" && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {paradas.map((p, i) => {
                const dur = toHoras(p.hora_inicio, p.hora_fim);
                return (
                  <tr key={p.id} className={`border-t ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">
                      {format(parseISO(p.data), "dd/MM/yyyy", { locale: ptBR })}
                      <span className="ml-1.5 text-xs text-muted-foreground capitalize">
                        {format(parseISO(p.data + "T12:00:00"), "EEE", { locale: ptBR })}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs">
                        {p.linha}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums">
                      {String(p.hora_inicio).slice(0, 5)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono tabular-nums">
                      {String(p.hora_fim).slice(0, 5)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="font-semibold text-amber-700">{fmtHoras(dur)}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${MOTIVO_CORES[p.motivo] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                        {MOTIVOS[p.motivo] ?? p.motivo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {format(new Date(p.criado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </td>
                    {papel === "gestor" && (
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => excluirParada(p.id)}
                          className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Excluir parada"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
