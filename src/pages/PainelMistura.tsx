import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFormula } from "@/hooks/useFormula";
import { StatusBadge } from "@/components/StatusBadge";
import { CheckCircle2, Loader2, FlaskConical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PainelMistura() {
  const [ordens, setOrdens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedItens, setCheckedItens] = useState<Set<number>>(new Set());

  const emMistura = ordens.find((o) => o.status === "em_mistura") ?? null;
  const aguardando = ordens.filter((o) => o.status === "aguardando_mistura");

  const { itens, loading: loadingFormula } = useFormula(
    emMistura?.formula_id ?? null,
    emMistura?.tamanho_batelada ?? null
  );

  useEffect(() => {
    setCheckedItens(new Set());
  }, [emMistura?.id]);

  const fetchOrdens = async () => {
    const { data } = await supabase
      .from("ordens")
      .select("*")
      .in("status", ["aguardando_mistura", "em_mistura"])
      .order("posicao", { ascending: true, nullsFirst: false });
    if (data) setOrdens(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrdens();
    const channel = supabase
      .channel("mistura-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordens" }, fetchOrdens)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const iniciarMistura = async (ordem: any) => {
    await supabase.from("ordens").update({ status: "em_mistura" }).eq("id", ordem.id);
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "aguardando_mistura",
      status_novo: "em_mistura",
    });
  };

  const concluirMistura = async (ordem: any) => {
    await supabase.from("ordens").update({ status: "aguardando_linha" }).eq("id", ordem.id);
    await supabase.from("historico").insert({
      ordem_id: ordem.id,
      status_anterior: "em_mistura",
      status_novo: "aguardando_linha",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <FlaskConical className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Painel de Mistura</h1>
      </div>

      {/* Ordem em mistura */}
      {emMistura ? (
        <div className="bg-card rounded-xl border-2 border-status-mixing/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <StatusBadge status="em_mistura" />
            <span className="text-sm text-muted-foreground">Lote {emMistura.lote}</span>
          </div>
          <div className="text-xl font-bold leading-tight">{emMistura.produto}</div>
          <div className="text-4xl font-extrabold text-primary">
            {emMistura.quantidade} <span className="text-lg font-semibold text-muted-foreground">kg</span>
          </div>

          {emMistura.tamanho_batelada && emMistura.tamanho_batelada > 0 && (
            <div className="text-sm font-medium text-muted-foreground">
              <span className="text-foreground font-bold">
                {Math.round(emMistura.quantidade / emMistura.tamanho_batelada)}
              </span>{' '}
              batelada{Math.round(emMistura.quantidade / emMistura.tamanho_batelada) !== 1 ? 's' : ''} de{' '}
              <span className="text-foreground font-bold">{emMistura.tamanho_batelada} kg</span> cada
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Linha destino: <span className="font-semibold text-foreground">{emMistura.linha}</span>
          </div>

          {emMistura.obs && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">⚠ Observações</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{emMistura.obs}</p>
            </div>
          )}

          {loadingFormula && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando fórmula...
            </div>
          )}

          {itens.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Fórmula: <span className="text-foreground">{emMistura.formula_id}</span>
                {emMistura.tamanho_batelada && (
                  <span className="ml-2">· Batelada: {emMistura.tamanho_batelada} kg</span>
                )}
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Seq</th>
                      <th className="text-left px-3 py-2">Matéria-Prima</th>
                      <th className="text-left px-3 py-2">Un</th>
                      <th className="text-right px-3 py-2">Qtd (kg)</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item, idx) => (
                      <tr
                        key={item.id}
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
                        <td className="px-3 py-2 text-muted-foreground">{item.unidade ?? '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{item.quantidade_kg}</td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            readOnly
                            checked={checkedItens.has(idx)}
                            className="h-4 w-4 accent-green-600 cursor-pointer"
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

          {(itens.length === 0 || checkedItens.size === itens.length) && !loadingFormula && (
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
      ) : (
        <div className="bg-card rounded-xl border p-6 text-center text-muted-foreground">
          Nenhuma ordem em mistura
        </div>
      )}

      {/* Fila aguardando mistura */}
      {aguardando.length > 0 && (
        <div>
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
                  <div className="text-xs text-muted-foreground">
                    Lote {ordem.lote} · {ordem.quantidade} kg · Linha {ordem.linha}
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
        <div className="bg-card rounded-xl border p-6 text-center text-muted-foreground">
          Nenhuma ordem aguardando mistura
        </div>
      )}
    </div>
  );
}
