import { useState, useEffect, useCallback } from "react";
import { useOrdens } from "@/hooks/useOrdens";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ClipboardList,
  CheckCircle2,
  Loader2,
  Clock,
  CalendarIcon,
  TrendingUp,
  Trash2,
  ChevronUp,
  ChevronDown,
  PlusCircle,
  PackageSearch,
  AlertTriangle,
  CalendarPlus,
  CalendarClock,
  CalendarCheck2,
  CalendarDays,
  Pencil,
  Undo2,
} from "lucide-react";
import { format, isToday, isPast, isFuture } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn, sortOrdens } from "@/lib/utils";

function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

function feriadosDoAno(ano: number): Set<string> {
  const fmtKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fixos = [
    [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25],
  ].map(([m, d]) => fmtKey(new Date(ano, m - 1, d, 12, 0, 0)));

  const easter = pascoa(ano);
  const addDias = (base: Date, n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return fmtKey(d);
  };
  const moveis = [
    addDias(easter, -48), // Segunda de Carnaval
    addDias(easter, -47), // Terça de Carnaval
    addDias(easter, -2),  // Sexta-feira Santa
    fmtKey(easter),       // Páscoa
    addDias(easter, 60),  // Corpus Christi
  ];

  return new Set([...fixos, ...moveis]);
}

function proximoDiaUtil(dataStr: string): string {
  const d = new Date(dataStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  let cacheAno = -1;
  let feriados = new Set<string>();
  while (true) {
    const ano = d.getFullYear();
    if (ano !== cacheAno) { feriados = feriadosDoAno(ano); cacheAno = ano; }
    const day = d.getDay();
    const key = `${ano}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (day !== 0 && day !== 6 && !feriados.has(key)) break;
    d.setDate(d.getDate() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasUteis(de: string, ate: string): number {
  const start = new Date(de + 'T12:00:00');
  const end = new Date(ate + 'T12:00:00');
  let count = 0;
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1);
  let cacheAno = -1;
  let feriados = new Set<string>();
  while (cur <= end) {
    const ano = cur.getFullYear();
    if (ano !== cacheAno) { feriados = feriadosDoAno(ano); cacheAno = ano; }
    const day = cur.getDay();
    const key = `${ano}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    if (day !== 0 && day !== 6 && !feriados.has(key)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
import { MarcaBadge } from "@/components/MarcaBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { EditarOrdemDialog, type OrdemEditavel } from "@/components/EditarOrdemDialog";
import { DetalheOrdemDialog } from "@/components/DetalheOrdemDialog";

interface LoteSemOP {
  lote: number;
  produto: string;
  quantidade: number;
  classe: string;
}

interface PainelGestorProps {
  onCriarOP?: (lote: number) => void;
}

export default function PainelGestor({ onCriarOP }: PainelGestorProps = {}) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const { ordens, loading } = useOrdens(dateStr);
  const { ordens: todasPendentes } = useOrdens();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const pendentesAnteriores = todasPendentes.filter(
    (o) =>
      o.data_programacao < todayStr &&
      ["pendente", "aguardando_linha"].includes(o.status)
  );

  const [pendentesOpen, setPendentesOpen] = useState(false);
  const [ordemParaExcluir, setOrdemParaExcluir] = useState<{ id: string; produto: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [ordemEditando, setOrdemEditando] = useState<OrdemEditavel | null>(null);
  const [ordemParaVoltar, setOrdemParaVoltar] = useState<{ id: string; produto: string } | null>(null);
  const [voltando, setVoltando] = useState(false);
  const [ordemParaForcar, setOrdemParaForcar] = useState<{ id: string; produto: string; dataProgramacao: string; statusAnterior: string } | null>(null);
  const [forcarHoraInicio, setForcarHoraInicio] = useState("");
  const [forcarHoraFim, setForcarHoraFim] = useState("");
  const [forcarProdItems, setForcarProdItems] = useState([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [forcarQtdReal, setForcarQtdReal] = useState("");
  const [forcando, setForcando] = useState(false);
  const [novaData, setNovaData] = useState<Record<string, string>>({});
  const [reprogramando, setReprogramando] = useState<Record<string, boolean>>({});
  const [registrosDoDia, setRegistrosDoDia] = useState<Record<string, any>>({});
  const [ordensDeRegistros, setOrdensDeRegistros] = useState<any[]>([]);
  const [ordemParaRegistrar, setOrdemParaRegistrar] = useState<{ id: string; produto: string } | null>(null);
  const [ordemParaReprogramarCard, setOrdemParaReprogramarCard] = useState<{ id: string; produto: string } | null>(null);
  const [novaDataReprogramarCard, setNovaDataReprogramarCard] = useState("");
  const [salvandoRepr, setSalvandoRepr] = useState(false);
  const [ordemDetalhe, setOrdemDetalhe] = useState<any | null>(null);
  const [regDia, setRegDia] = useState(todayStr);
  const [regHoraInicio, setRegHoraInicio] = useState("");
  const [regHoraFim, setRegHoraFim] = useState("");
  const [regProdItems, setRegProdItems] = useState([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
  const [registrando, setRegistrando] = useState(false);

  const isHoje = isToday(selectedDate);
  const isPassado = isPast(selectedDate) && !isHoje;
  const isFuturo = isFuture(selectedDate);

  const total = ordens.length;
  const concluidas = ordens.filter((o) => o.status === "concluido").length;
  const emPesagem = ordens.filter((o) => o.status === "em_pesagem").length;
  const emAberto = ordens.filter((o) => o.status === "pendente").length;
  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const fetchRegistrosDoDia = useCallback(async () => {
    const { data: regs } = await (supabase as any)
      .from("registros_diarios")
      .select("ordem_id, registro_producao, hora_inicio, hora_fim")
      .eq("data", dateStr);

    if (!regs?.length) {
      setRegistrosDoDia({});
      setOrdensDeRegistros([]);
      return;
    }

    const regMap: Record<string, any> = {};
    regs.forEach((r: any) => { regMap[r.ordem_id] = r; });
    setRegistrosDoDia(regMap);

    const ids = regs.map((r: any) => r.ordem_id);
    const { data: ops } = await supabase.from("ordens").select("*").in("id", ids);
    setOrdensDeRegistros(ops ?? []);
  }, [dateStr]);

  useEffect(() => {
    fetchRegistrosDoDia();
  }, [fetchRegistrosDoDia]);

  const ordensPorLinha = (linha: number) => {
    const doDia = ordens.filter((o) => o.linha === linha);
    const visto = new Set(doDia.map((o) => o.id));
    const deRegistros = ordensDeRegistros.filter(
      (o) => Number(o.linha) === linha && !visto.has(o.id)
    );
    return sortOrdens([...doDia, ...deRegistros]);
  };
  const ordensPorBalanca = (balanca: number) =>
    sortOrdens(todasPendentes.filter((o) => o.balanca === balanca && o.status !== "concluido"));

  const [lotesSeOP, setLotesSeOP] = useState<LoteSemOP[]>([]);
  const [loadingLotesSemOP, setLoadingLotesSemOP] = useState(false);

  useEffect(() => {
    const fetchLotesSemOP = async () => {
      setLoadingLotesSemOP(true);
      const { data: lotes } = await (supabase as any)
        .from('cadastro_lotes')
        .select('lote, produto, quantidade, classe')
        .eq('status', 'Em Aberto')
        .order('lote', { ascending: true });

      if (!lotes?.length) { setLoadingLotesSemOP(false); return; }

      const { data: ordensExistentes } = await supabase
        .from('ordens')
        .select('lote');

      const lotesComOP = new Set((ordensExistentes ?? []).map((o: any) => String(o.lote)));
      setLotesSeOP(lotes.filter((l: any) => !lotesComOP.has(String(l.lote))));
      setLoadingLotesSemOP(false);
    };
    fetchLotesSemOP();
  }, []);

  const reprogramarOrdem = async (ordemId: string, paraHoje: boolean) => {
    const data = paraHoje ? todayStr : (novaData[ordemId] ?? todayStr);
    if (!data) { toast({ title: "Selecione uma data", variant: "destructive" }); return; }
    setReprogramando((prev) => ({ ...prev, [ordemId]: true }));
    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: data, status: "aguardando_linha" } as any)
      .eq("id", ordemId);
    setReprogramando((prev) => ({ ...prev, [ordemId]: false }));
    if (error) { toast({ title: "Erro ao reprogramar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Ordem reprogramada para ${paraHoje ? "hoje" : data}` });
  };

  const reprogramarCard = async () => {
    if (!ordemParaReprogramarCard || !novaDataReprogramarCard) return;
    setSalvandoRepr(true);
    const { error } = await supabase
      .from("ordens")
      .update({ data_programacao: novaDataReprogramarCard } as any)
      .eq("id", ordemParaReprogramarCard.id);
    setSalvandoRepr(false);
    if (error) {
      toast({ title: "Erro ao reprogramar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordem reprogramada com sucesso" });
      setOrdemParaReprogramarCard(null);
      setNovaDataReprogramarCard("");
    }
  };

  const excluirOrdem = async () => {
    if (!ordemParaExcluir) return;
    setExcluindo(true);
    const { error } = await supabase.from("ordens").delete().eq("id", ordemParaExcluir.id);
    setExcluindo(false);
    setOrdemParaExcluir(null);
    if (error) {
      toast({ title: "Erro ao excluir ordem", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordem excluída com sucesso!" });
    }
  };

  const handleVoltarFila = async () => {
    if (!ordemParaVoltar) return;
    setVoltando(true);
    const { error } = await supabase
      .from("ordens")
      .update({ status: "aguardando_linha" } as any)
      .eq("id", ordemParaVoltar.id);
    if (!error) {
      await supabase.from("historico").insert({
        ordem_id: ordemParaVoltar.id,
        status_anterior: "em_linha",
        status_novo: "aguardando_linha",
      });
      toast({ title: "Ordem voltou para a fila" });
    } else {
      toast({ title: "Erro ao voltar para fila", description: error.message, variant: "destructive" });
    }
    setVoltando(false);
    setOrdemParaVoltar(null);
  };

  const handleForcarConclusao = async () => {
    if (!ordemParaForcar) return;
    setForcando(true);

    const filledItems = forcarProdItems.filter((r) => r.qty.trim() || r.peso.trim());
    if (filledItems.length > 0) {
      const { error: errReg } = await (supabase as any).from("registros_diarios").insert({
        ordem_id: ordemParaForcar.id,
        data: ordemParaForcar.dataProgramacao,
        hora_inicio: forcarHoraInicio || null,
        hora_fim: forcarHoraFim || null,
        registro_producao: filledItems.map((r) => ({
          qty: parseInt(r.qty) || 0,
          peso: parseFloat(r.peso.replace(",", ".")) || 0,
        })),
      });

      if (errReg) {
        toast({ title: "Erro ao salvar registro de produção", description: errReg.message, variant: "destructive" });
        setForcando(false);
        return;
      }
    }

    const payload: any = { status: "aguardando_liberacao", hora_inicio: forcarHoraInicio || null, hora_fim: forcarHoraFim || null, motivo_reprovacao: null };
    if (forcarQtdReal.trim()) payload.quantidade_real = parseFloat(forcarQtdReal.replace(",", "."));

    const { error } = await supabase.from("ordens").update(payload as any).eq("id", ordemParaForcar.id);
    if (!error) {
      await supabase.from("historico").insert({
        ordem_id: ordemParaForcar.id,
        status_anterior: ordemParaForcar.statusAnterior,
        status_novo: "aguardando_liberacao",
      });
      toast({ title: "Ordem enviada para aguardando liberação" });
    } else {
      toast({ title: "Erro ao concluir ordem", description: error.message, variant: "destructive" });
    }
    setForcando(false);
    setOrdemParaForcar(null);
    setForcarHoraInicio("");
    setForcarHoraFim("");
    setForcarProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    setForcarQtdReal("");
  };

  const handleEditar = async (id: string, payload: Record<string, unknown>) => {
    const { error } = await supabase.from("ordens").update(payload as any).eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar ordem", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordem atualizada com sucesso" });
    }
  };

  const handleRegistrarDia = async () => {
    if (!ordemParaRegistrar) return;
    const dataRegistro = (regDia || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRegistro)) {
      toast({ title: "Data inválida", description: "Selecione uma data válida no formato YYYY-MM-DD.", variant: "destructive" });
      return;
    }
    setRegistrando(true);
    const filledItems = regProdItems.filter((r) => r.qty.trim() || r.peso.trim());
    const { error } = await (supabase as any).from("registros_diarios").insert({
      ordem_id: ordemParaRegistrar.id,
      data: dataRegistro,
      hora_inicio: regHoraInicio || null,
      hora_fim: regHoraFim || null,
      registro_producao: filledItems.map((r) => ({
        qty: parseInt(r.qty) || 0,
        peso: parseFloat(r.peso.replace(",", ".")) || 0,
      })),
    });
    if (error) {
      setRegistrando(false);
      toast({ title: "Erro ao registrar dia", description: error.message, variant: "destructive" });
      return;
    }
    const proximaData = proximoDiaUtil(dataRegistro);
    const { error: errUpdate } = await supabase.from("ordens").update({ data_programacao: proximaData } as any).eq("id", ordemParaRegistrar.id);
    if (errUpdate) {
      setRegistrando(false);
      toast({ title: "Registro salvo, mas erro ao avançar data", description: errUpdate.message, variant: "destructive" });
      return;
    }
    setRegistrando(false);
    const dataFmt = format(new Date(dataRegistro + "T12:00:00"), "dd/MM/yyyy");
    toast({ title: `Registro de ${dataFmt} salvo — próxima data: ${format(new Date(proximaData + "T12:00:00"), "dd/MM/yyyy")}` });
    setOrdemParaRegistrar(null);
    setRegDia(todayStr);
    setRegHoraInicio("");
    setRegHoraFim("");
    setRegProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
    if (dataRegistro !== dateStr) {
      // Navega para a data salva para o gestor confirmar o registro visualmente
      setSelectedDate(new Date(dataRegistro + "T12:00:00"));
    } else {
      fetchRegistrosDoDia();
    }
  };

  const moverOrdem = async (ordemId: string, direcao: "up" | "down", balanca: number) => {
    const fila = ordensPorBalanca(balanca);
    const idx = fila.findIndex((o) => o.id === ordemId);
    if (idx === -1) return;
    if (direcao === "up" && idx === 0) return;
    if (direcao === "down" && idx === fila.length - 1) return;

    const outro = direcao === "up" ? fila[idx - 1] : fila[idx + 1];
    const atual = fila[idx];

    const posAtual = atual.posicao ?? idx + 1;
    const posOutro = outro.posicao ?? (direcao === "up" ? idx : idx + 2);

    await supabase.from("ordens").update({ posicao: posOutro }).eq("id", atual.id);
    await supabase.from("ordens").update({ posicao: posAtual }).eq("id", outro.id);
  };

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
        <div>
          <h1 className="text-2xl font-bold">Painel do Gestor</h1>
          {isPassado && <p className="text-sm text-muted-foreground mt-0.5">Visualizando dia passado</p>}
          {isFuturo && <p className="text-sm text-muted-foreground mt-0.5">Visualizando programação futura</p>}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal gap-2")}>
              <CalendarIcon className="h-4 w-4" />
              {isHoje ? "Hoje" : format(selectedDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total programado"
          value={total}
          variant="default"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <MetricCard title="Concluídas" value={concluidas} variant="done" icon={<CheckCircle2 className="h-4 w-4" />} />
        {isHoje && (
          <MetricCard title="Em Pesagem" value={emPesagem} variant="weighing" icon={<Loader2 className="h-4 w-4" />} />
        )}
        {isPassado && (
          <MetricCard
            title="Taxa de conclusão"
            value={`${taxaConclusao}%`}
            variant="weighing"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        )}
        {isFuturo && (
          <MetricCard title="Previstas" value={total} variant="weighing" icon={<TrendingUp className="h-4 w-4" />} />
        )}
        <MetricCard
          title={isPassado ? "Não concluídas" : "Pendentes"}
          value={emAberto}
          variant="open"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Lotes sem OP */}
      {(loadingLotesSemOP || lotesSeOP.length > 0) && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Lotes Pendentes de Programação</h3>
            </div>
            {!loadingLotesSemOP && (
              <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                {lotesSeOP.length} lote{lotesSeOP.length !== 1 ? 's' : ''} sem OP
              </span>
            )}
          </div>

          {loadingLotesSemOP ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Lote</th>
                    <th className="text-left px-4 py-2 font-medium">Produto</th>
                    <th className="text-right px-4 py-2 font-medium">Qtd (kg)</th>
                    <th className="text-left px-4 py-2 font-medium">Classe</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lotesSeOP.map((l) => (
                    <tr key={l.lote} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono font-medium">{l.lote}</td>
                      <td className="px-4 py-2 max-w-xs truncate">{l.produto}</td>
                      <td className="px-4 py-2 text-right">{l.quantidade.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-muted-foreground">{l.classe || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 h-7 text-xs"
                          onClick={() => onCriarOP?.(l.lote)}
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Criar OP
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pendentes de dias anteriores */}
      {pendentesAnteriores.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm font-medium text-amber-800">
              <span className="font-bold">{pendentesAnteriores.length}</span> OP{pendentesAnteriores.length !== 1 ? "s" : ""} de dias anteriores precisam ser reprogramadas
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-400 text-amber-700 hover:bg-amber-100"
            onClick={() => setPendentesOpen(true)}
          >
            Ver e reprogramar
          </Button>
        </div>
      )}

      <Dialog open={pendentesOpen} onOpenChange={setPendentesOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600" />
              OPs de dias anteriores pendentes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {pendentesAnteriores.map((op) => (
              <div key={op.id} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{op.produto}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>Lote {op.lote}</span>
                      <span>·</span>
                      <span>{op.quantidade} kg</span>
                      <span>·</span>
                      <StatusBadge status={op.status} />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground shrink-0 bg-background border rounded px-2 py-0.5">
                    {format(new Date(op.data_programacao + "T12:00:00"), "dd/MM/yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={reprogramando[op.id]}
                    onClick={() => reprogramarOrdem(op.id, true)}
                  >
                    {reprogramando[op.id]
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />}
                    Reprogramar para hoje
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={novaData[op.id] ?? ""}
                      min={todayStr}
                      onChange={(e) => setNovaData((prev) => ({ ...prev, [op.id]: e.target.value }))}
                      className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!novaData[op.id] || reprogramando[op.id]}
                      onClick={() => reprogramarOrdem(op.id, false)}
                    >
                      {reprogramando[op.id]
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : "Reprogramar"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendentesOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso pendências */}
      {isPassado && emAberto > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive font-medium">
          ⚠️ {emAberto} ordem{emAberto > 1 ? "s" : ""} não {emAberto > 1 ? "foram concluídas" : "foi concluída"} neste
          dia e ainda pode estar na fila das balanças.
        </div>
      )}

      {/* Programação por Linha */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Programação por Linha</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((linha) => (
            <div key={linha} className="bg-card rounded-lg border p-4">
              <h3 className="font-semibold text-sm text-muted-foreground mb-3">Linha {linha}</h3>
              <div className="space-y-2">
                {ordensPorLinha(linha).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ordem</p>}
                {ordensPorLinha(linha).map((ordem) => {
                  const du = ordem.data_emissao ? diasUteis(ordem.data_emissao, ordem.data_programacao) : 0;
                  const atrasado = du > 7;
                  return (
                  <div
                    key={ordem.id}
                    className={`bg-card border rounded-lg p-2.5 flex items-start gap-1.5 ${atrasado ? 'border-red-500' : ''} ${(ordem.status === "em_linha" || ordem.status === "aguardando_linha") ? "cursor-pointer" : ""}`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      if (ordem.status === "em_linha" || ordem.status === "aguardando_linha") setOrdemDetalhe(ordem);
                    }}
                  >
                    <div className="flex-1 space-y-1 overflow-hidden">
                      <p className="text-xs font-semibold leading-tight break-words">{ordem.produto}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                        Lote {ordem.lote} · {ordem.quantidade} kg
                        <MarcaBadge marca={ordem.marca} size="sm" />
                      </p>
                      <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
                      {atrasado && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1 py-0 leading-4">
                          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                          {du}du em atraso
                        </span>
                      )}
                      {!registrosDoDia[ordem.id] && (ordem.status === "em_linha" || ordem.status === "aguardando_linha") && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded px-1 py-0 leading-4">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          aguardando registro
                        </span>
                      )}
                      {registrosDoDia[ordem.id] && (() => {
                        const reg = registrosDoDia[ordem.id];
                        const items: any[] = Array.isArray(reg.registro_producao) ? reg.registro_producao : [];
                        const total = items.reduce((s: number, it: any) => s + (it.qty || 0) * (it.peso || 0), 0);
                        const hi = reg.hora_inicio ? String(reg.hora_inicio).slice(0, 5) : null;
                        const hf = reg.hora_fim ? String(reg.hora_fim).slice(0, 5) : null;
                        return (
                          <span className="inline-flex flex-col gap-0 text-[10px] font-mono text-blue-700 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-tight">
                            {total > 0 && <span>{total.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</span>}
                            {hi && hf && <span>{hi}–{hf}</span>}
                          </span>
                        );
                      })()}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOrdemEditando(ordem as OrdemEditavel); }}
                      className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
                      title="Editar OP"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {(ordem.status === "em_linha" || ordem.status === "aguardando_linha") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOrdemParaRegistrar({ id: ordem.id, produto: ordem.produto }); setRegDia(ordem.data_programacao || dateStr); }}
                        className="mt-0.5 text-muted-foreground/50 hover:text-blue-600 shrink-0"
                        title="Registrar Dia"
                      >
                        <CalendarCheck2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(ordem.status === "em_linha" || ordem.status === "aguardando_linha") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOrdemParaForcar({ id: ordem.id, produto: ordem.produto, dataProgramacao: ordem.data_programacao, statusAnterior: ordem.status }); }}
                        className="mt-0.5 text-muted-foreground/50 hover:text-green-600 shrink-0"
                        title="Forçar Conclusão"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {ordem.status === "em_linha" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOrdemParaVoltar({ id: ordem.id, produto: ordem.produto }); }}
                        className="mt-0.5 text-muted-foreground/50 hover:text-amber-600 shrink-0"
                        title="Voltar para Fila"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setOrdemParaReprogramarCard({ id: ordem.id, produto: ordem.produto }); setNovaDataReprogramarCard(ordem.data_programacao || dateStr); }}
                      className="mt-0.5 text-muted-foreground/50 hover:text-primary shrink-0"
                      title="Reprogramar"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOrdemParaExcluir({ id: ordem.id, produto: ordem.produto }); }}
                      className="mt-0.5 text-muted-foreground/50 hover:text-destructive shrink-0"
                      title="Excluir OP"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fila por Balança */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Fila por Balança</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((balanca) => {
            const fila = ordensPorBalanca(balanca);
            const atual = fila.find((o) => o.status === "em_pesagem");
            return (
              <div key={balanca} className="bg-card rounded-lg border overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">Balança {balanca}</h3>
                </div>
                {atual ? (
                  <div className="mx-4 mb-3 rounded-lg border-2 border-status-weighing/40 bg-status-weighing-bg p-3 space-y-1">
                    <StatusBadge status="em_pesagem" />
                    <div className="flex items-baseline gap-2 flex-wrap mt-1">
                      <div className="text-base font-bold leading-tight">{atual.produto}</div>
                      <MarcaBadge marca={atual.marca} size="sm" />
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-extrabold text-primary">{atual.quantidade} kg</span>
                      <div className="text-sm text-muted-foreground">
                        Lote {atual.lote} · {format(new Date(atual.data_programacao), 'dd/MM/yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <button onClick={() => setOrdemEditando(atual as OrdemEditavel)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline">
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      <button onClick={() => setOrdemParaExcluir({ id: atual.id, produto: atual.produto })} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mx-4 mb-3 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                    Nenhuma ordem em pesagem
                  </div>
                )}
                <div className="px-4 pb-4 space-y-2">
                  {fila.filter((o) => o.status === "pendente").length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma ordem na fila</p>
                  )}
                  {fila.filter((o) => o.status === "pendente").map((ordem, idx, arr) => (
                    <div key={ordem.id} className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/50 border">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-status-open-bg text-status-open font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <div className="text-sm font-semibold truncate">{ordem.produto}</div>
                          <MarcaBadge marca={ordem.marca} size="sm" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Lote {ordem.lote} · {ordem.quantidade} kg · {format(new Date(ordem.data_programacao), 'dd/MM/yyyy')}
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button onClick={() => moverOrdem(ordem.id, "up", balanca)} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button onClick={() => moverOrdem(ordem.id, "down", balanca)} disabled={idx === arr.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      <button onClick={() => setOrdemEditando(ordem as OrdemEditavel)} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary shrink-0" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setOrdemParaExcluir({ id: ordem.id, produto: ordem.produto })} className="p-1 rounded hover:bg-destructive/10 text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={!!ordemParaReprogramarCard}
        onOpenChange={(open) => { if (!open) { setOrdemParaReprogramarCard(null); setNovaDataReprogramarCard(""); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reprogramar OP</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaReprogramarCard?.produto}</span>
              <br />
              Selecione a nova data de programação.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1.5">
            <label className="text-sm font-medium">Nova data</label>
            <input
              type="date"
              value={novaDataReprogramarCard}
              onChange={(e) => setNovaDataReprogramarCard(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaReprogramarCard(null)} disabled={salvandoRepr}>
              Cancelar
            </Button>
            <Button onClick={reprogramarCard} disabled={!novaDataReprogramarCard || salvandoRepr}>
              {salvandoRepr && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetalheOrdemDialog ordem={ordemDetalhe} onClose={() => setOrdemDetalhe(null)} />

      <EditarOrdemDialog
        ordem={ordemEditando}
        onClose={() => setOrdemEditando(null)}
        onSalvar={handleEditar}
      />

      <Dialog
        open={!!ordemParaForcar}
        onOpenChange={(open) => {
          if (!open) {
            setOrdemParaForcar(null);
            setForcarHoraInicio("");
            setForcarHoraFim("");
            setForcarProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
            setForcarQtdReal("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Forçar Conclusão</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaForcar?.produto}</span>
              <br />
              Registre os dados de produção para concluir esta OP manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={forcarHoraInicio}
                  onChange={(e) => setForcarHoraInicio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={forcarHoraFim}
                  onChange={(e) => setForcarHoraFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Registro de Produção</label>
              {forcarProdItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setForcarProdItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                    }}
                    placeholder="0"
                    className="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.peso}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9,]/g, "");
                      setForcarProdItems((prev) => prev.map((r, j) => j === i ? { ...r, peso: val } : r));
                    }}
                    placeholder="0,000 kg"
                    className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantidade Real (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                value={forcarQtdReal}
                onChange={(e) => setForcarQtdReal(e.target.value.replace(/[^0-9,]/g, ""))}
                placeholder="Opcional"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaForcar(null)} disabled={forcando}>
              Cancelar
            </Button>
            <Button onClick={handleForcarConclusao} disabled={forcando} className="bg-green-600 hover:bg-green-700 text-white">
              {forcando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Enviar para Liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ordemParaVoltar} onOpenChange={(open) => !open && setOrdemParaVoltar(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Voltar para a fila?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaVoltar?.produto}</span>
              <br />
              O status voltará de <strong>Em Linha</strong> para <strong>Aguardando Linha</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaVoltar(null)} disabled={voltando}>
              Cancelar
            </Button>
            <Button onClick={handleVoltarFila} disabled={voltando}>
              {voltando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ordemParaExcluir} onOpenChange={(open) => !open && setOrdemParaExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir ordem de produção?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaExcluir?.produto}</span>
              <br />
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaExcluir(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluirOrdem} disabled={excluindo}>
              {excluindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!ordemParaRegistrar}
        onOpenChange={(open) => {
          if (!open) {
            setOrdemParaRegistrar(null);
            setRegDia(todayStr);
            setRegHoraInicio("");
            setRegHoraFim("");
            setRegProdItems([{ qty: "", peso: "" }, { qty: "", peso: "" }]);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Dia</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemParaRegistrar?.produto}</span>
              <br />
              Insira o registro de produção para o dia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Data</label>
              <input
                type="date"
                value={regDia}
                onChange={(e) => setRegDia(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Início</label>
                <input
                  type="time"
                  value={regHoraInicio}
                  onChange={(e) => setRegHoraInicio(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora Fim</label>
                <input
                  type="time"
                  value={regHoraFim}
                  onChange={(e) => setRegHoraFim(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Registro de Produção</label>
              {regProdItems.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.qty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setRegProdItems((prev) => prev.map((r, j) => j === i ? { ...r, qty: val } : r));
                    }}
                    placeholder="0"
                    className="w-14 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">×</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.peso}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9,]/g, "");
                      setRegProdItems((prev) => prev.map((r, j) => j === i ? { ...r, peso: val } : r));
                    }}
                    placeholder="0,000 kg"
                    className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemParaRegistrar(null)} disabled={registrando}>
              Cancelar
            </Button>
            <Button onClick={handleRegistrarDia} disabled={registrando || !regDia} className="bg-blue-600 hover:bg-blue-700 text-white">
              {registrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CalendarCheck2 className="mr-1.5 h-4 w-4" />
              Salvar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
