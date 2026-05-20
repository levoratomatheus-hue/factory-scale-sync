import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Plus, Trash2, Loader2, Check, X } from "lucide-react";
import { formatKg } from "@/lib/utils";

type ItemProducao = { qty: string; peso: string };

interface Props {
  ordem: any | null;
  onClose: () => void;
  onSaved: (ordemId: string, novaQtdReal: number) => void;
}

export function EditarRegistrosDiariosModal({ ordem, onClose, onSaved }: Props) {
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editHoraInicio, setEditHoraInicio] = useState("");
  const [editHoraFim, setEditHoraFim] = useState("");
  const [editItems, setEditItems] = useState<ItemProducao[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ordem) {
      setRegistros([]);
      setEditandoId(null);
      return;
    }
    setLoading(true);
    (supabase as any)
      .from("registros_diarios")
      .select("id, data, hora_inicio, hora_fim, registro_producao")
      .eq("ordem_id", ordem.id)
      .order("data", { ascending: true })
      .then(({ data }: any) => {
        setRegistros(data ?? []);
        setLoading(false);
      });
  }, [ordem]);

  const abrirEdicao = (registro: any) => {
    setEditandoId(registro.id);
    setEditHoraInicio(registro.hora_inicio?.slice(0, 5) ?? "");
    setEditHoraFim(registro.hora_fim?.slice(0, 5) ?? "");
    const items: any[] = Array.isArray(registro.registro_producao)
      ? registro.registro_producao
      : [];
    setEditItems(
      items.length > 0
        ? items.map((i: any) => ({
            qty: String(i.qty ?? ""),
            peso: String(i.peso ?? "").replace(".", ","),
          }))
        : [{ qty: "", peso: "" }]
    );
  };

  const cancelarEdicao = () => setEditandoId(null);

  const addItem = () => setEditItems((prev) => [...prev, { qty: "", peso: "" }]);

  const removeItem = (idx: number) =>
    setEditItems((prev) => prev.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: "qty" | "peso", value: string) =>
    setEditItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );

  const salvar = async () => {
    if (!editandoId || !ordem) return;
    setSaving(true);

    const registroProducao = editItems
      .map((it) => ({
        qty: parseInt(it.qty) || 0,
        peso: parseFloat(it.peso.replace(",", ".")) || 0,
      }))
      .filter((it) => it.qty > 0 || it.peso > 0);

    const { error } = await (supabase as any)
      .from("registros_diarios")
      .update({
        hora_inicio: editHoraInicio || null,
        hora_fim: editHoraFim || null,
        registro_producao: registroProducao,
      })
      .eq("id", editandoId);

    if (error) {
      toast({
        title: "Erro ao salvar registro",
        description: error.message,
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    // Recalcula quantidade_real somando todos os registros_diarios da ordem
    const { data: todosRegistros } = await (supabase as any)
      .from("registros_diarios")
      .select("registro_producao")
      .eq("ordem_id", ordem.id);

    let qtdReal = 0;
    (todosRegistros ?? []).forEach((r: any) => {
      const items: any[] = Array.isArray(r.registro_producao)
        ? r.registro_producao
        : [];
      items.forEach((it: any) => {
        qtdReal += (it.qty || 0) * (it.peso || 0);
      });
    });

    await (supabase as any)
      .from("ordens")
      .update({ quantidade_real: qtdReal } as any)
      .eq("id", ordem.id);

    // Atualiza o estado local sem re-fetch
    setRegistros((prev) =>
      prev.map((r) =>
        r.id === editandoId
          ? {
              ...r,
              hora_inicio: editHoraInicio || null,
              hora_fim: editHoraFim || null,
              registro_producao: registroProducao,
            }
          : r
      )
    );

    toast({ title: "Registro atualizado!" });
    setSaving(false);
    setEditandoId(null);
    onSaved(ordem.id, qtdReal);
  };

  return (
    <Dialog open={!!ordem} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registros de Produção</DialogTitle>
          {ordem && (
            <p className="text-sm text-muted-foreground">
              Lote {ordem.lote} · {ordem.produto}
            </p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : registros.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum registro diário encontrado.
          </p>
        ) : (
          <div className="space-y-3 py-2">
            {registros.map((registro) => {
              const isEditing = editandoId === registro.id;
              const items: any[] = Array.isArray(registro.registro_producao)
                ? registro.registro_producao
                : [];
              const filled = items.filter((i) => i.qty || i.peso);
              const totalReg = filled.reduce(
                (s, i) => s + (i.qty || 0) * (i.peso || 0),
                0
              );

              return (
                <div
                  key={registro.id}
                  className="rounded-md border bg-muted/30 p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {format(
                        new Date(registro.data + "T12:00:00"),
                        "dd/MM/yyyy",
                        { locale: ptBR }
                      )}
                    </span>
                    {!isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => abrirEdicao(registro)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Hora Início
                          </label>
                          <Input
                            type="time"
                            value={editHoraInicio}
                            onChange={(e) => setEditHoraInicio(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            Hora Fim
                          </label>
                          <Input
                            type="time"
                            value={editHoraFim}
                            onChange={(e) => setEditHoraFim(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-muted-foreground">
                            Itens de Produção
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={addItem}
                          >
                            <Plus className="h-3 w-3" />
                            Adicionar
                          </Button>
                        </div>
                        <div className="grid grid-cols-[1fr_1fr_2rem] gap-2">
                          <span className="text-xs text-muted-foreground font-medium">
                            Bateladas
                          </span>
                          <span className="text-xs text-muted-foreground font-medium">
                            Peso (kg)
                          </span>
                          <span />
                        </div>
                        {editItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center"
                          >
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={item.qty}
                              onChange={(e) =>
                                updateItem(idx, "qty", e.target.value)
                              }
                              className="h-8 text-sm"
                            />
                            <Input
                              type="text"
                              inputMode="decimal"
                              placeholder="0,000"
                              value={item.peso}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  "peso",
                                  e.target.value.replace(/[^0-9,]/g, "")
                                )
                              }
                              className="h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              onClick={() => removeItem(idx)}
                              disabled={editItems.length <= 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={cancelarEdicao}
                          disabled={saving}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={salvar} disabled={saving}>
                          {saving ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5 mr-1" />
                          )}
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-muted-foreground">
                        {registro.hora_inicio?.slice(0, 5) ?? "—"} –{" "}
                        {registro.hora_fim?.slice(0, 5) ?? "—"}
                      </p>
                      {filled.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {filled
                            .map((i: any) => `${i.qty}× ${formatKg(i.peso)} kg`)
                            .join(" + ")}{" "}
                          ={" "}
                          <span className="font-semibold text-foreground">
                            {formatKg(totalReg)} kg
                          </span>
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">
                          Sem itens registrados
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
