import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { estornarEstoqueOP, ajustarEstoqueOP, baixarEstoqueOP } from '@/lib/estoqueUtils';
import { MarcaBadge } from '@/components/MarcaBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { EditarOrdemDialog } from '@/components/EditarOrdemDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, Search, CalendarDays, Pencil, Trash2, Inbox, ChevronDown } from 'lucide-react';
import { formatKg, cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getNextPosicao } from '@/lib/recalcularPosicoes';

interface OrdemPre {
  id: string;
  produto: string;
  lote: string;
  quantidade: number;
  marca: string | null;
  requer_mistura: boolean | null;
  criado_em: string | null;
  tipo_op: string | null;
  obs: string | null;
  formula_id: string | null;
  tamanho_batelada: number | null;
  orientacoes: string | null;
  status: string;
  linha: number | null;
  balanca: number | null;
  posicao: number | null;
}

export default function PreProgramacao() {
  const [ordens, setOrdens] = useState<OrdemPre[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  // Programar dialog
  const [ordemProgramar, setOrdemProgramar] = useState<OrdemPre | null>(null);
  const [dataProg, setDataProg] = useState('');
  const [linha, setLinha] = useState('');
  const [balanca, setBalanca] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Editar
  const [ordemEditar, setOrdemEditar] = useState<OrdemPre | null>(null);

  // Expansão dos cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) =>
    setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  // Excluir
  const [ordemExcluir, setOrdemExcluir] = useState<OrdemPre | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const fetchOrdens = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ordens')
      .select('id, produto, lote, quantidade, marca, requer_mistura, criado_em, tipo_op, obs, formula_id, tamanho_batelada, orientacoes, status, linha, balanca, posicao')
      .eq('status', 'pre_programacao')
      .order('criado_em', { ascending: true });
    if (!error && data) setOrdens(data as OrdemPre[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrdens();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('pre-programacao-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchOrdens(), 800);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchOrdens]);

  const ordensFiltradas = ordens.filter((o) => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    return o.produto.toLowerCase().includes(q) || o.lote.toLowerCase().includes(q);
  });

  const programar = async () => {
    if (!ordemProgramar || !dataProg || !linha) return;
    setSalvando(true);
    const linhaNum = parseInt(linha);
    const posicao = await getNextPosicao(linhaNum);
    const { error } = await supabase
      .from('ordens')
      .update({
        status: 'pendente',
        data_programacao: dataProg,
        linha: linhaNum,
        balanca: balanca ? parseInt(balanca) : null,
        posicao,
      } as any)
      .eq('id', ordemProgramar.id);
    setSalvando(false);
    if (error) {
      toast({ title: 'Erro ao programar OP', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('historico').insert({
      ordem_id: ordemProgramar.id,
      status_anterior: 'pre_programacao',
      status_novo: 'pendente',
    });
    toast({ title: 'OP programada com sucesso!', description: `${ordemProgramar.produto} → Linha ${linhaNum}, ${dataProg}` });
    setOrdemProgramar(null);
    setDataProg('');
    setLinha('');
    setBalanca('');
    fetchOrdens();
  };

  const excluir = async () => {
    if (!ordemExcluir) return;
    setExcluindo(true);
    // Estorna o estoque antes de excluir
    try { await estornarEstoqueOP(ordemExcluir.id); } catch { /* falha silenciosa */ }
    const { error } = await supabase.from('ordens').delete().eq('id', ordemExcluir.id);
    setExcluindo(false);
    if (error) {
      toast({ title: 'Erro ao excluir OP', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'OP excluída' });
    setOrdemExcluir(null);
    fetchOrdens();
  };

  const editar = async (id: string, payload: Record<string, unknown>) => {
    const qtdAntiga = ordemEditar?.quantidade;
    const formulaIdAntigo = ordemEditar?.formula_id ?? null;
    const lote = String(ordemEditar?.lote ?? "");

    const { error } = await supabase.from('ordens').update(payload as any).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao editar OP', description: error.message, variant: 'destructive' });
      return;
    }
    await fetchOrdens();
    toast({ title: 'OP atualizada' });

    try {
      const qtdNova = payload.quantidade as number | undefined;
      const formulaIdNovo = "formula_id" in payload ? (payload.formula_id as string | null) : formulaIdAntigo;
      const formulaMudou = formulaIdNovo !== formulaIdAntigo;

      if (qtdAntiga !== undefined && qtdNova !== undefined) {
        if (formulaMudou) {
          await estornarEstoqueOP(id);
          if (formulaIdNovo) await baixarEstoqueOP(id, formulaIdNovo, qtdNova, lote);
        } else if (qtdNova !== qtdAntiga && formulaIdAntigo) {
          await ajustarEstoqueOP(id, formulaIdAntigo, qtdAntiga, qtdNova, lote);
        }
      }
    } catch (err: any) {
      toast({ title: 'Aviso: falha ao atualizar estoque', description: err?.message ?? 'Erro desconhecido', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Pré-Programação</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            OPs aguardando data e linha de produção
          </p>
        </div>
        {!loading && (
          <span className="text-sm font-bold bg-primary text-primary-foreground rounded-full px-3 py-1 shrink-0">
            {ordens.length} OP{ordens.length !== 1 ? 's' : ''} aguardando
          </span>
        )}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por produto ou lote..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
          <Inbox className="h-12 w-12 opacity-20" />
          <p className="text-sm">
            {busca ? 'Nenhuma OP encontrada para esta busca.' : 'Nenhuma OP aguardando programação.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ordensFiltradas.map((ordem) => {
            const isOpen = expandedIds.has(ordem.id);
            return (
              <div key={ordem.id} className="rounded-xl border bg-card select-none">

                {/* ── Cabeçalho — sempre visível ─────────────────── */}
                <div className="flex items-start gap-1.5 px-3 py-2.5">
                  {/* Bolinha de status */}
                  <span className="mt-1 h-2 w-2 rounded-full shrink-0 bg-slate-400 dark:bg-slate-500" />

                  {/* Produto + Quantidade */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-snug break-words">{ordem.produto}</p>
                    <p className="text-xs font-bold tabular-nums text-muted-foreground mt-0.5">{formatKg(ordem.quantidade)} kg</p>
                  </div>

                  {/* Programar compacto — sempre visível */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] gap-1 shrink-0 mt-0.5 border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                    onClick={(e) => { e.stopPropagation(); setOrdemProgramar(ordem); setDataProg(''); setLinha(''); setBalanca(''); }}
                  >
                    <CalendarDays className="h-3 w-3" />
                    Programar
                  </Button>

                  {/* Chevron */}
                  <button
                    onClick={() => toggleCard(ordem.id)}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-expanded={isOpen}
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')} />
                  </button>
                </div>

                {/* ── Corpo expansível ───────────────────────────── */}
                <div className={cn('grid transition-[grid-template-rows] duration-200', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-1.5 space-y-1.5 border-t border-black/5 dark:border-white/10">

                      {/* Lote + marca */}
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono">Lote {ordem.lote}</span>
                        <MarcaBadge marca={ordem.marca} size="sm" />
                      </p>

                      {/* Dados */}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {ordem.criado_em && (
                          <div className="flex justify-between">
                            <span>Criada em</span>
                            <span className="font-mono">
                              {format(parseISO(ordem.criado_em), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Mistura</span>
                          <span className={ordem.requer_mistura === false ? 'text-muted-foreground' : 'text-foreground'}>
                            {ordem.requer_mistura === false ? 'Não requer' : 'Requer'}
                          </span>
                        </div>
                        {ordem.tipo_op && ordem.tipo_op !== 'venda' && (
                          <div className="flex justify-between">
                            <span>Tipo</span>
                            <span className="capitalize text-foreground">{ordem.tipo_op}</span>
                          </div>
                        )}
                      </div>

                      <StatusBadge status="pre_programacao" className="text-[10px] px-1.5 py-0" />

                      {/* Ações secundárias */}
                      <div className="flex gap-1 pt-1 border-t border-black/5 dark:border-white/10">
                        <button
                          onClick={() => setOrdemEditar(ordem as any)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar
                        </button>
                        <button
                          onClick={() => setOrdemExcluir(ordem)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-3 w-3" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Programar OP */}
      <Dialog
        open={!!ordemProgramar}
        onOpenChange={(open) => { if (!open) { setOrdemProgramar(null); setDataProg(''); setLinha(''); setBalanca(''); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Programar OP</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemProgramar?.produto}</span>
              <br />
              Escolha a data e a linha — a OP entra no kanban com status <strong>Pendente</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Data de programação <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={dataProg}
                onChange={(e) => setDataProg(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Linha <span className="text-destructive">*</span>
              </label>
              <Select value={linha} onValueChange={setLinha}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a linha" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>Linha {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Balança</label>
              <Select value={balanca} onValueChange={setBalanca}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Balança 1</SelectItem>
                  <SelectItem value="2">Balança 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemProgramar(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button disabled={!dataProg || !linha || salvando} onClick={programar}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar para Kanban
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Excluir */}
      <Dialog open={!!ordemExcluir} onOpenChange={(open) => !open && setOrdemExcluir(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir ordem de produção?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{ordemExcluir?.produto}</span>
              <br />
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOrdemExcluir(null)} disabled={excluindo}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={excluir} disabled={excluindo}>
              {excluindo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <EditarOrdemDialog
        ordem={ordemEditar}
        onClose={() => setOrdemEditar(null)}
        onSave={editar}
      />
    </div>
  );
}
