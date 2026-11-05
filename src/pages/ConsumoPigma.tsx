import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatKg } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Search, X, Trash2, Boxes } from 'lucide-react';

interface MpPg { cod_pg: string; materia_prima: string; saldo_kg: number }
interface MovPg {
  id: string; cod_pg: string; materia_prima: string; tipo: string;
  quantidade_kg: number; saldo_apos: number; observacao: string | null;
  criado_por: string; criado_em: string;
}

function fmtDatetime(iso: string) {
  const d = new Date(/[Z+]/.test(iso) ? iso : iso + 'Z');
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
}

export default function ConsumoPigma({ perfilNome }: { perfilNome: string }) {
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<MpPg[]>([]);
  const [showSug, setShowSug] = useState(false);
  const [mpSel, setMpSel] = useState<MpPg | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [movs, setMovs] = useState<MovPg[]>([]);
  const [carregando, setCarregando] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (busca.length < 2) { setSugestoes([]); setShowSug(false); return; }
    debRef.current = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('estoque_mp_pg')
        .select('cod_pg, materia_prima, saldo_kg')
        .or(`materia_prima.ilike.%${busca}%,cod_pg.ilike.%${busca}%`)
        .order('materia_prima')
        .limit(20);
      setSugestoes((data ?? []) as MpPg[]);
      setShowSug(true);
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [busca]);

  const fetchMovs = useCallback(async () => {
    setCarregando(true);
    const { data } = await (supabase as any)
      .from('estoque_movimentacoes_pg')
      .select('id, cod_pg, materia_prima, tipo, quantidade_kg, saldo_apos, observacao, criado_por, criado_em')
      .eq('tipo', 'saida')
      .order('criado_em', { ascending: false })
      .limit(50);
    setMovs((data ?? []) as MovPg[]);
    setCarregando(false);
  }, []);
  useEffect(() => { fetchMovs(); }, [fetchMovs]);

  async function registrar() {
    if (!mpSel) { toast({ title: 'Selecione uma matéria-prima Pigma', variant: 'destructive' }); return; }
    const qtd = parseFloat(quantidade.replace(',', '.'));
    if (!quantidade || isNaN(qtd) || qtd <= 0) { toast({ title: 'Informe uma quantidade válida (> 0)', variant: 'destructive' }); return; }
    setSalvando(true);
    const agora = new Date().toISOString();
    const { data: row } = await (supabase as any)
      .from('estoque_mp_pg').select('saldo_kg').eq('cod_pg', mpSel.cod_pg).maybeSingle();
    const novoSaldo = (row?.saldo_kg ?? 0) - qtd;
    const { error } = await (supabase as any).from('estoque_movimentacoes_pg').insert({
      cod_pg: mpSel.cod_pg,
      materia_prima: mpSel.materia_prima,
      tipo: 'saida',
      quantidade_kg: -qtd,
      saldo_apos: novoSaldo,
      observacao: observacao.trim() || 'Retirada manual Pigma',
      criado_por: perfilNome,
      criado_em: agora,
    });
    if (error) { setSalvando(false); toast({ title: 'Erro ao registrar', description: error.message, variant: 'destructive' }); return; }
    await (supabase as any).from('estoque_mp_pg').update({ saldo_kg: novoSaldo, atualizado_em: agora }).eq('cod_pg', mpSel.cod_pg);
    setSalvando(false);
    toast(novoSaldo < 0
      ? { title: 'Retirada registrada', description: `Atenção: saldo de ${mpSel.materia_prima} ficou negativo (${formatKg(novoSaldo)} kg).` }
      : { title: 'Retirada registrada com sucesso!' });
    setBusca(''); setMpSel(null); setQuantidade(''); setObservacao(''); setSugestoes([]); setShowSug(false);
    fetchMovs();
    setTimeout(() => buscaRef.current?.focus(), 100);
  }

  async function excluir(m: MovPg) {
    if (!confirm('Excluir esta retirada e devolver o saldo?')) return;
    const agora = new Date().toISOString();
    const { error } = await (supabase as any).from('estoque_movimentacoes_pg').delete().eq('id', m.id);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    const { data: row } = await (supabase as any).from('estoque_mp_pg').select('saldo_kg').eq('cod_pg', m.cod_pg).maybeSingle();
    if (row) {
      const novoSaldo = (row.saldo_kg ?? 0) - m.quantidade_kg; // quantidade_kg é negativo → devolve
      await (supabase as any).from('estoque_mp_pg').update({ saldo_kg: novoSaldo, atualizado_em: agora }).eq('cod_pg', m.cod_pg);
    }
    toast({ title: 'Retirada excluída e saldo devolvido' });
    fetchMovs();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4" /> Retirada de MP — Pigma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 relative">
            <Label>Matéria-Prima (Pigma) *</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={buscaRef}
                placeholder="Buscar por código ou descrição…"
                value={mpSel ? `${mpSel.cod_pg} – ${mpSel.materia_prima}` : busca}
                onChange={e => { if (mpSel) setMpSel(null); setBusca(e.target.value); }}
                onFocus={() => { if (busca.length >= 2 && !mpSel) setShowSug(true); }}
                onBlur={() => setTimeout(() => setShowSug(false), 150)}
                className="pl-8 pr-8"
              />
              {(busca || mpSel) && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setBusca(''); setMpSel(null); setSugestoes([]); setShowSug(false); buscaRef.current?.focus(); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {showSug && sugestoes.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                {sugestoes.map(mp => (
                  <button key={mp.cod_pg}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setMpSel(mp); setBusca(''); setShowSug(false); }}>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{mp.cod_pg}</span>
                    <span className="flex-1 min-w-0 truncate">{mp.materia_prima}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatKg(mp.saldo_kg ?? 0)} kg</span>
                  </button>
                ))}
              </div>
            )}
            {showSug && busca.length >= 2 && sugestoes.length === 0 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">
                Nenhuma MP Pigma encontrada para "{busca}"
              </div>
            )}
          </div>

          {mpSel && <p className="text-xs text-muted-foreground">Saldo atual: <strong className="text-foreground">{formatKg(mpSel.saldo_kg ?? 0)} kg</strong></p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Quantidade (kg) *</Label>
              <Input type="text" inputMode="decimal" placeholder="0,000" value={quantidade} onChange={e => setQuantidade(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea placeholder="Finalidade, destino, etc." value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} />
          </div>

          <Button onClick={registrar} disabled={salvando} className="w-full sm:w-auto">
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Registrar Retirada Pigma
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Últimas retiradas — Pigma</CardTitle></CardHeader>
        <CardContent>
          {carregando ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : movs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma retirada registrada.</p>
          ) : (
            <div className="divide-y">
              {movs.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.materia_prima} <span className="font-mono text-xs text-muted-foreground">{m.cod_pg}</span></div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {fmtDatetime(m.criado_em)} · {m.criado_por} · saldo após {formatKg(m.saldo_apos)} kg{m.observacao ? ` · ${m.observacao}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">-{formatKg(Math.abs(m.quantidade_kg))} kg</span>
                    <button onClick={() => excluir(m)} title="Excluir e devolver saldo" className="p-1.5 rounded hover:bg-muted text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
