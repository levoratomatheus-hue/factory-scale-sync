import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, Package, Plus, AlertTriangle, ArrowDownCircle,
  ArrowUpCircle, History, RefreshCw,
} from "lucide-react";

interface EstoqueItem {
  id: string;
  nome: string;
  codigo: string | null;
  unidade: string;
  quantidade_atual: number;
  quantidade_minima: number;
  localizacao: string | null;
  criado_em: string;
}

interface Movimentacao {
  id: string;
  item_id: string;
  tipo: "entrada" | "saida";
  quantidade: number;
  motivo: string | null;
  os_id: string | null;
  criado_por: string | null;
  criado_em: string;
}

const UNIDADES = ["un", "kg", "g", "L", "mL", "m", "cm", "pç", "cx", "par", "rolo"];

interface Props {
  papel: string;
  perfilNome: string;
}

export default function EstoqueManutencao({ papel, perfilNome }: Props) {
  const [items, setItems] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal cadastro
  const [modalCadastro, setModalCadastro] = useState(false);
  const [cadastroForm, setCadastroForm] = useState({
    nome: "", codigo: "", unidade: "un",
    quantidade_atual: "", quantidade_minima: "", localizacao: "",
  });
  const [savingCadastro, setSavingCadastro] = useState(false);

  // Modal movimentação
  const [modalMov, setModalMov] = useState<{ item: EstoqueItem; tipo: "entrada" | "saida" } | null>(null);
  const [movQtd, setMovQtd] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [savingMov, setSavingMov] = useState(false);

  // Modal histórico
  const [modalHist, setModalHist] = useState<EstoqueItem | null>(null);
  const [hist, setHist] = useState<Movimentacao[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const fetchItems = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("estoque_manutencao")
      .select("*")
      .order("nome", { ascending: true });
    if (!error) setItems(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel("estoque-manutencao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "estoque_manutencao" }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchItems]);

  async function salvarCadastro() {
    if (!cadastroForm.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" }); return;
    }
    const qtdAtual = parseFloat(cadastroForm.quantidade_atual) || 0;
    const qtdMin = parseFloat(cadastroForm.quantidade_minima) || 0;
    setSavingCadastro(true);
    const { error } = await (supabase as any).from("estoque_manutencao").insert({
      nome: cadastroForm.nome.trim(),
      codigo: cadastroForm.codigo.trim() || null,
      unidade: cadastroForm.unidade,
      quantidade_atual: qtdAtual,
      quantidade_minima: qtdMin,
      localizacao: cadastroForm.localizacao.trim() || null,
    });
    setSavingCadastro(false);
    if (error) { toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item cadastrado!" });
    setModalCadastro(false);
    setCadastroForm({ nome: "", codigo: "", unidade: "un", quantidade_atual: "", quantidade_minima: "", localizacao: "" });
  }

  async function salvarMovimentacao() {
    if (!modalMov) return;
    const qtd = parseFloat(movQtd);
    if (!qtd || qtd <= 0) {
      toast({ title: "Informe uma quantidade válida", variant: "destructive" }); return;
    }
    if (modalMov.tipo === "saida" && qtd > modalMov.item.quantidade_atual) {
      toast({ title: "Quantidade insuficiente em estoque", variant: "destructive" }); return;
    }
    setSavingMov(true);
    const novaQtd = modalMov.tipo === "entrada"
      ? modalMov.item.quantidade_atual + qtd
      : modalMov.item.quantidade_atual - qtd;

    const [movErr, updErr] = await Promise.all([
      (supabase as any).from("estoque_movimentacoes").insert({
        item_id: modalMov.item.id,
        tipo: modalMov.tipo,
        quantidade: qtd,
        motivo: movMotivo.trim() || null,
        criado_por: perfilNome,
      }).then((r: any) => r.error),
      (supabase as any).from("estoque_manutencao").update({ quantidade_atual: novaQtd })
        .eq("id", modalMov.item.id).then((r: any) => r.error),
    ]);

    setSavingMov(false);
    if (movErr || updErr) {
      toast({ title: "Erro na movimentação", variant: "destructive" }); return;
    }
    toast({ title: modalMov.tipo === "entrada" ? "Entrada registrada!" : "Saída registrada!" });
    setModalMov(null);
    setMovQtd(""); setMovMotivo("");
    fetchItems();
  }

  async function abrirHistorico(item: EstoqueItem) {
    setModalHist(item);
    setLoadingHist(true);
    const { data } = await (supabase as any)
      .from("estoque_movimentacoes")
      .select("*")
      .eq("item_id", item.id)
      .order("criado_em", { ascending: false });
    setHist(data ?? []);
    setLoadingHist(false);
  }

  const abaixoMinimo = items.filter(i => i.quantidade_atual <= i.quantidade_minima && i.quantidade_minima > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Estoque de Manutenção</h2>
            <p className="text-sm text-muted-foreground">{items.length} iten{items.length !== 1 ? "s" : ""} cadastrados</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchItems} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          {papel === "gestor" && (
            <Button size="sm" onClick={() => setModalCadastro(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Cadastrar Item
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de itens críticos */}
      {abaixoMinimo.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800 font-medium">
            {abaixoMinimo.length} iten{abaixoMinimo.length !== 1 ? "s" : ""} abaixo da quantidade mínima:{" "}
            {abaixoMinimo.map(i => i.nome).join(", ")}
          </p>
        </div>
      )}

      {/* Tabela */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          Nenhum item cadastrado no estoque
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs border-b">
                <th className="text-left px-4 py-2.5 font-medium">Item</th>
                <th className="text-left px-3 py-2.5 font-medium">Código</th>
                <th className="text-center px-3 py-2.5 font-medium">Qtd. Atual</th>
                <th className="text-center px-3 py-2.5 font-medium">Qtd. Mín.</th>
                <th className="text-left px-3 py-2.5 font-medium">Localização</th>
                <th className="text-right px-4 py-2.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const critico = item.quantidade_minima > 0 && item.quantidade_atual <= item.quantidade_minima;
                return (
                  <tr
                    key={item.id}
                    className={`border-t ${critico ? "bg-red-50" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {critico && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                        <span className={`font-medium ${critico ? "text-red-800" : ""}`}>{item.nome}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground font-mono text-xs">
                      {item.codigo ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold tabular-nums ${critico ? "text-red-700" : ""}`}>
                        {item.quantidade_atual}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">{item.unidade}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted-foreground tabular-nums">
                      {item.quantidade_minima} <span className="text-xs">{item.unidade}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {item.localizacao ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { setModalMov({ item, tipo: "entrada" }); setMovQtd(""); setMovMotivo(""); }}
                          title="Entrada"
                          className="p-1 rounded text-green-600 hover:bg-green-100 transition-colors"
                        >
                          <ArrowDownCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setModalMov({ item, tipo: "saida" }); setMovQtd(""); setMovMotivo(""); }}
                          title="Saída"
                          className="p-1 rounded text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => abrirHistorico(item)}
                          title="Histórico"
                          className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Cadastrar Item */}
      <Dialog open={modalCadastro} onOpenChange={(o) => { if (!o) setModalCadastro(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Item no Estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome *</label>
              <Input
                value={cadastroForm.nome}
                onChange={(e) => setCadastroForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Rolamento 6205"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Código</label>
                <Input
                  value={cadastroForm.codigo}
                  onChange={(e) => setCadastroForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="Ex: ROL-6205"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Unidade</label>
                <select
                  value={cadastroForm.unidade}
                  onChange={(e) => setCadastroForm(f => ({ ...f, unidade: e.target.value }))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Qtd. inicial</label>
                <Input
                  type="number" min="0"
                  value={cadastroForm.quantidade_atual}
                  onChange={(e) => setCadastroForm(f => ({ ...f, quantidade_atual: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Qtd. mínima</label>
                <Input
                  type="number" min="0"
                  value={cadastroForm.quantidade_minima}
                  onChange={(e) => setCadastroForm(f => ({ ...f, quantidade_minima: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Localização</label>
              <Input
                value={cadastroForm.localizacao}
                onChange={(e) => setCadastroForm(f => ({ ...f, localizacao: e.target.value }))}
                placeholder="Ex: Prateleira A3, Almoxarifado"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCadastro(false)}>Cancelar</Button>
            <Button onClick={salvarCadastro} disabled={savingCadastro}>
              {savingCadastro && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Movimentação */}
      <Dialog open={!!modalMov} onOpenChange={(o) => { if (!o) setModalMov(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {modalMov?.tipo === "entrada"
                ? <ArrowDownCircle className="h-5 w-5 text-green-600" />
                : <ArrowUpCircle className="h-5 w-5 text-red-600" />}
              {modalMov?.tipo === "entrada" ? "Entrada" : "Saída"} de Estoque
            </DialogTitle>
          </DialogHeader>
          {modalMov && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{modalMov.item.nome}</span>
                {" · "}Estoque atual:{" "}
                <span className="font-semibold">{modalMov.item.quantidade_atual} {modalMov.item.unidade}</span>
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Quantidade *</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="0.01" step="0.01"
                    value={movQtd}
                    onChange={(e) => setMovQtd(e.target.value)}
                    placeholder="0"
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">{modalMov.item.unidade}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Motivo</label>
                <Input
                  value={movMotivo}
                  onChange={(e) => setMovMotivo(e.target.value)}
                  placeholder={modalMov.tipo === "entrada" ? "Ex: Compra, devolução..." : "Ex: Manutenção preventiva..."}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMov(null)}>Cancelar</Button>
            <Button
              onClick={salvarMovimentacao}
              disabled={savingMov}
              className={modalMov?.tipo === "entrada"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"}
            >
              {savingMov && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Histórico */}
      <Dialog open={!!modalHist} onOpenChange={(o) => { if (!o) { setModalHist(null); setHist([]); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {modalHist?.nome}</DialogTitle>
          </DialogHeader>
          {loadingHist ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : hist.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma movimentação registrada
            </p>
          ) : (
            <div className="space-y-2 py-1">
              {hist.map((m) => (
                <div key={m.id} className="rounded-lg border px-3 py-2 text-sm flex items-start gap-3">
                  <div className={`mt-0.5 shrink-0 ${m.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                    {m.tipo === "entrada"
                      ? <ArrowDownCircle className="h-4 w-4" />
                      : <ArrowUpCircle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold ${m.tipo === "entrada" ? "text-green-700" : "text-red-700"}`}>
                        {m.tipo === "entrada" ? "+" : "-"}{m.quantidade} {modalHist?.unidade}
                      </span>
                      {m.os_id && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">via OS</span>
                      )}
                    </div>
                    {m.motivo && <p className="text-muted-foreground text-xs mt-0.5">{m.motivo}</p>}
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {format(new Date(m.criado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      {m.criado_por && ` · ${m.criado_por}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
