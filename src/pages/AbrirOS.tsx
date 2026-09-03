import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Wrench, AlertTriangle, Building2,
  Layers, Settings2, FileText, Zap, Flag,
  CalendarClock, Phone, Building,
} from "lucide-react";

interface Equipamento {
  id: string;
  nome: string;
  tag: string | null;
  linha: number | null;
  setor: string | null;
}

interface AbrirOSProps {
  perfilNome: string;
  onSuccess?: () => void;
}

const PRIORIDADES = [
  {
    value: "baixa",
    label: "Baixa",
    active:   "bg-slate-600 text-white border-slate-600 dark:bg-slate-500 dark:border-slate-500",
    inactive: "border-border text-muted-foreground hover:border-slate-400 hover:text-slate-600 dark:hover:border-slate-500",
    dot: "bg-slate-400",
  },
  {
    value: "media",
    label: "Média",
    active:   "bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500",
    inactive: "border-border text-muted-foreground hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500",
    dot: "bg-blue-400",
  },
  {
    value: "alta",
    label: "Alta",
    active:   "bg-amber-500 text-white border-amber-500 dark:bg-amber-500 dark:border-amber-500",
    inactive: "border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600 dark:hover:border-amber-500",
    dot: "bg-amber-400",
  },
  {
    value: "critica",
    label: "Crítica",
    active:   "bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500",
    inactive: "border-border text-muted-foreground hover:border-red-400 hover:text-red-600 dark:hover:border-red-500",
    dot: "bg-red-500",
  },
];

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors";
const fieldCls  = "space-y-1";
const labelCls  = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const iconCls   = "h-3.5 w-3.5";

const SEM_SETOR = "__sem_setor__";

export default function AbrirOS({ perfilNome, onSuccess }: AbrirOSProps) {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loadingEquip, setLoadingEquip] = useState(true);
  const [setorSelecionado, setSetorSelecionado] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [tipo, setTipo] = useState<"corretiva" | "preventiva">("corretiva");
  const [externa, setExterna] = useState(false);
  const [empresaExterna, setEmpresaExterna] = useState("");
  const [contatoExterno, setContatoExterno] = useState("");
  const [prazoRetorno, setPrazoRetorno] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchEquipamentos = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("equipamentos")
      .select("id, nome, tag, linha, setor")
      .eq("status", "ativo")
      .order("nome", { ascending: true });
    setEquipamentos(data ?? []);
    setLoadingEquip(false);
  }, []);

  useEffect(() => { fetchEquipamentos(); }, [fetchEquipamentos]);

  const setoresDisponiveis = useMemo(() =>
    [...new Set(
      equipamentos.map((e) => e.setor).filter((s): s is string => !!s)
    )].sort()
  , [equipamentos]);

  const temSemSetor = useMemo(() => equipamentos.some((e) => !e.setor), [equipamentos]);

  const equipamentosDoSetor = useMemo(() => {
    if (!setorSelecionado) return [];
    if (setorSelecionado === SEM_SETOR) return equipamentos.filter((e) => !e.setor);
    return equipamentos.filter((e) => e.setor === setorSelecionado);
  }, [equipamentos, setorSelecionado]);

  function handleSetorChange(novoSetor: string) {
    setSetorSelecionado(novoSetor);
    if (equipamentoId) {
      const eq = equipamentos.find((e) => e.id === equipamentoId);
      if (eq) {
        const pertence = novoSetor === SEM_SETOR ? !eq.setor : eq.setor === novoSetor;
        if (!pertence) setEquipamentoId("");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!setorSelecionado) { toast({ title: "Selecione o setor", variant: "destructive" }); return; }
    if (!equipamentoId)    { toast({ title: "Selecione o equipamento", variant: "destructive" }); return; }
    if (!descricao.trim()) { toast({ title: "Descreva o problema", variant: "destructive" }); return; }
    if (externa && !empresaExterna.trim()) { toast({ title: "Informe o nome da empresa terceirizada", variant: "destructive" }); return; }

    setSaving(true);
    const { error } = await (supabase as any).from("ordens_servico").insert({
      equipamento_id: equipamentoId,
      descricao_problema: descricao.trim(),
      prioridade,
      tipo,
      status: "aberta",
      aberta_por: perfilNome,
      aberta_em: new Date().toISOString(),
      externa,
      empresa_externa: externa ? empresaExterna.trim() || null : null,
      contato_externo: externa ? contatoExterno.trim() || null : null,
      prazo_retorno: externa ? prazoRetorno || null : null,
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao abrir OS", description: error.message, variant: "destructive" }); return; }

    toast({ title: "Ordem de serviço aberta com sucesso!" });
    setSetorSelecionado("");
    setEquipamentoId("");
    setDescricao("");
    setPrioridade("media");
    setTipo("corretiva");
    setExterna(false);
    setEmpresaExterna("");
    setContatoExterno("");
    setPrazoRetorno("");
    onSuccess?.();
  }

  return (
    <div className="max-w-xl">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Wrench className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold leading-tight">Abrir Ordem de Serviço</h2>
          <p className="text-xs text-muted-foreground">Registre um problema ou solicitação de manutenção</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border bg-card shadow-sm p-5 space-y-4"
      >
        {/* ── Linha 1: Setor + Equipamento ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Setor */}
          <div className={fieldCls}>
            <label className={labelCls}>
              <Layers className={iconCls} />
              Setor <span className="text-destructive ml-0.5">*</span>
            </label>
            {loadingEquip ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
              </div>
            ) : (
              <select
                value={setorSelecionado}
                onChange={(e) => handleSetorChange(e.target.value)}
                className={selectCls}
              >
                <option value="">Selecione o setor...</option>
                {setoresDisponiveis.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {temSemSetor && <option value={SEM_SETOR}>Sem setor</option>}
              </select>
            )}
          </div>

          {/* Equipamento */}
          <div className={fieldCls}>
            <label className={labelCls}>
              <Settings2 className={iconCls} />
              Equipamento <span className="text-destructive ml-0.5">*</span>
            </label>
            {loadingEquip ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
              </div>
            ) : !setorSelecionado ? (
              <div className="flex h-9 items-center rounded-md border border-dashed border-input bg-muted/30 px-3 text-xs text-muted-foreground italic">
                Selecione o setor primeiro
              </div>
            ) : equipamentosDoSetor.length === 0 ? (
              <div className="flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Nenhum equipamento neste setor
              </div>
            ) : (
              <select
                value={equipamentoId}
                onChange={(e) => setEquipamentoId(e.target.value)}
                className={selectCls}
              >
                <option value="">Selecione o equipamento...</option>
                {equipamentosDoSetor.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nome}{eq.tag ? ` — ${eq.tag}` : ""}{eq.linha != null ? ` (L${eq.linha})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* ── Descrição ─────────────────────────────────────────────────── */}
        <div className={fieldCls}>
          <label className={labelCls}>
            <FileText className={iconCls} />
            Descrição do Problema <span className="text-destructive ml-0.5">*</span>
          </label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="O que acontece, quando acontece, sintomas observados..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-colors"
          />
        </div>

        {/* ── Linha 3: Tipo + Prioridade ────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Tipo */}
          <div className={fieldCls}>
            <label className={labelCls}>
              <Zap className={iconCls} />
              Tipo
            </label>
            <div className="flex gap-2">
              {(["corretiva", "preventiva"] as const).map((t) => {
                const isActive = tipo === t;
                const activeStyle = t === "corretiva"
                  ? "bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500"
                  : "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500";
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                      isActive
                        ? activeStyle
                        : "border-border text-muted-foreground hover:border-foreground/40"
                    }`}
                  >
                    {t === "corretiva" ? "Corretiva" : "Preventiva"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prioridade */}
          <div className={fieldCls}>
            <label className={labelCls}>
              <Flag className={iconCls} />
              Prioridade
            </label>
            <div className="flex gap-1.5">
              {PRIORIDADES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPrioridade(p.value)}
                  className={`flex-1 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    prioridade === p.value ? p.active : p.inactive
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Toggle: Manutenção externa ────────────────────────────────── */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setExterna(!externa)}
            className={`flex items-center gap-3 w-full rounded-lg border px-3 py-2.5 text-sm transition-all ${
              externa
                ? "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-700 dark:text-violet-300"
                : "bg-background border-border text-muted-foreground hover:border-foreground/30"
            }`}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left text-sm">Manutenção externa (terceiros)</span>
            {/* Switch */}
            <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${externa ? "bg-violet-500" : "bg-muted-foreground/30"}`}>
              <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${externa ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
          </button>

          {externa && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 dark:bg-violet-950/20 dark:border-violet-800 p-4 space-y-3">
              <div className={fieldCls}>
                <label className={`${labelCls} text-violet-600 dark:text-violet-400`}>
                  <Building className={iconCls} />
                  Empresa <span className="text-destructive ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={empresaExterna}
                  onChange={(e) => setEmpresaExterna(e.target.value)}
                  placeholder="Nome da empresa terceirizada..."
                  className="h-9 w-full rounded-md border border-violet-200 dark:border-violet-700 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={fieldCls}>
                  <label className={`${labelCls} text-violet-600 dark:text-violet-400`}>
                    <Phone className={iconCls} />
                    Contato
                  </label>
                  <input
                    type="text"
                    value={contatoExterno}
                    onChange={(e) => setContatoExterno(e.target.value)}
                    placeholder="Nome ou telefone..."
                    className="h-9 w-full rounded-md border border-violet-200 dark:border-violet-700 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                  />
                </div>
                <div className={fieldCls}>
                  <label className={`${labelCls} text-violet-600 dark:text-violet-400`}>
                    <CalendarClock className={iconCls} />
                    Prazo de retorno
                  </label>
                  <input
                    type="date"
                    value={prazoRetorno}
                    onChange={(e) => setPrazoRetorno(e.target.value)}
                    className="h-9 w-full rounded-md border border-violet-200 dark:border-violet-700 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Submit ────────────────────────────────────────────────────── */}
        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={saving || loadingEquip}
            className="gap-2 px-6"
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Wrench className="h-4 w-4" />}
            Abrir OS
          </Button>
        </div>
      </form>
    </div>
  );
}
