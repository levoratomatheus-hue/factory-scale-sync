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
  const [adicionando, setAdicionando] = useState(false);
  const [novoData, setNovoData] = useState("");
  const [novoHoraInicio, setNovoHoraInicio] = useState("");
  const [novoHoraFim, setNovoHoraFim] = useState("");
  const [novoItems, setNovoItems] = useState<ItemProducao[]>([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [editandoQtdReal, setEditandoQtdReal] = useState(false);
  const [qtdRealInput, setQtdRealInput] = useState("");
  const [salvandoQtdReal, setSalvandoQtdReal] = useState(false);
  const [qtdRealAtual, setQtdRealAtual] = useState<number | null>(null);

  const abrirNovoRegistro = () => {
    setAdicionando(true);
    setNovoData(ordem?.data_programacao ?? "");
    setNovoHoraInicio("");
    setNovoHoraFim("");
    setNovoItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  };

  const inserirRegistro = async () => {
    if (!ordem) return;
    setSalvandoNovo(true);

    const registroProducao = novoItems
      .map((it) => ({ qty: parseInt(it.qty) || 0, peso: parseFloat(it.peso.replace(",", ".")) || 0 }))
      .filter((it) => it.qty > 0 || it.peso > 0);

    const { error } = await (supabase as any).from("registros_diarios").insert({
      ordem_id: ordem.id,
      data: novoData || ordem.data_programacao,
      hora_inicio: novoHoraInicio || null,
      hora_fim: novoHoraFim || null,
      registro_producao: registroProducao,
    });

    if (error) {
      toast({ title: "Erro ao salvar registro", description: error.message, variant: "destructive" });
      setSalvandoNovo(false);
      return;
    }

    const { data: todosRegistros } = await (supabase as any)
      .from("registros_diarios")
      .select("id, data, hora_inicio, hora_fim, registro_producao")
      .eq("ordem_id", ordem.id)
      .order("data", { ascending: true });

    const regsAtualizados = todosRegistros ?? [];
    setRegistros(regsAtualizados);

    const regsParaCalculo = ordem.data_reprovacao
      ? regsAtualizados.filter((r: any) => r.data > ordem.data_reprovacao)
      : regsAtualizados;
    let qtdReal = 0;
    regsParaCalculo.forEach((r: any) => {
      const items: any[] = Array.isArray(r.registro_producao) ? r.registro_producao : [];
      items.forEach((it: any) => { qtdReal += (it.qty || 0) * (it.peso || 0); });
    });

    await (supabase as any).from("ordens").update({ quantidade_real: qtdReal } as any).eq("id", ordem.id);

    toast({ title: "Registro adicionado!" });
    setSalvandoNovo(false);
    setAdicionando(false);
    onSaved(ordem.id, qtdReal);
  };

  useEffect(() => {
    if (!ordem) {
      setRegistros([]);
      setEditandoId(null);
      setAdicionando(false);
      setEditandoQtdReal(false);
      setQtdRealInput("");
      setQtdRealAtual(null);
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

    // Recalcula quantidade_real somando registros após última reprovação
    const { data: todosRegistros } = await (supabase as any)
      .from("registros_diarios")
      .select("data, registro_producao")
      .eq("ordem_id", ordem.id);

    const regsParaCalculo = ordem.data_reprovacao
      ? (todosRegistros ?? []).filter((r: any) => r.data > ordem.data_reprovacao)
      : (todosRegistros ?? []);
    let qtdReal = 0;
    regsParaCalculo.forEach((r: any) => {
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

  const salvarQtdReal = async () => {
    if (!ordem) return;
    const valor = parseFloat(qtdRealInput.replace(",", "."));
    if (isNaN(valor) || valor < 0) return;
    setSalvandoQtdReal(true);
    await (supabase as any).from("ordens").update({ quantidade_real: valor } as any).eq("id", ordem.id);
    setSalvandoQtdReal(false);
    setEditandoQtdReal(false);
    setQtdRealAtual(valor);
    onSaved(ordem.id, valor);
    toast({ title: "Quantidade real atualizada!" });
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
        ) : registros.length === 0 && !adicionando ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">Nenhum registro diário encontrado.</p>
            <Button size="sm" variant="outline" className="gap-1" onClick={abrirNovoRegistro}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Registro
            </Button>
          </div>
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
            {adicionando ? (
              <div className="rounded-md border border-dashed border-primary/40 bg-muted/20 p-3 space-y-3">
                <p className="text-sm font-semibold">Novo Registro</p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Data</label>
                  <Input
                    type="date"
                    value={novoData}
                    onChange={(e) => setNovoData(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Hora Início</label>
                    <Input type="time" value={novoHoraInicio} onChange={(e) => setNovoHoraInicio(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Hora Fim</label>
                    <Input type="time" value={novoHoraFim} onChange={(e) => setNovoHoraFim(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Itens de Produção</label>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => setNovoItems((p) => [...p, { qty: "", peso: "" }])}>
                      <Plus className="h-3 w-3" /> Adicionar
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_2rem] gap-2">
                    <span className="text-xs text-muted-foreground font-medium">Bateladas</span>
                    <span className="text-xs text-muted-foreground font-medium">Peso (kg)</span>
                    <span />
                  </div>
                  {novoItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={item.qty}
                        onChange={(e) => setNovoItems((p) => p.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,000"
                        value={item.peso}
                        onChange={(e) => setNovoItems((p) => p.map((it, i) => i === idx ? { ...it, peso: e.target.value.replace(/[^0-9,]/g, "") } : it))}
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setNovoItems((p) => p.filter((_, i) => i !== idx))}
                        disabled={novoItems.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t">
                  <Button size="sm" variant="outline" onClick={() => setAdicionando(false)} disabled={salvandoNovo}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={inserirRegistro} disabled={salvandoNovo}>
                    {salvandoNovo ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full gap-1 border-dashed" onClick={abrirNovoRegistro}>
                <Plus className="h-3.5 w-3.5" /> Adicionar Registro
              </Button>
            )}
          </div>
        )}
        {/* Edição direta da quantidade real */}
        {ordem && (
          <div className="border-t pt-3 mt-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantidade Real</p>
                <p className="text-sm font-bold">
                  {(() => { const v = qtdRealAtual ?? ordem.quantidade_real; return v != null ? `${formatKg(v)} kg` : <span className="text-muted-foreground/50">—</span>; })()}
                </p>
              </div>
              {!editandoQtdReal && (
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => {
                  setQtdRealInput(ordem.quantidade_real != null ? String(ordem.quantidade_real).replace(".", ",") : "");
                  setEditandoQtdReal(true);
                }}>
                  <Pencil className="h-3 w-3" /> Corrigir
                </Button>
              )}
            </div>
            {editandoQtdReal && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,000"
                  value={qtdRealInput}
                  onChange={(e) => setQtdRealInput(e.target.value.replace(/[^0-9,]/g, ""))}
                  className="h-8 text-sm"
                />
                <span className="text-sm text-muted-foreground shrink-0">kg</span>
                <Button size="sm" variant="outline" onClick={() => setEditandoQtdReal(false)} disabled={salvandoQtdReal}>
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={salvarQtdReal} disabled={salvandoQtdReal}>
                  {salvandoQtdReal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
