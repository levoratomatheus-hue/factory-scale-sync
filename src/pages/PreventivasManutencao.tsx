import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Wrench, ChevronDown, X } from "lucide-react";

type Equipamento = { id: string; nome: string; tag: string | null; linha: number | null; setor: string | null; status: string | null; tem_preventiva: boolean };

type Preventiva = {
  id: string;
  equipamento_id: string;
  nome: string;
  intervalo_valor: number;
  intervalo_unidade: "dias" | "semanas" | "meses";
  tarefas: string | null;
  responsavel: string | null;
  ultima_execucao: string | null;
  proxima_execucao: string | null;
  ativo: boolean;
};

const UNIDADES = [
  { v: "dias", label: "dias" },
  { v: "semanas", label: "semanas" },
  { v: "meses", label: "meses" },
] as const;

function calcProxima(ultima: string, valor: number, unidade: string): string {
  const d = new Date(ultima + "T00:00:00");
  if (unidade === "dias") d.setDate(d.getDate() + valor);
  else if (unidade === "semanas") d.setDate(d.getDate() + valor * 7);
  else if (unidade === "meses") d.setMonth(d.getMonth() + valor);
  return d.toISOString().split("T")[0];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return iso.split("T")[0].split("-").reverse().join("/");
}

function statusInfo(proxima: string | null) {
  if (!proxima) return { tipo: "sem" as const, label: "Sem data", dot: "bg-muted-foreground", text: "text-muted-foreground" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const p = new Date(proxima + "T00:00:00");
  const dias = Math.floor((p.getTime() - hoje.getTime()) / 86400000);
  if (dias < 0) return { tipo: "vencida" as const, label: `Vencida há ${Math.abs(dias)}d`, dot: "bg-red-500", text: "text-red-600 dark:text-red-400" };
  if (dias <= 7) return { tipo: "avencer" as const, label: dias === 0 ? "Vence hoje" : `Vence em ${dias}d`, dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { tipo: "emdia" as const, label: "Em dia", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
}

function resumoStatus(itens: Preventiva[]) {
  let vencidas = 0, avencer = 0;
  itens.forEach((p) => {
    const t = statusInfo(p.proxima_execucao).tipo;
    if (t === "vencida") vencidas++;
    else if (t === "avencer") avencer++;
  });
  return { vencidas, avencer };
}

const emptyForm = {
  equipamento_id: "",
  nome: "",
  intervalo_valor: "",
  intervalo_unidade: "meses" as "dias" | "semanas" | "meses",
  tarefas: "",
  responsavel: "",
  ultima_execucao: "",
};

export default function PreventivasManutencao() {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [preventivas, setPreventivas] = useState<Preventiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  // Dialog adicionar equipamento
  const [addEquipAberto, setAddEquipAberto] = useState(false);
  const [equipSel, setEquipSel] = useState("");

  // Dialog manutenção
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Preventiva | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [excluir, setExcluir] = useState<Preventiva | null>(null);

  async function fetchData() {
    setLoading(true);
    const [eq, pv] = await Promise.all([
      supabase.from("equipamentos").select("id, nome, tag, linha, setor, status, tem_preventiva").order("nome"),
      (supabase as any).from("manutencoes_preventivas").select("*").eq("ativo", true).order("proxima_execucao", { ascending: true }),
    ]);
    if (eq.data) setEquipamentos(eq.data as Equipamento[]);
    if (pv.data) setPreventivas(pv.data as Preventiva[]);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  const enrolled = useMemo(() => equipamentos.filter((e) => e.tem_preventiva), [equipamentos]);
  const disponiveis = useMemo(() => equipamentos.filter((e) => !e.tem_preventiva), [equipamentos]);

  const planosPorEquip = useMemo(() => {
    const map: Record<string, Preventiva[]> = {};
    preventivas.forEach((p) => { (map[p.equipamento_id] ??= []).push(p); });
    return map;
  }, [preventivas]);

  const labelEquip = (e: { nome?: string; tag?: string | null; linha?: number | null }) =>
    `${e.nome ?? "—"}${e.tag ? ` · ${e.tag}` : ""}${e.linha ? ` · Linha ${e.linha}` : ""}`;

  async function adicionarEquipamento() {
    if (!equipSel) { toast({ title: "Selecione o equipamento", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("equipamentos").update({ tem_preventiva: true } as any).eq("id", equipSel);
    setSaving(false);
    if (error) { toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Equipamento adicionado às preventivas" });
    setExpandido((s) => ({ ...s, [equipSel]: true }));
    setAddEquipAberto(false); setEquipSel("");
    fetchData();
  }

  async function removerEquipamento(e: Equipamento, qtdPlanos: number) {
    if (qtdPlanos > 0) { toast({ title: "Remova as manutenções antes de tirar o equipamento", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("equipamentos").update({ tem_preventiva: false } as any).eq("id", e.id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao remover", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Equipamento removido das preventivas" });
    fetchData();
  }

  function abrirNovaManutencao(equipamentoId: string) {
    setEditando(null);
    setForm({ ...emptyForm, equipamento_id: equipamentoId });
    setDialogAberto(true);
  }

  function abrirEditar(p: Preventiva) {
    setEditando(p);
    setForm({
      equipamento_id: p.equipamento_id,
      nome: p.nome,
      intervalo_valor: String(p.intervalo_valor),
      intervalo_unidade: p.intervalo_unidade,
      tarefas: p.tarefas ?? "",
      responsavel: p.responsavel ?? "",
      ultima_execucao: p.ultima_execucao ?? "",
    });
    setDialogAberto(true);
  }

  async function salvar() {
    if (!form.nome.trim()) { toast({ title: "Informe o nome da manutenção", variant: "destructive" }); return; }
    const valor = parseInt(form.intervalo_valor);
    if (!valor || valor <= 0) { toast({ title: "Informe um intervalo válido", variant: "destructive" }); return; }
    if (!form.ultima_execucao) { toast({ title: "Informe a data da última manutenção", variant: "destructive" }); return; }

    const proxima = calcProxima(form.ultima_execucao, valor, form.intervalo_unidade);
    const payload = {
      equipamento_id: form.equipamento_id,
      nome: form.nome.trim(),
      intervalo_valor: valor,
      intervalo_unidade: form.intervalo_unidade,
      tarefas: form.tarefas.trim() || null,
      responsavel: form.responsavel.trim() || null,
      ultima_execucao: form.ultima_execucao,
      proxima_execucao: proxima,
    };

    setSaving(true);
    if (editando) {
      const { error } = await (supabase as any).from("manutencoes_preventivas").update(payload).eq("id", editando.id);
      setSaving(false);
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Manutenção atualizada" });
    } else {
      const { error } = await (supabase as any).from("manutencoes_preventivas").insert(payload);
      setSaving(false);
      if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Manutenção cadastrada" });
    }
    setDialogAberto(false);
    setForm({ ...emptyForm });
    setEditando(null);
    fetchData();
  }

  async function confirmarExcluir() {
    if (!excluir) return;
    setSaving(true);
    const { error } = await (supabase as any).from("manutencoes_preventivas").delete().eq("id", excluir.id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Manutenção excluída" });
    setExcluir(null);
    fetchData();
  }

  const equipDoForm = equipamentos.find((e) => e.id === form.equipamento_id);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6" /> Preventivas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manutenções programadas por equipamento</p>
        </div>
        <Button onClick={() => setAddEquipAberto(true)}><Plus className="h-4 w-4 mr-1" /> Adicionar equipamento</Button>
      </div>

      {enrolled.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 border rounded-xl text-sm">
          Nenhum equipamento nas preventivas. Clique em <span className="font-medium text-foreground">"Adicionar equipamento"</span> para começar.
        </div>
      ) : (
        <div className="space-y-2.5">
          {enrolled.map((equip) => {
            const itens = planosPorEquip[equip.id] ?? [];
            const aberto = expandido[equip.id] ?? true;
            const resumo = resumoStatus(itens);
            const accent = resumo.vencidas > 0 ? "border-l-red-500" : resumo.avencer > 0 ? "border-l-amber-500" : itens.length ? "border-l-emerald-500" : "border-l-transparent";
            const meta = [equip.tag, equip.linha ? `Linha ${equip.linha}` : null, equip.setor].filter(Boolean).join(" · ");
            return (
              <div key={equip.id} className={`rounded-lg border border-l-[3px] ${accent} bg-card overflow-hidden`}>
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <button onClick={() => setExpandido((s) => ({ ...s, [equip.id]: !aberto }))} className="flex items-center gap-2.5 min-w-0 text-left">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${aberto ? "" : "-rotate-90"}`} />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm leading-tight truncate">{equip.nome}</div>
                      {meta && <div className="text-[11px] text-muted-foreground truncate">{meta}</div>}
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {resumo.vencidas > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{resumo.vencidas} vencida{resumo.vencidas > 1 ? "s" : ""}</span>}
                    {resumo.avencer > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{resumo.avencer} a vencer</span>}
                    {itens.length > 0 && resumo.vencidas === 0 && resumo.avencer === 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Em dia</span>}
                    <span className="text-[11px] text-muted-foreground tabular-nums">{itens.length}</span>
                    {itens.length === 0 && (
                      <button onClick={() => removerEquipamento(equip, itens.length)} title="Remover equipamento" className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>

                {aberto && (
                  <div className="border-t border-border/60">
                    {itens.length === 0 ? (
                      <div className="px-3.5 py-2.5 text-xs text-muted-foreground">Nenhuma manutenção ainda.</div>
                    ) : itens.map((p) => {
                      const st = statusInfo(p.proxima_execucao);
                      const meta2 = [`a cada ${p.intervalo_valor} ${p.intervalo_unidade}`, `última ${fmt(p.ultima_execucao)}`, p.responsavel].filter(Boolean).join(" · ");
                      return (
                        <div key={p.id} className="group flex items-center justify-between gap-3 px-3.5 py-2 border-t border-border/40 first:border-t-0 hover:bg-muted/40">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${st.dot}`} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-tight truncate">{p.nome}</div>
                              <div className="text-[11px] text-muted-foreground truncate">{meta2}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right leading-tight">
                              <div className={`text-xs font-semibold ${st.text}`}>{st.label}</div>
                              <div className="text-[11px] text-muted-foreground">{fmt(p.proxima_execucao)}</div>
                            </div>
                            <div className="flex gap-0.5 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => abrirEditar(p)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setExcluir(p)} className="p-1.5 rounded-md hover:bg-muted text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="px-3.5 py-2 border-t border-border/40">
                      <button onClick={() => abrirNovaManutencao(equip.id)} className="w-full text-xs font-medium text-muted-foreground hover:text-primary border border-dashed border-border rounded-md py-1.5 transition-colors flex items-center justify-center gap-1">
                        <Plus className="h-3.5 w-3.5" /> Adicionar manutenção
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog adicionar equipamento */}
      <Dialog open={addEquipAberto} onOpenChange={(o) => { if (!o) { setAddEquipAberto(false); setEquipSel(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar equipamento às preventivas</DialogTitle>
            <DialogDescription>Escolha um equipamento do cadastro. Depois você adiciona as manutenções dentro dele.</DialogDescription>
          </DialogHeader>
          <div className="py-1">
            <Select value={equipSel} onValueChange={setEquipSel}>
              <SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
              <SelectContent>
                {disponiveis.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Todos os equipamentos já estão nas preventivas.</div>
                ) : disponiveis.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{labelEquip(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEquipAberto(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={adicionarEquipamento} disabled={saving || !equipSel}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog manutenção (equipamento já fixo) */}
      <Dialog open={dialogAberto} onOpenChange={(o) => { if (!o) { setDialogAberto(false); setEditando(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar manutenção" : "Nova manutenção"}</DialogTitle>
            <DialogDescription>{equipDoForm ? labelEquip(equipDoForm) : ""} — a próxima data é calculada (última + intervalo).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Manutenção *</label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Troca de óleo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">A cada *</label>
                <Input type="number" min="1" value={form.intervalo_valor} onChange={(e) => setForm((f) => ({ ...f, intervalo_valor: e.target.value }))} placeholder="Ex.: 3" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Unidade</label>
                <Select value={form.intervalo_unidade} onValueChange={(v) => setForm((f) => ({ ...f, intervalo_unidade: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIDADES.map((u) => <SelectItem key={u.v} value={u.v}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Última manutenção *</label>
              <Input type="date" value={form.ultima_execucao} onChange={(e) => setForm((f) => ({ ...f, ultima_execucao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Responsável</label>
              <Input value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tarefas / checklist</label>
              <Textarea value={form.tarefas} onChange={(e) => setForm((f) => ({ ...f, tarefas: e.target.value }))} placeholder="Uma tarefa por linha (opcional)" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog excluir */}
      <Dialog open={!!excluir} onOpenChange={(o) => { if (!o) setExcluir(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir manutenção?</DialogTitle>
            <DialogDescription>{excluir?.nome} — esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluir(null)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarExcluir} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
