import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, Eraser, CalendarDays } from 'lucide-react';

interface Reuniao { id: string; titulo: string; pauta: string | null; data: string; }
interface Operador { id: string; nome: string; }

export default function ReunioesOperador() {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [reuniaoSel, setReuniaoSel] = useState<Reuniao | null>(null);
  const [operadorId, setOperadorId] = useState('');
  const [jaAssinados, setJaAssinados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  const temTraco = useRef(false);

  useEffect(() => {
    (async () => {
      const [r, o] = await Promise.all([
        (supabase as any).from('reunioes').select('id, titulo, pauta, data').eq('status', 'aberta').order('data', { ascending: false }),
        (supabase as any).from('operadores').select('id, nome').eq('ativo', true).order('nome'),
      ]);
      setReunioes((r.data ?? []) as Reuniao[]);
      setOperadores((o.data ?? []) as Operador[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!reuniaoSel) { setJaAssinados(new Set()); return; }
    (supabase as any).from('reuniao_presencas').select('operador_id').eq('reuniao_id', reuniaoSel.id)
      .then(({ data }: any) => setJaAssinados(new Set((data ?? []).map((p: any) => p.operador_id))));
  }, [reuniaoSel]);

  const pos = (e: any) => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * (c.width / rect.width), y: (p.clientY - rect.top) * (c.height / rect.height) };
  };
  const start = (e: any) => { e.preventDefault(); desenhando.current = true; const ctx = canvasRef.current!.getContext('2d')!; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e: any) => { if (!desenhando.current) return; e.preventDefault(); const ctx = canvasRef.current!.getContext('2d')!; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.strokeStyle = '#111'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); temTraco.current = true; };
  const end = () => { desenhando.current = false; };
  const limpar = () => { const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); temTraco.current = false; };

  const confirmar = async () => {
    if (!reuniaoSel) { toast({ title: 'Selecione a reunião', variant: 'destructive' }); return; }
    if (!operadorId) { toast({ title: 'Selecione seu nome', variant: 'destructive' }); return; }
    if (!temTraco.current) { toast({ title: 'Assine no quadro antes de confirmar', variant: 'destructive' }); return; }
    const op = operadores.find((o) => o.id === operadorId);
    const assinatura = canvasRef.current!.toDataURL('image/png');
    setSalvando(true);
    const { error } = await (supabase as any).from('reuniao_presencas').insert({
      reuniao_id: reuniaoSel.id, operador_id: operadorId, operador_nome: op?.nome ?? '', assinatura,
    });
    setSalvando(false);
    if (error) {
      const dup = (error as any).code === '23505';
      toast({ title: dup ? 'Você já assinou esta reunião' : 'Erro ao confirmar', description: dup ? undefined : error.message, variant: 'destructive' });
      if (dup) setJaAssinados((prev) => new Set([...prev, operadorId]));
      return;
    }
    toast({ title: 'Presença confirmada!', description: `${op?.nome} — ${reuniaoSel.titulo}` });
    setJaAssinados((prev) => new Set([...prev, operadorId]));
    setOperadorId('');
    limpar();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (reunioes.length === 0) return <div className="max-w-xl mx-auto text-center text-muted-foreground py-10">Nenhuma reunião aberta no momento.</div>;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-lg font-bold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Confirmar presença em reunião</h1>

      <div className="space-y-2">
        {reunioes.map((r) => (
          <button key={r.id} onClick={() => setReuniaoSel(r)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${reuniaoSel?.id === r.id ? 'border-primary bg-primary/5' : 'hover:bg-accent'}`}>
            <p className="font-semibold">{r.titulo}</p>
            <p className="text-xs text-muted-foreground">{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
          </button>
        ))}
      </div>

      {reuniaoSel && (
        <div className="rounded-xl border p-4 space-y-4">
          {reuniaoSel.pauta && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Pauta</p>
              <p className="text-sm whitespace-pre-wrap">{reuniaoSel.pauta}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Seu nome</label>
            <Select value={operadorId} onValueChange={setOperadorId}>
              <SelectTrigger><SelectValue placeholder="Selecione seu nome" /></SelectTrigger>
              <SelectContent>
                {operadores.map((o) => (
                  <SelectItem key={o.id} value={o.id} disabled={jaAssinados.has(o.id)}>
                    {o.nome}{jaAssinados.has(o.id) ? ' (já assinou)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Assinatura</label>
              <Button type="button" variant="ghost" size="sm" onClick={limpar}><Eraser className="h-4 w-4 mr-1" /> Limpar</Button>
            </div>
            <canvas ref={canvasRef} width={600} height={200}
              className="w-full h-40 rounded-md border bg-white touch-none"
              onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
              onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
            <p className="text-xs text-muted-foreground">Assine com o dedo no quadro acima.</p>
          </div>
          <Button onClick={confirmar} disabled={salvando} className="w-full bg-status-done hover:bg-status-done/90 text-primary-foreground">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirmar presença
          </Button>
        </div>
      )}
    </div>
  );
}
