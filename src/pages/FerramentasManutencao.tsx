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
import { Loader2, Hammer, Pencil, Trash2, Plus, MapPin, Search, ArrowLeftRight, Undo2, History } from "lucide-react";

type StatusFerramenta = "disponivel" | "em_uso" | "manutencao" | "emprestada";

interface Ferramenta {
  id: string;
  nome: string;
  codigo: string | null;
  localizacao: string | null;
  status: StatusFerramenta;
  criado_em: string | null;
}

interface Localizacao {
  id: string;
  nome: string;
}

interface Emprestimo {
  id: string;
  ferramenta_id: string;
  ferramenta_nome: string;
  emprestado_para: string;
  data_emprestimo: string | null;
  devolvido: boolean;
  data_devolucao: string | null;
  registrado_por: string | null;
  criado_em: string | null;
}

// ── formatação de datas no fuso SP ───────────────────────────────────────────

const _spFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});

function fmtDatetime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(/[Z+]/.test(iso) ? iso : iso + "Z");
  const parts = _spFmt.formatToParts(d);
  const g = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(/[Z+]/.test(iso) ? iso : iso + "Z");
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

function hojeLocal(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

// ── configs ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  disponivel: { label: "Disponível",  class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700" },
  em_uso:     { label: "Em Uso",      class: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700" },
  manutencao: { label: "Manutenção",  class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700" },
  emprestada: { label: "Emprestada",  class: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700" },
};

const STATUS_FILTROS: { value: StatusFerramenta | "todos"; label: string }[] = [
  { value: "todos",      label: "Todas" },
  { value: "disponivel", label: "Disponível" },
  { value: "emprestada", label: "Emprestada" },
  { value: "em_uso",     label: "Em Uso" },
  { value: "manutencao", label: "Manutenção" },
];

const FORM_VAZIO = { nome: "", codigo: "", localizacao: "", status: "disponivel" as StatusFerramenta };

// perfis que podem emprestar / devolver
const PODE_EMPRESTAR = ["gestor", "tecnico", "diretoria"];

// ── props ─────────────────────────────────────────────────────────────────────

interface Props {
  papel: string;
  perfilNome: string;
}

// ── componente ────────────────────────────────────────────────────────────────

export default function FerramentasManutencao({ papel, perfilNome }: Props) {
  const [aba, setAba] = useState<"ferramentas" | "historico">("ferramentas");

  // --- ferramentas ---
  const [ferramentas, setFerramentas] = useState<Ferramenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusFerramenta | "todos">("todos");
  const [filtroLocalizacao, setFiltroLocalizacao] = useState("");
  const [busca, setBusca] = useState("");
  const [localizacoes, setLocalizacoes] = useState<Localizacao[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Ferramenta | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [saving, setSaving] = useState(false);

  const [modalLocalAberto, setModalLocalAberto] = useState(false);
  const [nomeLocal, setNomeLocal] = useState("");
  const [savingLocal, setSavingLocal] = useState(false);

  // --- empréstimos correntes (para exibir na lista de ferramentas) ---
  const [emprestimosAbertos, setEmprestimosAbertos] = useState<Record<string, Emprestimo>>({});
  const [emprestando, setEmprestando] = useState<Ferramenta | null>(null);
  const [emprestadoPara, setEmprestadoPara] = useState("");
  const [dataEmprestimo, setDataEmprestimo] = useState(hojeLocal());
  const [savingEmprestimo, setSavingEmprestimo] = useState(false);
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null);

  // --- histórico ---
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [filtroHistStatus, setFiltroHistStatus] = useState<"todos" | "aberto" | "devolvido">("todos");
  const [filtroHistFerramenta, setFiltroHistFerramenta] = useState("");
  const [filtroHistPessoa, setFiltroHistPessoa] = useState("");
  const [filtroHistInicio, setFiltroHistInicio] = useState("");
  const [filtroHistFim, setFiltroHistFim] = useState("");

  // ── fetches ───────────────────────────────────────────────────────────────

  const fetchFerramentas = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("ferramentas_manutencao")
      .select("*")
      .order("codigo", { ascending: true });
    if (error) toast({ title: "Erro ao carregar ferramentas", description: error.message, variant: "destructive" });
    else setFerramentas(data ?? []);
    setLoading(false);
  }, []);

  const fetchLocalizacoes = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("localizacoes_ferramentas")
      .select("id, nome")
      .order("nome", { ascending: true });
    setLocalizacoes(data ?? []);
  }, []);

  const fetchEmprestimosAbertos = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("emprestimos_ferramentas")
      .select("*")
      .eq("devolvido", false);
    const map: Record<string, Emprestimo> = {};
    (data ?? []).forEach((e: Emprestimo) => { map[e.ferramenta_id] = e; });
    setEmprestimosAbertos(map);
  }, []);

  const fetchEmprestimos = useCallback(async () => {
    setLoadingHist(true);
    const { data, error } = await (supabase as any)
      .from("emprestimos_ferramentas")
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
    else setEmprestimos(data ?? []);
    setLoadingHist(false);
  }, []);

  useEffect(() => {
    fetchFerramentas();
    fetchLocalizacoes();
    fetchEmprestimosAbertos();
  }, [fetchFerramentas, fetchLocalizacoes, fetchEmprestimosAbertos]);

  useEffect(() => {
    if (aba === "historico") fetchEmprestimos();
  }, [aba, fetchEmprestimos]);

  // ── ações ferramentas ─────────────────────────────────────────────────────

  async function gerarProximoCodigo(): Promise<string> {
    const { data } = await (supabase as any)
      .from("ferramentas_manutencao")
      .select("codigo")
      .like("codigo", "FER-%")
      .order("codigo", { ascending: false })
      .limit(1);
    if (data && data.length > 0 && data[0].codigo) {
      const num = parseInt(data[0].codigo.replace("FER-", ""), 10);
      return `FER-${String(isNaN(num) ? 1 : num + 1).padStart(4, "0")}`;
    }
    return "FER-0001";
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
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      codigo: form.codigo.trim() || null,
      localizacao: form.localizacao || null,
      status: form.status,
    };
    if (editando) {
      const { error } = await (supabase as any).from("ferramentas_manutencao").update(payload).eq("id", editando.id);
      setSaving(false);
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Ferramenta atualizada!" });
    } else {
      const { error } = await (supabase as any).from("ferramentas_manutencao").insert({ ...payload, criado_em: new Date().toISOString() });
      setSaving(false);
      if (error) { toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Ferramenta cadastrada!" });
    }
    fecharModal();
    fetchFerramentas();
  }

  async function excluir(f: Ferramenta) {
    if (!window.confirm(`Excluir "${f.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await (supabase as any).from("ferramentas_manutencao").delete().eq("id", f.id);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else { toast({ title: "Ferramenta excluída" }); fetchFerramentas(); }
  }

  async function salvarLocalizacao() {
    if (!nomeLocal.trim()) { toast({ title: "Informe o nome da localização", variant: "destructive" }); return; }
    setSavingLocal(true);
    const { error } = await (supabase as any).from("localizacoes_ferramentas").insert({ nome: nomeLocal.trim() });
    setSavingLocal(false);
    if (error) { toast({ title: "Erro ao cadastrar localização", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Localização cadastrada!" });
    setModalLocalAberto(false);
    setNomeLocal("");
    fetchLocalizacoes();
  }

  // ── ações empréstimo ──────────────────────────────────────────────────────

  async function confirmarEmprestimo() {
    if (!emprestando) return;
    if (!emprestadoPara.trim()) { toast({ title: "Informe para quem vai emprestar", variant: "destructive" }); return; }
    setSavingEmprestimo(true);
    const dataISO = new Date(`${dataEmprestimo}T12:00:00-03:00`).toISOString();
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      (supabase as any).from("emprestimos_ferramentas").insert({
        ferramenta_id: emprestando.id,
        ferramenta_nome: emprestando.nome,
        emprestado_para: emprestadoPara.trim(),
        data_emprestimo: dataISO,
        devolvido: false,
        registrado_por: perfilNome,
        criado_em: new Date().toISOString(),
      }),
      (supabase as any).from("ferramentas_manutencao").update({ status: "emprestada" }).eq("id", emprestando.id),
    ]);
    setSavingEmprestimo(false);
    if (e1 || e2) {
      toast({ title: "Erro ao registrar empréstimo", description: (e1 ?? e2)?.message, variant: "destructive" });
    } else {
      toast({ title: `Ferramenta emprestada para ${emprestadoPara.trim()}!` });
      setEmprestando(null);
      setEmprestadoPara("");
      setDataEmprestimo(hojeLocal());
      await Promise.all([fetchFerramentas(), fetchEmprestimosAbertos()]);
    }
  }

  async function devolver(ferramenta: Ferramenta) {
    const aberto = emprestimosAbertos[ferramenta.id];
    if (!aberto) { toast({ title: "Nenhum empréstimo em aberto encontrado", variant: "destructive" }); return; }
    setDevolvendoId(ferramenta.id);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      (supabase as any).from("emprestimos_ferramentas").update({
        devolvido: true,
        data_devolucao: new Date().toISOString(),
      }).eq("id", aberto.id),
      (supabase as any).from("ferramentas_manutencao").update({ status: "disponivel" }).eq("id", ferramenta.id),
    ]);
    setDevolvendoId(null);
    if (e1 || e2) {
      toast({ title: "Erro ao registrar devolução", description: (e1 ?? e2)?.message, variant: "destructive" });
    } else {
      toast({ title: "Ferramenta devolvida!" });
      await Promise.all([fetchFerramentas(), fetchEmprestimosAbertos()]);
    }
  }

  // ── filtros ───────────────────────────────────────────────────────────────

  const buscaNorm = busca.trim().toLowerCase();
  const listaFiltrada = ferramentas.filter(f => {
    if (filtroStatus !== "todos" && f.status !== filtroStatus) return false;
    if (filtroLocalizacao && f.localizacao !== filtroLocalizacao) return false;
    if (buscaNorm && !f.nome.toLowerCase().includes(buscaNorm) && !(f.codigo ?? "").toLowerCase().includes(buscaNorm)) return false;
    return true;
  });

  const historicoFiltrado = useMemo(() => {
    let l = emprestimos;
    if (filtroHistStatus === "aberto") l = l.filter(e => !e.devolvido);
    else if (filtroHistStatus === "devolvido") l = l.filter(e => e.devolvido);
    if (filtroHistFerramenta.trim()) l = l.filter(e => e.ferramenta_nome.toLowerCase().includes(filtroHistFerramenta.trim().toLowerCase()));
    if (filtroHistPessoa.trim()) l = l.filter(e => e.emprestado_para.toLowerCase().includes(filtroHistPessoa.trim().toLowerCase()));
    if (filtroHistInicio) l = l.filter(e => e.data_emprestimo && e.data_emprestimo >= new Date(`${filtroHistInicio}T00:00:00-03:00`).toISOString());
    if (filtroHistFim) l = l.filter(e => e.data_emprestimo && e.data_emprestimo <= new Date(`${filtroHistFim}T23:59:59-03:00`).toISOString());
    return l;
  }, [emprestimos, filtroHistStatus, filtroHistFerramenta, filtroHistPessoa, filtroHistInicio, filtroHistFim]);

  const emAberto = useMemo(() => emprestimos.filter(e => !e.devolvido).length, [emprestimos]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setNomeLocal(""); setModalLocalAberto(true); }} className="gap-2">
              <MapPin className="h-4 w-4" />
              + Localização
            </Button>
            <Button onClick={abrirCadastro} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Ferramenta
            </Button>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-0 border-b">
        <button
          onClick={() => setAba("ferramentas")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === "ferramentas" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Hammer className="h-3.5 w-3.5" />
          Ferramentas
        </button>
        <button
          onClick={() => setAba("historico")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            aba === "historico" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Histórico de Empréstimos
          {emAberto > 0 && (
            <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {emAberto}
            </span>
          )}
        </button>
      </div>

      {/* ── ABA FERRAMENTAS ─────────────────────────────────────────────────── */}
      {aba === "ferramentas" && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por nome ou código..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              value={filtroLocalizacao}
              onChange={(e) => setFiltroLocalizacao(e.target.value)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todas as localizações</option>
              {localizacoes.map(loc => (
                <option key={loc.id} value={loc.nome}>{loc.nome}</option>
              ))}
            </select>
          </div>

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

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
              {ferramentas.length === 0 ? "Nenhuma ferramenta cadastrada." : "Nenhuma ferramenta com este filtro."}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Código</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nome</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Localização</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empréstimo</th>
                    <th className="px-3 py-2 w-36" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listaFiltrada.map(f => {
                    const st = STATUS_CONFIG[f.status] ?? STATUS_CONFIG.disponivel;
                    const aberto = emprestimosAbertos[f.id];
                    const devolvendoEste = devolvendoId === f.id;
                    return (
                      <tr key={f.id} className={`bg-card hover:bg-muted/30 transition-colors ${f.status === "emprestada" ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs text-muted-foreground">{f.codigo ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 font-medium">{f.nome}</td>
                        <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">
                          {f.localizacao ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {f.localizacao}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${st.class}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {aberto ? (
                            <div className="text-xs">
                              <p className="font-medium text-foreground">{aberto.emprestado_para}</p>
                              <p className="text-muted-foreground">desde {fmtDate(aberto.data_emprestimo)}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 justify-end flex-wrap">
                            {f.status === "disponivel" && PODE_EMPRESTAR.includes(papel) && (
                              <button
                                onClick={() => { setEmprestando(f); setEmprestadoPara(""); setDataEmprestimo(hojeLocal()); }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/40 transition-colors"
                              >
                                <ArrowLeftRight className="h-3 w-3" />
                                Emprestar
                              </button>
                            )}
                            {f.status === "emprestada" && PODE_EMPRESTAR.includes(papel) && (
                              <button
                                onClick={() => devolver(f)}
                                disabled={devolvendoEste}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50"
                              >
                                {devolvendoEste ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                                Devolver
                              </button>
                            )}
                            {papel === "gestor" && (
                              <>
                                <button onClick={() => abrirEdicao(f)} title="Editar"
                                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => excluir(f)} title="Excluir"
                                  className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── ABA HISTÓRICO ───────────────────────────────────────────────────── */}
      {aba === "historico" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="rounded-xl border bg-muted/30 dark:bg-muted/10 px-4 py-3 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">Status</span>
              <div className="flex gap-1.5">
                {([
                  { v: "todos",     l: "Todos" },
                  { v: "aberto",    l: "Em aberto" },
                  { v: "devolvido", l: "Devolvidos" },
                ] as const).map(({ v, l }) => (
                  <button
                    key={v}
                    onClick={() => setFiltroHistStatus(v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      filtroHistStatus === v
                        ? v === "aberto"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={filtroHistFerramenta}
                  onChange={(e) => setFiltroHistFerramenta(e.target.value)}
                  placeholder="Ferramenta..."
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={filtroHistPessoa}
                  onChange={(e) => setFiltroHistPessoa(e.target.value)}
                  placeholder="Pessoa..."
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="date"
                  value={filtroHistInicio}
                  onChange={(e) => setFiltroHistInicio(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="date"
                  value={filtroHistFim}
                  onChange={(e) => setFiltroHistFim(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {loadingHist ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : historicoFiltrado.length === 0 ? (
            <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
              Nenhum registro encontrado.
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ferramenta</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Emprestado para</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Data empréstimo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Status</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Devolução</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historicoFiltrado.map(e => (
                    <tr
                      key={e.id}
                      className={`bg-card transition-colors ${
                        !e.devolvido
                          ? "bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-3 py-2.5 font-medium">{e.ferramenta_nome}</td>
                      <td className="px-3 py-2.5">{e.emprestado_para}</td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{fmtDatetime(e.data_emprestimo)}</td>
                      <td className="px-3 py-2.5">
                        {e.devolvido ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700">
                            Devolvido
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700">
                            Em aberto
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{fmtDatetime(e.data_devolucao)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground hidden lg:table-cell">{e.registrado_por ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Dialog: Emprestar ─────────────────────────────────────────────────── */}
      <Dialog open={!!emprestando} onOpenChange={(o) => { if (!o) { setEmprestando(null); setEmprestadoPara(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Emprestar Ferramenta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {emprestando && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{emprestando.nome}</span>
                {emprestando.codigo && <span className="ml-1.5 font-mono text-xs">({emprestando.codigo})</span>}
              </p>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Emprestado para *</label>
              <Input
                value={emprestadoPara}
                onChange={(e) => setEmprestadoPara(e.target.value)}
                placeholder="Nome de quem vai levar..."
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") confirmarEmprestimo(); }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data do empréstimo</label>
              <input
                type="date"
                value={dataEmprestimo}
                onChange={(e) => setDataEmprestimo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEmprestando(null); setEmprestadoPara(""); }}>Cancelar</Button>
            <Button onClick={confirmarEmprestimo} disabled={savingEmprestimo} className="gap-2 bg-amber-500 hover:bg-amber-600 text-white">
              {savingEmprestimo && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar empréstimo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: cadastro / edição de ferramenta ─────────────────────────── */}
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
              {!editando && <p className="text-xs text-muted-foreground">Gerado automaticamente</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Localização</label>
              <select
                value={form.localizacao}
                onChange={(e) => setForm(f => ({ ...f, localizacao: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione a localização...</option>
                {localizacoes.map(loc => (
                  <option key={loc.id} value={loc.nome}>{loc.nome}</option>
                ))}
              </select>
              {localizacoes.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma localização cadastrada. Use "+ Localização" no topo.</p>
              )}
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

      {/* Dialog: nova localização ─────────────────────────────────────────── */}
      <Dialog open={modalLocalAberto} onOpenChange={(o) => { if (!o) { setModalLocalAberto(false); setNomeLocal(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Localização</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nome *</label>
              <Input
                value={nomeLocal}
                onChange={(e) => setNomeLocal(e.target.value)}
                placeholder="Ex: Caixa A - Prateleira 2"
                onKeyDown={(e) => { if (e.key === "Enter") salvarLocalizacao(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalLocalAberto(false); setNomeLocal(""); }}>Cancelar</Button>
            <Button onClick={salvarLocalizacao} disabled={savingLocal} className="gap-2">
              {savingLocal && <Loader2 className="h-4 w-4 animate-spin" />}
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
