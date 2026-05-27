import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Wrench, AlertTriangle } from "lucide-react";

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
    setSaving(true);
    const { error } = await (supabase as any).from("ordens_servico").insert({
      equipamento_id: equipamentoId,
      descricao: descricao.trim(),
      prioridade,
      status: "aberta",
      criado_por: perfilNome,
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
