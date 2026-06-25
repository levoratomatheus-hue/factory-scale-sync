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
import { Loader2, Hammer, Pencil, Trash2, Plus, MapPin } from "lucide-react";

type StatusFerramenta = "disponivel" | "em_uso" | "manutencao";

interface Ferramenta {
  id: string;
  nome: string;
  codigo: string | null;
  localizacao: string | null;
  status: StatusFerramenta;
  criado_em: string | null;
}

const STATUS_CONFIG: Record<StatusFerramenta, { label: string; class: string }> = {
  disponivel: { label: "Disponível",  class: "bg-green-100 text-green-700 border-green-200" },
  em_uso:     { label: "Em Uso",      class: "bg-blue-100 text-blue-700 border-blue-200" },
  manutencao: { label: "Manutenção",  class: "bg-red-100 text-red-700 border-red-200" },
};

const STATUS_FILTROS: { value: StatusFerramenta | "todos"; label: string }[] = [
  { value: "todos",      label: "Todos" },
  { value: "disponivel", label: "Disponível" },
  { value: "em_uso",     label: "Em Uso" },
  { value: "manutencao", label: "Manutenção" },
];

const FORM_VAZIO = { nome: "", codigo: "", localizacao: "", status: "disponivel" as StatusFerramenta };

interface Props {
  papel: string;
}

export default function FerramentasManutencao({ papel }: Props) {
  const [ferramentas, setFerramentas] = useState<Ferramenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusFerramenta | "todos">("todos");

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Ferramenta | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  const fetchFerramentas = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("ferramentas_manutencao")
      .select("*")
      .order("codigo", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar ferramentas", description: error.message, variant: "destructive" });
    } else {
      setFerramentas(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFerramentas(); }, [fetchFerramentas]);

  async function gerarProximoCodigo(): Promise<string> {
    const { data } = await (supabase as any)
      .from("ferramentas_manutencao")
      .select("codigo")
      .like("codigo", "FER%")
      .order("codigo", { ascending: false })
      .limit(1);
    if (data && data.length > 0 && data[0].codigo) {
      const num = parseInt(data[0].codigo.replace("FER", ""), 10);
      return `FER${String(isNaN(num) ? 1 : num + 1).padStart(4, "0")}`;
    }
    return "FER0001";
  }

  async function abrirCadastro() {
    const proximo = await gerarProximoCodigo();
    setEditando(null);
    setForm({ ...FORM_VAZIO, codigo: proximo });
    setModalAberto(true);
  }

  function abrirEdicao(f: Ferramenta) {
    setEditando(f);
    setForm({ nome: f.nome, codigo: f.codigo ?? "", localizacao: f.localizacao ?? "", status: f.status });
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setForm(FORM_VAZIO);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      codigo: form.codigo.trim() || null,
      localizacao: form.localizacao.trim() || null,
      status: form.status,
    };

    if (editando) {
      const { error } = await (supabase as any)
        .from("ferramentas_manutencao")
        .update(payload)
        .eq("id", editando.id);
      setSaving(false);
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Ferramenta atualizada!" });
    } else {
      const { error } = await (supabase as any)
        .from("ferramentas_manutencao")
        .insert({ ...payload, criado_em: new Date().toISOString() });
      setSaving(false);
      if (error) { toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Ferramenta cadastrada!" });
    }

    fecharModal();
    fetchFerramentas();
  }

  async function excluir(f: Ferramenta) {
    if (!window.confirm(`Excluir "${f.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await (supabase as any)
      .from("ferramentas_manutencao")
      .delete()
      .eq("id", f.id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else { toast({ title: "Ferramenta excluída" }); fetchFerramentas(); }
  }

  const listaFiltrada = filtroStatus === "todos"
    ? ferramentas
    : ferramentas.filter(f => f.status === filtroStatus);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Hammer className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Ferramentas</h2>
            <p className="text-sm text-muted-foreground">{ferramentas.length} ferramenta{ferramentas.length !== 1 ? "s" : ""} cadastrada{ferramentas.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        {papel === "gestor" && (
          <Button onClick={abrirCadastro} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Ferramenta
          </Button>
        )}
      </div>

      {/* Filtro de status */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTROS.map(f => (
          <button
            key={f.value}
            onClick={() => setFiltroStatus(f.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              filtroStatus === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-input text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {f.label}
            {f.value !== "todos" && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                filtroStatus === f.value ? "bg-white/20" : "bg-muted"
              }`}>
                {ferramentas.filter(x => x.status === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
          {ferramentas.length === 0 ? "Nenhuma ferramenta cadastrada." : "Nenhuma ferramenta com este status."}
        </div>
      ) : (
        <div className="space-y-2">
          {listaFiltrada.map(f => {
            const st = STATUS_CONFIG[f.status];
            return (
              <div key={f.id} className="bg-card rounded-lg border p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{f.nome}</span>
                    {f.codigo && (
                      <span className="font-mono text-xs border rounded px-1.5 py-0.5 text-muted-foreground">
                        {f.codigo}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${st.class}`}>
                      {st.label}
                    </span>
                  </div>
                  {f.localizacao && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {f.localizacao}
                    </p>
                  )}
                </div>
                {papel === "gestor" && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => abrirEdicao(f)}
                      title="Editar"
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => excluir(f)}
                      title="Excluir"
                      className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal cadastro / edição */}
      <Dialog open={modalAberto} onOpenChange={(o) => { if (!o) fecharModal(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Ferramenta" : "Nova Ferramenta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={form.nome}
                onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Chave de fenda Phillips, Multímetro..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Código</label>
              <Input
                value={form.codigo}
                onChange={(e) => editando ? setForm(f => ({ ...f, codigo: e.target.value })) : undefined}
                readOnly={!editando}
                className={!editando ? "bg-muted text-muted-foreground cursor-default" : ""}
              />
              {!editando && (
                <p className="text-xs text-muted-foreground">Gerado automaticamente</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Localização</label>
              <Input
                value={form.localizacao}
                onChange={(e) => setForm(f => ({ ...f, localizacao: e.target.value }))}
                placeholder="Ex: Caixa A - Prateleira 2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <div className="flex gap-2 flex-wrap">
                {(["disponivel", "em_uso", "manutencao"] as StatusFerramenta[]).map(s => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, status: s }))}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all ${
                        form.status === s
                          ? `${cfg.class} ring-2 ring-offset-1 ring-current`
                          : "bg-background border-input text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
