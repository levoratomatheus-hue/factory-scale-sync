import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users } from "lucide-react";

interface Operador {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function CadastroOperadores() {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchOperadores = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("operadores")
      .select("id, nome, ativo")
      .order("nome");
    setOperadores(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOperadores(); }, [fetchOperadores]);

  async function adicionar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("operadores")
      .insert({ nome, ativo: true });
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Operador já cadastrado", variant: "destructive" });
      } else {
        toast({ title: "Erro ao adicionar operador", description: error.message, variant: "destructive" });
      }
      return;
    }
    setNovoNome("");
    toast({ title: "Operador adicionado!" });
    await fetchOperadores();
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    setTogglingId(id);
    const { error } = await (supabase as any)
      .from("operadores")
      .update({ ativo: !ativo })
      .eq("id", id);
    setTogglingId(null);
    if (error) {
      toast({ title: "Erro ao atualizar operador", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: ativo ? "Operador desativado" : "Operador reativado" });
    await fetchOperadores();
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 py-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-bold">Operadores</h2>
      </div>

      {/* Adicionar */}
      <div className="flex gap-2">
        <Input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome do novo operador"
          onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
        />
        <Button onClick={adicionar} disabled={saving || !novoNome.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
        </Button>
      </div>

      {/* Lista */}
      <div className="space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && operadores.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum operador cadastrado.</p>
        )}
        {operadores.map((op) => (
          <div key={op.id} className="flex items-center justify-between px-3 py-2 rounded-md border bg-background">
            <span className={`text-sm ${!op.ativo ? "text-muted-foreground line-through" : ""}`}>{op.nome}</span>
            <button
              onClick={() => toggleAtivo(op.id, op.ativo)}
              disabled={togglingId === op.id}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-50 ${
                op.ativo
                  ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400"
                  : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400"
              }`}
            >
              {togglingId === op.id
                ? <Loader2 className="h-3 w-3 animate-spin inline" />
                : op.ativo ? "Desativar" : "Reativar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
