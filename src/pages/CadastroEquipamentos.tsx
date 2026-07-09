import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Loader2, Plus, Pencil, Settings, ToggleLeft, ToggleRight, Trash2, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Equipamento {
  id: string;
  nome: string;
  tag: string | null;
  linha: number | null;
  setor: string | null;
  status: string;
  criado_em: string | null;
}

const emptyForm = { nome: "", tag: "", linha: "", setor: "", status: "ativo" };

const SETORES = ["Produção", "Laboratório"] as const;
const SETOR_PREFIXO: Record<string, string> = {
  "Produção": "EQP",
  "Laboratório": "EQL",
};

export default function CadastroEquipamentos() {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Equipamento | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loadingTag, setLoadingTag] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Equipamento | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busca, setBusca] = useState("");
  const [setorFiltro, setSetorFiltro] = useState("todos");

  const fetchEquipamentos = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("equipamentos")
      .select("id, nome, tag, linha, setor, status, criado_em")
      .order("tag", { ascending: true, nullsFirst: false });
    if (!error) setEquipamentos(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEquipamentos(); }, [fetchEquipamentos]);

  async function buscarProximaTag(prefixo: string) {
    setLoadingTag(true);
    const { data } = await (supabase as any)
      .from("equipamentos")
      .select("tag")
      .ilike("tag", `${prefixo}-%`);
    setLoadingTag(false);
    let proximaTag: string;
    if (!data || data.length === 0) {
      proximaTag = `${prefixo}-001`;
    } else {
      const numeros = (data as { tag: string | null }[])
        .map((r) => {
          const partes = (r.tag ?? "").split("-");
          const num = parseInt(partes[partes.length - 1], 10);
          return isNaN(num) ? 0 : num;
        });
      const proximo = Math.max(...numeros) + 1;
      proximaTag = `${prefixo}-${String(proximo).padStart(3, "0")}`;
    }
    setForm((p) => ({ ...p, tag: proximaTag }));
  }

  function handleSetorChange(setor: string) {
    setForm((p) => ({ ...p, setor, tag: "" }));
    if (!editing) {
      const prefixo = SETOR_PREFIXO[setor];
      if (prefixo) buscarProximaTag(prefixo);
    }
  }

  function handleTagChange(valor: string) {
    setForm((p) => ({ ...p, tag: valor }));
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(eq: Equipamento) {
    setEditing(eq);
    setForm({
      nome: eq.nome,
      tag: eq.tag ?? "",
      linha: eq.linha != null ? String(eq.linha) : "",
      setor: eq.setor ?? "",
      status: eq.status,
    });
    setDialogOpen(true);
  }

  async function salvar() {
    if (!form.nome.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      tag: form.tag.trim() || null,
      linha: form.linha ? parseInt(form.linha) : null,
      setor: form.setor.trim() || null,
      status: form.status,
    };
    const { error } = editing
      ? await (supabase as any).from("equipamentos").update(payload).eq("id", editing.id)
      : await (supabase as any).from("equipamentos").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "Equipamento atualizado" : "Equipamento cadastrado" });
    setDialogOpen(false);
    fetchEquipamentos();
  }

  async function excluirEquipamento() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await (supabase as any)
      .from("equipamentos")
      .delete()
      .eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) {
      // FK violation — equipamento tem OS vinculada
      if (error.code === "23503") {
        toast({
          title: "Não é possível excluir",
          description: "Este equipamento possui Ordens de Serviço vinculadas. Exclua as OS antes de remover o equipamento.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      }
      setConfirmDelete(null);
      return;
    }
    toast({ title: "Equipamento excluído" });
    setConfirmDelete(null);
    setEquipamentos((prev) => prev.filter((e) => e.id !== confirmDelete.id));
  }

  async function toggleStatus(eq: Equipamento) {
    const novoStatus = eq.status === "ativo" ? "inativo" : "ativo";
    const { error } = await (supabase as any)
      .from("equipamentos")
      .update({ status: novoStatus })
      .eq("id", eq.id);
    if (error) toast({ title: "Erro ao alterar status", variant: "destructive" });
    else fetchEquipamentos();
  }

  const setoresDistintos = useMemo(() =>
    [...new Set(equipamentos.map((e) => e.setor).filter(Boolean) as string[])].sort(),
  [equipamentos]);

  const equipamentosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return equipamentos.filter((e) => {
      const matchBusca = !termo ||
        e.nome.toLowerCase().includes(termo) ||
        (e.tag ?? "").toLowerCase().includes(termo);
      const matchSetor = setorFiltro === "todos" || e.setor === setorFiltro;
      return matchBusca && matchSetor;
    });
  }, [equipamentos, busca, setorFiltro]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Equipamentos</h2>
            <p className="text-sm text-muted-foreground">
              {equipamentosFiltrados.length} de {equipamentos.length} equipamento{equipamentos.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Equipamento
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou TAG..."
            className="pl-8"
          />
        </div>
        <Select value={setorFiltro} onValueChange={setSetorFiltro}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Setor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os setores</SelectItem>
            {setoresDistintos.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-semibold">Nome</th>
              <th className="px-4 py-3 text-left font-semibold">Tag</th>
              <th className="px-4 py-3 text-left font-semibold">Linha</th>
              <th className="px-4 py-3 text-left font-semibold">Setor</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {equipamentosFiltrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {equipamentos.length === 0 ? "Nenhum equipamento cadastrado." : "Nenhum equipamento encontrado para os filtros aplicados."}
                </td>
              </tr>
            )}
            {equipamentosFiltrados.map((eq) => (
              <tr key={eq.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{eq.nome}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{eq.tag ?? "—"}</td>
                <td className="px-4 py-3">{eq.linha != null ? `L${eq.linha}` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{eq.setor ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                    eq.status === "ativo" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${eq.status === "ativo" ? "bg-green-500" : "bg-gray-400"}`} />
                    {eq.status === "ativo" ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(eq)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={`h-7 w-7 p-0 ${eq.status === "ativo" ? "text-green-600" : "text-muted-foreground"}`}
                      onClick={() => toggleStatus(eq)}
                    >
                      {eq.status === "ativo"
                        ? <ToggleRight className="h-4 w-4" />
                        : <ToggleLeft className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDelete(eq)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir equipamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-semibold text-foreground">{confirmDelete?.nome}</span>
              {confirmDelete?.tag && <> ({confirmDelete.tag})</>}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirEquipamento}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Extrusora Linha 1"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Setor</label>
              <Select value={form.setor} onValueChange={handleSetorChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o setor..." />
                </SelectTrigger>
                <SelectContent>
                  {SETORES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tag</label>
                <div className="relative">
                  <Input
                    value={form.tag}
                    onChange={(e) => handleTagChange(e.target.value)}
                    placeholder="EQP-001"
                  />
                  {!editing && loadingTag && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Linha</label>
                <Input
                  type="number"
                  value={form.linha}
                  onChange={(e) => setForm((p) => ({ ...p, linha: e.target.value }))}
                  placeholder="1"
                  min={1}
                  max={10}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <div className="flex gap-3">
                {["ativo", "inativo"].map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value={s}
                      checked={form.status === s}
                      onChange={() => setForm((p) => ({ ...p, status: s }))}
                      className="accent-primary"
                    />
                    <span className="text-sm capitalize">{s === "ativo" ? "Ativo" : "Inativo"}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
