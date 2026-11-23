import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatKg } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, X, Plus, Trash2, Wrench } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';

interface OrdemBusca { id: string; lote: string; produto: string; formula_id: string | null; status: string; marca: string | null }
interface MpSug { cod: string; nome: string; marca: 'ZC' | 'PG' }
interface AcertoItem { cod: string; materia_prima: string; qty: number; marca: 'ZC' | 'PG' }

export default function NovoAcerto({ perfilNome }: { perfilNome: string }) {
  const [opBusca, setOpBusca] = useState('');
  const [opSug, setOpSug] = useState<OrdemBusca[]>([]);
  const [showOpSug, setShowOpSug] = useState(false);
  const [op, setOp] = useState<OrdemBusca | null>(null);

  const [matBusca, setMatBusca] = useState('');
  const [matSug, setMatSug] = useState<MpSug[]>([]);
  const [showMatSug, setShowMatSug] = useState(false);
  const [matSel, setMatSel] = useState<MpSug | null>(null);
  const [matQty, setMatQty] = useState('');

  const [itens, setItens] = useState<AcertoItem[]>([]);
  const [requerMistura, setRequerMistura] = useState(false);
  const [balanca, setBalanca] = useState('1');
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);

  const opDeb = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matDeb = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (opDeb.current) clearTimeout(opDeb.current);
    if (op || opBusca.trim().length < 1) { setOpSug([]); setShowOpSug(false); return; }
    opDeb.current = setTimeout(async () => {
      const q = opBusca.trim();
      const { data } = await supabase.from('ordens')
        .select('id, lote, produto, formula_id, status, marca')
        .neq('eh_acerto', true)
        .or(`lote.ilike.%${q}%,produto.ilike.%${q}%`)
        .order('criado_em', { ascending: false }).limit(15);
      setOpSug((data ?? []) as OrdemBusca[]); setShowOpSug(true);
    }, 250);
    return () => { if (opDeb.current) clearTimeout(opDeb.current); };
  }, [opBusca, op]);

  useEffect(() => {
    if (matDeb.current) clearTimeout(matDeb.current);
    if (matSel || matBusca.trim().length < 2) { setMatSug([]); setShowMatSug(false); return; }
    matDeb.current = setTimeout(async () => {
      const q = matBusca.trim();
      const ehPigma = op?.marca === 'Pigma';
      let sug: MpSug[] = [];
      if (ehPigma) {
        const pg = await (supabase as any).from('estoque_mp_pg').select('cod_pg, materia_prima').or(`materia_prima.ilike.%${q}%,cod_pg.ilike.%${q}%`).order('materia_prima').limit(15);
        sug = ((pg.data ?? []) as any[]).map((r) => ({ cod: String(r.cod_pg), nome: r.materia_prima, marca: 'PG' as const }));
      } else {
        const zc = await (supabase as any).from('estoque_mp').select('cod_tid, materia_prima').or(`materia_prima.ilike.%${q}%,cod_tid.ilike.%${q}%`).order('materia_prima').limit(15);
        sug = ((zc.data ?? []) as any[]).map((r) => ({ cod: String(r.cod_tid), nome: r.materia_prima, marca: 'ZC' as const }));
      }
      setMatSug(sug); setShowMatSug(true);
    }, 250);
    return () => { if (matDeb.current) clearTimeout(matDeb.current); };
  }, [matBusca, matSel, op]);

  const adicionarItem = () => {
    if (!matSel) { toast({ title: 'Selecione o material', variant: 'destructive' }); return; }
    const q = parseFloat(matQty.replace(',', '.'));
    if (!matQty || isNaN(q) || q <= 0) { toast({ title: 'Informe o kg', variant: 'destructive' }); return; }
    setItens((prev) => [...prev, { cod: matSel.cod, materia_prima: matSel.nome, qty: q, marca: matSel.marca }]);
    setMatSel(null); setMatBusca(''); setMatQty(''); setMatSug([]); setShowMatSug(false);
  };

  const criar = async () => {
    if (salvandoRef.current) return;
    if (!op) { toast({ title: 'Selecione a OP que está sendo acertada', variant: 'destructive' }); return; }
    if (itens.length === 0) { toast({ title: 'Adicione pelo menos um material', variant: 'destructive' }); return; }
    salvandoRef.current = true;
    setSalvando(true);
    try {
      const balNum = parseInt(balanca);
      const totalKg = itens.reduce((s, i) => s + i.qty, 0);
      const hoje = new Date().toISOString().split('T')[0];

      const { data: ult } = await (supabase as any).from('ordens')
        .select('posicao_balanca').eq('balanca', balNum).in('status', ['pendente', 'em_pesagem'])
        .order('posicao_balanca', { ascending: false, nullsFirst: false }).limit(1);
      const prox = (ult?.[0]?.posicao_balanca ?? 0) + 1;

      const { data: nova, error } = await (supabase as any).from('ordens').insert({
        produto: `ACERTO · ${op.produto}`,
        lote: op.lote,
        quantidade: totalKg,
        status: 'pendente',
        balanca: balNum,
        posicao_balanca: prox,
        linha: null,
        requer_mistura: requerMistura,
        eh_acerto: true,
        acerto_lote: op.lote,
        acerto_formula_id: op.formula_id,
        formula_id: null,
        tamanho_batelada: null,
        data_programacao: hoje,
      }).select('id').single();

      if (error || !nova) {
        toast({ title: 'Erro ao criar acerto', description: error?.message, variant: 'destructive' });
        return;
      }

      const { error: errItens } = await (supabase as any).from('ordens_formula').insert(
        itens.map((it, idx) => ({ ordem_id: nova.id, sequencia: idx + 1, materia_prima: it.materia_prima, quantidade_kg: it.qty, cod_mp: it.cod }))
      );

      if (errItens) {
        toast({ title: 'Acerto criado, mas erro nos itens', description: errItens.message, variant: 'destructive' });
        return;
      }

      toast({ title: 'Ordem de acerto criada!', description: `Enviada para a balança ${balNum}.` });
      setOp(null); setOpBusca(''); setItens([]); setRequerMistura(false); setMatSel(null); setMatBusca(''); setMatQty('');
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Nova Ordem de Acerto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OP acertada */}
          <div className="space-y-1.5 relative">
            <Label>OP que está sendo acertada *</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Buscar por lote ou produto…"
                value={op ? `Lote ${op.lote} – ${op.produto}` : opBusca}
                onChange={(e) => { if (op) setOp(null); setOpBusca(e.target.value); }}
                onFocus={() => { if (opBusca.length >= 1 && !op) setShowOpSug(true); }}
                onBlur={() => setTimeout(() => setShowOpSug(false), 150)}
                className="pl-8 pr-8" />
              {(opBusca || op) && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setOpBusca(''); setOp(null); setOpSug([]); setShowOpSug(false); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {showOpSug && opSug.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                {opSug.map((o) => (
                  <button key={o.id} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setOp(o); setOpBusca(''); setShowOpSug(false); }}>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">Lote {o.lote}</span>
                    <span className="flex-1 min-w-0 truncate">{o.produto}</span>
                    {o.marca && <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${o.marca === 'Pigma' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{o.marca}</span>}
                    <StatusBadge status={o.status} className="shrink-0 text-[10px]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Materiais */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">Materiais do acerto</p>
            <div className="space-y-1.5 relative">
              <Label className="text-xs">Material (estoque)</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input placeholder="Buscar MP por código ou nome…"
                  value={matSel ? `${matSel.cod} – ${matSel.nome}` : matBusca}
                  onChange={(e) => { if (matSel) setMatSel(null); setMatBusca(e.target.value); }}
                  onFocus={() => { if (matBusca.length >= 2 && !matSel) setShowMatSug(true); }}
                  onBlur={() => setTimeout(() => setShowMatSug(false), 150)}
                  className={`pl-8 pr-8 ${matSel?.marca === 'PG' ? 'text-red-600 font-medium' : ''}`} />
                {(matBusca || matSel) && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => { setMatBusca(''); setMatSel(null); setMatSug([]); setShowMatSug(false); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showMatSug && matSug.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                  {matSug.map((m) => (
                    <button key={m.cod} className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors ${m.marca === 'PG' ? 'text-red-600' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setMatSel(m); setMatBusca(''); setShowMatSug(false); }}>
                      <span className={`font-mono text-xs shrink-0 ${m.marca === 'PG' ? 'text-red-500' : 'text-muted-foreground'}`}>{m.cod}</span>
                      <span className="flex-1 min-w-0 truncate">{m.nome}</span>
                      {m.marca === 'PG' && <span className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">PG</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Quantidade (kg)</Label>
                <Input type="text" inputMode="decimal" placeholder="0,000" value={matQty} onChange={(e) => setMatQty(e.target.value)} />
              </div>
              <Button type="button" variant="outline" onClick={adicionarItem}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
            </div>

            {itens.length > 0 && (
              <div className="divide-y border rounded-md">
                {itens.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 truncate">
                      <span className={`font-medium ${it.marca === 'PG' ? 'text-red-600' : ''}`}>{it.materia_prima}</span>
                      <span className={`font-mono text-xs ml-2 ${it.marca === 'PG' ? 'text-red-500' : 'text-muted-foreground'}`}>{it.cod}</span>
                      {it.marca === 'PG' && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">PG</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold tabular-nums">{formatKg(it.qty)} kg</span>
                      <button onClick={() => setItens((prev) => prev.filter((_, j) => j !== i))} className="text-destructive hover:opacity-70"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 text-sm font-semibold bg-muted/40">
                  <span>Total</span>
                  <span className="tabular-nums">{formatKg(itens.reduce((s, i) => s + i.qty, 0))} kg</span>
                </div>
              </div>
            )}
          </div>

          {/* Mistura + Balança */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 rounded-md border px-3 py-2.5">
              <span className="flex-1 text-sm font-medium">Requer mistura?</span>
              <Switch checked={requerMistura} onCheckedChange={setRequerMistura} />
            </div>
            <div className="space-y-1.5">
              <Label>Balança</Label>
              <Select value={balanca} onValueChange={setBalanca}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Balança 1</SelectItem>
                  <SelectItem value="2">Balança 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={criar} disabled={salvando} className="w-full sm:w-auto">
            {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Criar ordem de acerto
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
