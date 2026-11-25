import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, CalendarDays, ChevronDown, Lock, Unlock, Trash2, Printer, Users, X } from 'lucide-react';

interface Reuniao { id: string; titulo: string; pauta: string | null; data: string; status: string; criado_em: string; }
interface Presenca { id: string; operador_nome: string; assinatura: string | null; assinou_em: string; }

export default function GestaoReunioes({ perfilNome }: { perfilNome: string }) {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0]);
  const [assuntos, setAssuntos] = useState<{ texto: string; ok: boolean }[]>([{ texto: '', ok: false }]);
  const [criando, setCriando] = useState(false);
  const [expandId, setExpandId] = useState<string | null>(null);
  const [presencas, setPresencas] = useState<Record<string, Presenca[]>>({});
  const [loadingPres, setLoadingPres] = useState(false);

  const fetchReunioes = async () => {
    const { data: d } = await (supabase as any).from('reunioes')
      .select('id, titulo, pauta, data, status, criado_em')
      .order('criado_em', { ascending: false });
    setReunioes((d ?? []) as Reuniao[]);
    setLoading(false);
  };
  useEffect(() => { fetchReunioes(); }, []);

  const criar = async () => {
    if (!titulo.trim()) { toast({ title: 'Informe o título', variant: 'destructive' }); return; }
    setCriando(true);
    const { error } = await (supabase as any).from('reunioes').insert({
      titulo: titulo.trim(),
      pauta: assuntos
        .filter((a) => a.texto.trim())
        .map((a) => (a.ok ? '✔ ' : '') + a.texto.trim())
        .join('\n') || null,
      data, status: 'aberta', criado_por: perfilNome,
    });
    setCriando(false);
    if (error) { toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Reunião criada e aberta para assinatura!' });
    setTitulo(''); setAssuntos([{ texto: '', ok: false }]); setData(new Date().toISOString().split('T')[0]);
    fetchReunioes();
  };

  const toggleStatus = async (r: Reuniao) => {
    const novo = r.status === 'aberta' ? 'fechada' : 'aberta';
    const { error } = await (supabase as any).from('reunioes').update({ status: novo }).eq('id', r.id);
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: novo === 'aberta' ? 'Reunião reaberta' : 'Reunião fechada' });
    setReunioes((prev) => prev.map((x) => x.id === r.id ? { ...x, status: novo } : x));
  };

  const excluir = async (r: Reuniao) => {
    if (!confirm(`Excluir a reunião "${r.titulo}" e todas as assinaturas?`)) return;
    const { error } = await (supabase as any).from('reunioes').delete().eq('id', r.id);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Reunião excluída' });
    setReunioes((prev) => prev.filter((x) => x.id !== r.id));
  };

  const abrir = async (r: Reuniao) => {
    if (expandId === r.id) { setExpandId(null); return; }
    setExpandId(r.id);
    if (!presencas[r.id]) {
      setLoadingPres(true);
      const { data: d } = await (supabase as any).from('reuniao_presencas')
        .select('id, operador_nome, assinatura, assinou_em')
        .eq('reuniao_id', r.id).order('assinou_em', { ascending: true });
      setPresencas((prev) => ({ ...prev, [r.id]: (d ?? []) as Presenca[] }));
      setLoadingPres(false);
    }
  };

  const gerarPDF = async (r: Reuniao) => {
    const lista = presencas[r.id] ?? [];
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    let y = 15;
    doc.setFontSize(16); doc.text('Ata de Reunião', 14, y); y += 8;
    doc.setFontSize(12); doc.text(r.titulo, 14, y); y += 6;
    doc.setFontSize(10); doc.text(`Data: ${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}`, 14, y); y += 8;
    if (r.pauta) {
      doc.setFontSize(11); doc.text('Pauta:', 14, y); y += 5;
      doc.setFontSize(10);
      const assuntosPDF = r.pauta.split('\n').filter(Boolean);
      for (const assunto of assuntosPDF) {
        if (y > 255) { doc.addPage(); y = 15; }
        const marcado = assunto.startsWith('✔ ');
        const texto = marcado ? assunto.slice(2) : assunto;
        // quadradinho (com ✓ desenhado se marcado)
        doc.setDrawColor(80);
        doc.rect(14, y - 3.5, 4, 4);
        if (marcado) {
          doc.line(14.8, y - 1.5, 15.8, y - 0.3);
          doc.line(15.8, y - 0.3, 17.4, y - 3);
        }
        // texto do assunto (quebra se for longo)
        const linhas = doc.splitTextToSize(texto, 80);
        doc.text(linhas, 20, y);
        y += linhas.length * 5 + 2;
      }
      y += 2;
    }
    doc.setFontSize(11); doc.text(`Participantes (${lista.length}):`, 14, y); y += 7;
    doc.setFontSize(10);
    for (const p of lista) {
      if (y > 255) { doc.addPage(); y = 15; }
      doc.text(`${p.operador_nome}  —  ${new Date(p.assinou_em).toLocaleString('pt-BR')}`, 14, y); y += 2;
      if (p.assinatura) { try { doc.addImage(p.assinatura, 'PNG', 14, y, 55, 20); } catch {} y += 24; }
      else { y += 6; }
      doc.setDrawColor(200); doc.line(14, y, 194, y); y += 5;
    }
    doc.save(`ata_${r.titulo.replace(/\s+/g, '_')}.pdf`);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Reuniões</h1>

      <div className="rounded-xl border p-4 space-y-3">
        <p className="font-semibold">Nova reunião</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Reunião de segurança — Novembro" />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Pauta / assuntos</Label>
          <div className="space-y-2">
            {assuntos.map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={a.ok}
                  onChange={(e) => setAssuntos((prev) => prev.map((x, j) => j === i ? { ...x, ok: e.target.checked } : x))}
                  className="h-5 w-5 accent-primary shrink-0 cursor-pointer"
                />
                <input
                  value={a.texto}
                  onChange={(e) => setAssuntos((prev) => prev.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setAssuntos((prev) => [...prev.slice(0, i + 1), { texto: '', ok: false }, ...prev.slice(i + 1)]);
                    }
                  }}
                  placeholder={`Assunto ${i + 1}`}
                  className="flex-1 bg-transparent border-0 border-b border-input px-1 py-1.5 text-sm focus:outline-none focus:border-primary"
                />
                {assuntos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAssuntos((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Remover assunto"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAssuntos((prev) => [...prev, { texto: '', ok: false }])}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar assunto
          </Button>
        </div>
        <Button onClick={criar} disabled={criando}>
          {criando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Criar e abrir para assinatura
        </Button>
      </div>

      <div className="space-y-2">
        {reunioes.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhuma reunião ainda.</p>}
        {reunioes.map((r) => {
          const aberta = r.status === 'aberta';
          const lista = presencas[r.id] ?? [];
          return (
            <div key={r.id} className="rounded-xl border overflow-hidden">
              <div className="flex items-center gap-2 p-3">
                <button onClick={() => abrir(r)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.titulo}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${aberta ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {aberta ? 'ABERTA' : 'FECHADA'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </button>
                <Button size="sm" variant="outline" onClick={() => toggleStatus(r)}>
                  {aberta ? <><Lock className="h-3.5 w-3.5 mr-1" /> Fechar</> : <><Unlock className="h-3.5 w-3.5 mr-1" /> Reabrir</>}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => abrir(r)}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandId === r.id ? 'rotate-180' : ''}`} />
                </Button>
              </div>

              {expandId === r.id && (
                <div className="border-t p-3 space-y-3 bg-muted/20">
                  {r.pauta && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Pauta</p>
                      <p className="text-sm whitespace-pre-wrap">{r.pauta}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-semibold flex items-center gap-1.5"><Users className="h-4 w-4" /> Assinaturas ({lista.length})</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => gerarPDF(r)} disabled={lista.length === 0}><Printer className="h-3.5 w-3.5 mr-1" /> Imprimir ata</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => excluir(r)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir</Button>
                    </div>
                  </div>
                  {loadingPres && !presencas[r.id] ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
                  ) : lista.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ninguém assinou ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {lista.map((p) => (
                        <div key={p.id} className="rounded-md border bg-card p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{p.operador_nome}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(p.assinou_em).toLocaleString('pt-BR')}</span>
                          </div>
                          {p.assinatura && <img src={p.assinatura} alt="assinatura" className="mt-1 h-16 w-full object-contain bg-white rounded border" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
