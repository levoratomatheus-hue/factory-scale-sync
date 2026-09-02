import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil, Search, Users, ShieldAlert } from "lucide-react";

interface Perfil {
  id: string;
  nome: string;
  papel: string;
  balanca: string | null;
}

const PAPEIS: { value: string; label: string }[] = [
  { value: "gestor",        label: "Gestor" },
  { value: "diretoria",     label: "Diretoria" },
  { value: "operador",      label: "Operador" },
  { value: "tecnico",       label: "Técnico" },
  { value: "comercial",     label: "Comercial" },
  { value: "compras",       label: "Compras" },
  { value: "desenvolvimento", label: "Desenvolvimento" },
];

const PAPEL_LABEL: Record<string, string> = Object.fromEntries(PAPEIS.map((p) => [p.value, p.label]));

const ESTACOES: { value: string; label: string }[] = [
  { value: "1",      label: "Balança 1" },
  { value: "2",      label: "Balança 2" },
  { value: "mistura", label: "Mistura" },
  { value: "linha1", label: "Linha 1" },
  { value: "linha2", label: "Linha 2" },
  { value: "linha3", label: "Linha 3" },
  { value: "linha4", label: "Linha 4" },
  { value: "linha5", label: "Linha 5" },
];

const ESTACAO_LABEL: Record<string, string> = Object.fromEntries(ESTACOES.map((e) => [e.value, e.label]));

const emptyForm = { nome: "", email: "", senha: "", papel: "", balanca: "" };

function validarEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function CadastroUsuarios({ perfilAtual }: { perfilAtual: string }) {
  // ── Lista ──────────────────────────────────────────────────────────────
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroPapel, setFiltroPapel] = useState("todos");

  const fetchUsuarios = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("perfis")
      .select("id, nome, papel, balanca")
      .order("nome", { ascending: true });
    if (!error) setUsuarios(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsuarios(); }, [fetchUsuarios]);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return usuarios.filter((u) => {
      const matchBusca = !termo || u.nome.toLowerCase().includes(termo);
      const matchPapel = filtroPapel === "todos" || u.papel === filtroPapel;
      return matchBusca && matchPapel;
    });
  }, [usuarios, busca, filtroPapel]);

  // ── Formulário novo usuário ────────────────────────────────────────────
  const [form, setForm] = useState(emptyForm);
  const [criando, setCriando] = useState(false);

  function setField(campo: keyof typeof emptyForm, valor: string) {
    setForm((prev) => {
      const next = { ...prev, [campo]: valor };
      // Ao mudar papel: limpar balança se não for operador
      if (campo === "papel" && valor !== "operador") {
        next.balanca = "";
      }
      return next;
    });
  }

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" }); return;
    }
    if (!validarEmail(form.email)) {
      toast({ title: "Email inválido", variant: "destructive" }); return;
    }
    if (form.senha.length < 6) {
      toast({ title: "Senha deve ter ao menos 6 caracteres", variant: "destructive" }); return;
    }
    if (!form.papel) {
      toast({ title: "Selecione o papel", variant: "destructive" }); return;
    }
    if (form.papel === "operador" && !form.balanca) {
      toast({ title: "Selecione a estação do operador", variant: "destructive" }); return;
    }

    setCriando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/criar-usuario`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: form.email.trim().toLowerCase(),
            senha: form.senha,
            nome: form.nome.trim(),
            papel: form.papel,
            balanca: form.papel === "operador" ? form.balanca : null,
          }),
        }
      );

      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Erro ao criar usuário", description: body.error, variant: "destructive" });
        return;
      }

      toast({ title: `Usuário "${form.nome.trim()}" criado com sucesso!` });
      setForm(emptyForm);
      fetchUsuarios();
    } catch (err) {
      toast({ title: "Erro inesperado", description: String(err), variant: "destructive" });
    } finally {
      setCriando(false);
    }
  }

  // ── Editar usuário existente ───────────────────────────────────────────
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", papel: "", balanca: "" });
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  function abrirEdicao(u: Perfil) {
    setEditando(u);
    setEditForm({ nome: u.nome, papel: u.papel, balanca: u.balanca ?? "" });
  }

  function setEditField(campo: keyof typeof editForm, valor: string) {
    setEditForm((prev) => {
      const next = { ...prev, [campo]: valor };
      if (campo === "papel" && valor !== "operador") next.balanca = "";
      return next;
    });
  }

  async function salvarEdicao() {
    if (!editando) return;
    if (!editForm.nome.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" }); return;
    }
    if (!editForm.papel) {
      toast({ title: "Selecione o papel", variant: "destructive" }); return;
    }
    if (editForm.papel === "operador" && !editForm.balanca) {
      toast({ title: "Selecione a estação do operador", variant: "destructive" }); return;
    }

    setSalvandoEdit(true);
    const { error } = await (supabase as any)
      .from("perfis")
      .update({
        nome: editForm.nome.trim(),
        papel: editForm.papel,
        balanca: editForm.papel === "operador" ? editForm.balanca || null : null,
      })
      .eq("id", editando.id);
    setSalvandoEdit(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Usuário atualizado" });
    setEditando(null);
    fetchUsuarios();
  }

  // ── Guard de acesso ────────────────────────────────────────────────────
  if (!["gestor", "diretoria"].includes(perfilAtual)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p className="text-sm">Acesso restrito a gestores e diretoria.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Cadastro de Usuários</h2>
          <p className="text-sm text-muted-foreground">Crie e gerencie os acessos ao sistema</p>
        </div>
      </div>

      {/* ── Formulário de novo usuário ─────────────────────────────────── */}
      <form onSubmit={handleCriar} className="bg-card rounded-lg border p-6 space-y-5">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo Usuário
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome *</label>
            <Input
              value={form.nome}
              onChange={(e) => setField("nome", e.target.value)}
              placeholder="Nome completo"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email *</label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="usuario@empresa.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Senha inicial *</label>
            <Input
              type="password"
              value={form.senha}
              onChange={(e) => setField("senha", e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Papel *</label>
            <Select value={form.papel} onValueChange={(v) => setField("papel", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o papel..." />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.papel === "operador" && (
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Estação *</label>
              <Select value={form.balanca} onValueChange={(v) => setField("balanca", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a estação..." />
                </SelectTrigger>
                <SelectContent>
                  {ESTACOES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={criando} className="gap-2">
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar Usuário
          </Button>
        </div>
      </form>

      {/* ── Lista de usuários ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome..."
              className="pl-8"
            />
          </div>
          <Select value={filtroPapel} onValueChange={setFiltroPapel}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Papel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os papéis</SelectItem>
              {PAPEIS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold">Papel</th>
                  <th className="px-4 py-3 text-left font-semibold">Estação</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      {usuarios.length === 0 ? "Nenhum usuário cadastrado." : "Nenhum usuário encontrado."}
                    </td>
                  </tr>
                )}
                {usuariosFiltrados.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{u.nome}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                        {PAPEL_LABEL[u.papel] ?? u.papel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.balanca ? ESTACAO_LABEL[u.balanca] ?? u.balanca : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEdicao(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Dialog de edição ──────────────────────────────────────────── */}
      <Dialog open={!!editando} onOpenChange={(o) => { if (!o) setEditando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={editForm.nome}
                onChange={(e) => setEditField("nome", e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Papel *</label>
              <Select value={editForm.papel} onValueChange={(v) => setEditField("papel", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o papel..." />
                </SelectTrigger>
                <SelectContent>
                  {PAPEIS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editForm.papel === "operador" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Estação *</label>
                <Select value={editForm.balanca} onValueChange={(v) => setEditField("balanca", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a estação..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTACOES.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdit}>
              {salvandoEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
