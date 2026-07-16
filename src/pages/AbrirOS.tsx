import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Wrench, AlertTriangle, Building2 } from "lucide-react";

interface Equipamento {
  id: string;
  nome: string;
  tag: string | null;
  linha: number | null;
}

interface AbrirOSProps {
  perfilNome: string;
  onSuccess?: () => void;
}

const PRIORIDADES = [
  { value: "baixa",    label: "Baixa",    color: "bg-slate-100 text-slate-600 border-slate-200" },
  { value: "media",    label: "Média",    color: "bg-blue-100 text-blue-600 border-blue-200" },
  { value: "alta",     label: "Alta",     color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "critica",  label: "Crítica",  color: "bg-red-100 text-red-700 border-red-200" },
];

export default function AbrirOS({ perfilNome, onSuccess }: AbrirOSProps) {
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [loadingEquip, setLoadingEquip] = useState(true);
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
      .select("id, nome, tag, linha")
      .eq("status", "ativo")
      .order("nome", { ascending: true });
    setEquipamentos(data ?? []);
    setLoadingEquip(false);
  }, []);

  useEffect(() => { fetchEquipamentos(); }, [fetchEquipamentos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!equipamentoId) {
      toast({ title: "Selecione o equipamento", variant: "destructive" });
      return;
    }
    if (!descricao.trim()) {
      toast({ title: "Descreva o problema", variant: "destructive" });
      return;
    }
    if (externa && !empresaExterna.trim()) {
      toast({ title: "Informe o nome da empresa terceirizada", variant: "destructive" });
      return;
    }
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
    if (error) {
      toast({ title: "Erro ao abrir OS", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ordem de serviço aberta com sucesso!" });
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
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-bold">Abrir Ordem de Serviço</h2>
          <p className="text-sm text-muted-foreground">Registre um problema ou solicitação de manutenção</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-lg border p-6 space-y-5">
        {/* Equipamento */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Equipamento *</label>
          {loadingEquip ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando equipamentos...
            </div>
          ) : equipamentos.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Nenhum equipamento ativo cadastrado. Cadastre em Equipamentos.
            </div>
          ) : (
            <select
              value={equipamentoId}
              onChange={(e) => setEquipamentoId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione o equipamento...</option>
              {equipamentos.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome}{eq.tag ? ` — ${eq.tag}` : ""}{eq.linha != null ? ` (L${eq.linha})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Descrição */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Descrição do Problema *</label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
            placeholder="Descreva o problema de forma clara: o que acontece, quando acontece, sintomas observados..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {/* Tipo */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tipo</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTipo("corretiva")}
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all ${
                tipo === "corretiva"
                  ? "bg-red-100 text-red-700 border-red-200 ring-2 ring-offset-1 ring-red-400"
                  : "bg-background border-input text-muted-foreground hover:border-foreground/30"
              }`}
            >
              Corretiva
            </button>
            <button
              type="button"
              onClick={() => setTipo("preventiva")}
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all ${
                tipo === "preventiva"
                  ? "bg-green-100 text-green-700 border-green-200 ring-2 ring-offset-1 ring-green-400"
                  : "bg-background border-input text-muted-foreground hover:border-foreground/30"
              }`}
            >
              Preventiva
            </button>
          </div>
        </div>

        {/* Prioridade */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Prioridade</label>
          <div className="flex gap-2 flex-wrap">
            {PRIORIDADES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPrioridade(p.value)}
                className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-all ${
                  prioridade === p.value
                    ? `${p.color} ring-2 ring-offset-1 ring-current`
                    : "bg-background border-input text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle: Manutenção externa */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setExterna(!externa)}
            className={`flex items-center gap-2.5 w-full rounded-md border px-3 py-2.5 text-sm font-medium transition-all ${
              externa
                ? "bg-purple-50 border-purple-300 text-purple-700"
                : "bg-background border-input text-muted-foreground hover:border-foreground/30"
            }`}
          >
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Manutenção externa (terceiros)</span>
            <span className={`w-8 h-4.5 rounded-full relative inline-flex items-center transition-colors ${externa ? "bg-purple-500" : "bg-muted-foreground/30"}`}>
              <span className={`absolute w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${externa ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
          </button>

          {externa && (
            <div className="rounded-md border border-purple-200 bg-purple-50/50 p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-purple-800">Empresa *</label>
                <input
                  type="text"
                  value={empresaExterna}
                  onChange={(e) => setEmpresaExterna(e.target.value)}
                  placeholder="Nome da empresa terceirizada..."
                  className="w-full rounded-md border border-purple-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-purple-800">Contato</label>
                <input
                  type="text"
                  value={contatoExterno}
                  onChange={(e) => setContatoExterno(e.target.value)}
                  placeholder="Nome ou telefone do contato..."
                  className="w-full rounded-md border border-purple-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-purple-800">Prazo previsto de retorno</label>
                <input
                  type="date"
                  value={prazoRetorno}
                  onChange={(e) => setPrazoRetorno(e.target.value)}
                  className="w-full rounded-md border border-purple-200 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={saving || loadingEquip} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Abrir OS
          </Button>
        </div>
      </form>
    </div>
  );
}
