import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, FileText, Trash2, Save, ArrowLeft, Search, X, ClipboardList } from 'lucide-react';

type Teste = { ensaio: string; equipamento: string; especificacao: string; obtido: string; resultado: string };
type Acao = { tipo: string; acao: string; responsavel: string; prazo: string; status: string };
type Rnc = {
  id?: string; numero?: string;
  data: string; cliente: string; produto: string; lote: string; ordem_id: string | null; processo_cliente: string; origem: string;
  problema: string; requisito: string; qtd_afetada: string; qtd_total: string; unidade: string; criticidade: string;
  simulavel: string; simulacao_resultado: string;
  testes: Teste[]; causa_raiz: string; parecer: string; parecer_justificativa: string;
  acoes: Acao[]; elaborado_por: string; aprovado_por: string;
};
type RncLista = { id: string; numero: string; data: string; cliente: string; produto: string | null; lote: string | null; parecer: string | null; origem: string | null };

const RESULTADOS = ['Pendente', 'Aprovado', 'Reprovado'];
const STATUS_ACAO = ['Não iniciada', 'Em andamento', 'Concluída'];
const TIPOS_ACAO = ['Contenção', 'Corretiva', 'Preventiva'];

const PROCESSOS = [
  'Extrusão de filme soprado',
  'Extrusão de filme plano (cast)',
  'Injeção',
  'Sopro',
  'Extrusão de chapa',
  'Termoformagem',
  'Ráfia',
  'Fibra / monofilamento',
  'Tubos e perfis',
  'Rotomoldagem',
];

const hoje = () => new Date().toLocaleDateString('sv-SE');
const fmtData = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n; };
const testeVazio = (): Teste => ({ ensaio: '', equipamento: '', especificacao: '', obtido: '', resultado: 'Pendente' });

function novaRnc(perfilNome: string): Rnc {
  return {
    data: hoje(), cliente: '', produto: '', lote: '', ordem_id: null, processo_cliente: '', origem: '',
    problema: '', requisito: '', qtd_afetada: '', qtd_total: '', unidade: 'un', criticidade: '',
    simulavel: '', simulacao_resultado: '',
    testes: [testeVazio(), testeVazio(), testeVazio()],
    causa_raiz: '', parecer: '', parecer_justificativa: '',
    acoes: TIPOS_ACAO.map((t) => ({ tipo: t, acao: '', responsavel: '', prazo: '', status: 'Não iniciada' })),
    elaborado_por: perfilNome, aprovado_por: '',
  };
}

function doBanco(r: any): Rnc {
  return {
    id: r.id, numero: r.numero,
    data: r.data ?? hoje(), cliente: r.cliente ?? '', produto: r.produto ?? '', lote: r.lote ?? '', ordem_id: r.ordem_id ?? null, processo_cliente: r.processo_cliente ?? '',
    origem: r.origem ?? '',
    problema: r.problema ?? '', requisito: r.requisito ?? '',
    qtd_afetada: r.qtd_afetada != null ? String(r.qtd_afetada).replace('.', ',') : '',
    qtd_total: r.qtd_total != null ? String(r.qtd_total).replace('.', ',') : '',
    unidade: r.unidade ?? 'un', criticidade: r.criticidade ?? '',
    simulavel: r.simulavel ?? '', simulacao_resultado: r.simulacao_resultado ?? '',
    testes: Array.isArray(r.testes) && r.testes.length ? r.testes : [testeVazio()],
    causa_raiz: r.causa_raiz ?? '', parecer: r.parecer ?? '', parecer_justificativa: r.parecer_justificativa ?? '',
    acoes: Array.isArray(r.acoes) ? r.acoes : [],
    elaborado_por: r.elaborado_por ?? '', aprovado_por: r.aprovado_por ?? '',
  };
}

// Fica fora do componente para os campos não perderem o foco ao digitar
function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <p className="font-semibold">{titulo}</p>
      {children}
    </div>
  );
}

async function gerarPdfRnc(f: Rnc) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 14, W = 210 - 2 * M;
  const AZUL: [number, number, number] = [37, 90, 146];
  let y = 18;
  let secao = 0;

  const tem = (v?: string | null) => !!v && v.trim() !== '';
  const garantir = (h: number) => { if (y + h > 280) { doc.addPage(); y = 18; } };

  // Título de seção com numeração automática (só conta as seções que aparecem)
  const titulo = (t: string) => {
    secao++;
    if (secao > 1) y += 4; // mesmo respiro antes de toda seção
    garantir(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...AZUL);
    doc.text(`${secao}. ${t.toUpperCase()}`, M, y);
    doc.setDrawColor(210, 214, 222); doc.setLineWidth(0.3);
    doc.line(M, y + 1.8, 210 - M, y + 1.8);
    doc.setTextColor(0, 0, 0);
    y += 7;
  };

  // Campo: não imprime nada se estiver vazio
  const campo = (label: string, valor: string) => {
    if (!tem(valor)) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const linhas = doc.splitTextToSize(valor, W);
    garantir(5 + linhas.length * 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(90, 100, 115);
    doc.text(label, M, y); y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
    doc.text(linhas, M, y); y += linhas.length * 4.8 + 3;
  };

  // Tabela: tira as colunas que estão vazias em todas as linhas (as de "manter" ficam sempre)
  const tabela = (head: string[], body: string[][], manter: number[] = []) => {
    if (!body.length) return;
    const cols = head.map((_, c) => c).filter((c) => manter.includes(c) || body.some((r) => tem(r[c])));
    if (!cols.length) return;
    autoTable(doc, {
      startY: y,
      head: [cols.map((c) => head[c])],
      body: body.map((r) => cols.map((c) => r[c] ?? '')),
      theme: 'grid',
      margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 2, valign: 'top' },
      headStyles: { fillColor: [232, 238, 246], textColor: [27, 36, 48], fontStyle: 'bold' },
      tableLineColor: [210, 214, 222],
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  };

  // Cabeçalho
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(27, 36, 48);
  doc.text('Relatório Técnico de Reclamação', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 100, 115);
  doc.text(`RNC ${f.numero ?? ''}  ·  ${fmtData(f.data)}`, 210 - M, y, { align: 'right' });
  y += 3.5;
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.5); doc.line(M, y, 210 - M, y);
  doc.setTextColor(0, 0, 0);
  y += 9;

  // Identificação (sempre tem número, data e cliente)
  titulo('Identificação');
  tabela(
    ['Nº RNC', 'Data', 'Cliente', 'Produto / código', 'Lote', 'Processo do cliente'],
    [[f.numero ?? '', fmtData(f.data), f.cliente, f.produto, f.lote, f.processo_cliente]],
  );

  // Reclamação
  const qtd = tem(f.qtd_afetada)
    ? `${f.qtd_afetada}${tem(f.qtd_total) ? ` de ${f.qtd_total}` : ''} ${f.unidade || ''}`.trim()
    : '';
  if ([f.problema, f.requisito, qtd, f.criticidade].some(tem)) {
    titulo('Reclamação');
    campo('Problema relatado', f.problema);
    campo('Requisito violado (desenho/norma)', f.requisito);
    campo('Quantidade afetada', qtd);
    campo('Criticidade', f.criticidade);
  }

  // Análises e testes + simulação
  const testes = f.testes.filter((t) => [t.ensaio, t.equipamento, t.especificacao, t.obtido].some(tem));
  const simul = f.simulavel === 'sim' ? 'Sim' : f.simulavel === 'nao' ? 'Não' : '';
  if (testes.length || tem(simul) || tem(f.simulacao_resultado)) {
    titulo('Análises e testes');
    if (testes.length) {
      tabela(
        ['Nº', 'Ensaio / norma', 'Equipamento', 'Especificação', 'Obtido', 'Resultado'],
        testes.map((t, i) => [`T-${String(i + 1).padStart(2, '0')}`, t.ensaio, t.equipamento, t.especificacao, t.obtido, t.resultado]),
        [0],
      );
    }
    campo('O laboratório consegue simular em pequena escala o processo do cliente?', simul);
    campo('Resultado da simulação', f.simulacao_resultado);
  }

  // Causa raiz
  if (tem(f.causa_raiz)) {
    titulo('Causa raiz');
    campo('Causa confirmada', f.causa_raiz);
  }

  // Conclusão e ações
  const acoes = f.acoes.filter((a) => tem(a.acao));
  if (tem(f.parecer) || tem(f.parecer_justificativa) || acoes.length) {
    titulo('Conclusão e ações');
    campo('Parecer', f.parecer);
    campo('Conclusão final', f.parecer_justificativa);
    if (acoes.length) {
      tabela(
        ['Tipo', 'Ação', 'Responsável', 'Prazo', 'Status'],
        acoes.map((a) => [a.tipo, a.acao, a.responsavel, fmtData(a.prazo), a.status]),
        [0, 1],
      );
    }
  }

  // Assinaturas: só de quem tem nome preenchido
  const assinaturas = [['Elaborado por', f.elaborado_por], ['Aprovado por', f.aprovado_por]].filter(([, n]) => tem(n));
  if (assinaturas.length) {
    garantir(30); y += 14;
    doc.setDrawColor(120); doc.setLineWidth(0.3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    assinaturas.forEach(([label, nome], i) => {
      const x = i === 0 ? M : 210 - M - 75;
      doc.line(x, y, x + 75, y);
      doc.text(`${label}: ${nome}`, x, y + 5);
    });
  }

  // Rodapé com número de página
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`RNC ${f.numero ?? ''} · página ${i} de ${n}`, 210 - M, 290, { align: 'right' });
  }
  doc.save(`RNC_${f.numero ?? 'rascunho'}.pdf`);
}

export default function GestaoRNC({ perfilNome }: { perfilNome: string }) {
  const [lista, setLista] = useState<RncLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Rnc | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const [loteBusca, setLoteBusca] = useState('');
  const [loteSug, setLoteSug] = useState<{ id: string; lote: string; produto: string }[]>([]);
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregarLista = async () => {
    const { data } = await (supabase as any).from('rnc')
      .select('id, numero, data, cliente, produto, lote, parecer, origem')
      .order('criado_em', { ascending: false }).limit(200);
    setLista((data ?? []) as RncLista[]);
    setLoading(false);
  };
  useEffect(() => { carregarLista(); }, []);

  useEffect(() => {
    if (deb.current) clearTimeout(deb.current);
    const q = loteBusca.trim();
    if (q.length < 2) { setLoteSug([]); return; }
    deb.current = setTimeout(async () => {
      const { data } = await (supabase as any).from('ordens')
        .select('id, lote, produto').neq('eh_acerto', true)
        .ilike('lote', `%${q}%`).order('criado_em', { ascending: false }).limit(10);
      setLoteSug(data ?? []);
    }, 250);
    return () => { if (deb.current) clearTimeout(deb.current); };
  }, [loteBusca]);

  const set = <K extends keyof Rnc>(k: K, v: Rnc[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setTeste = (i: number, k: keyof Teste, v: string) =>
    setForm((f) => (f ? { ...f, testes: f.testes.map((t, j) => (j === i ? { ...t, [k]: v } : t)) } : f));
  const setAcao = (i: number, k: keyof Acao, v: string) =>
    setForm((f) => (f ? { ...f, acoes: f.acoes.map((a, j) => (j === i ? { ...a, [k]: v } : a)) } : f));

  const usarLote = (lote: string, produto: string, ordemId: string | null) => {
    setForm((f) => (f ? { ...f, lote, produto: produto || f.produto, ordem_id: ordemId } : f));
    setLoteBusca(''); setLoteSug([]);
  };

  const abrir = async (id: string) => {
    const { data, error } = await (supabase as any).from('rnc').select('*').eq('id', id).single();
    if (error || !data) { toast({ title: 'Erro ao abrir RNC', description: error?.message, variant: 'destructive' }); return; }
    setForm(doBanco(data)); setLoteBusca('');
  };

  const salvar = async (): Promise<Rnc | null> => {
    if (!form) return null;
    if (!form.cliente.trim()) { toast({ title: 'Informe o cliente', variant: 'destructive' }); return null; }
    setSalvando(true);
    const payload: any = {
      data: form.data, cliente: form.cliente.trim(), produto: form.produto || null, lote: form.lote || null, ordem_id: form.ordem_id,
      processo_cliente: form.processo_cliente || null,
      origem: form.origem || null,
      problema: form.problema || null, requisito: form.requisito || null,
      qtd_afetada: num(form.qtd_afetada), qtd_total: num(form.qtd_total), unidade: form.unidade || 'un',
      criticidade: form.criticidade || null, simulavel: form.simulavel || null, simulacao_resultado: form.simulacao_resultado || null,
      testes: form.testes, causa_raiz: form.causa_raiz || null, parecer: form.parecer || null,
      parecer_justificativa: form.parecer_justificativa || null, acoes: form.acoes,
      elaborado_por: form.elaborado_por || null, aprovado_por: form.aprovado_por || null,
    };
    let salvo: any = null; let erro: any = null;
    if (form.id) {
      const r = await (supabase as any).from('rnc').update(payload).eq('id', form.id).select('*').single();
      salvo = r.data; erro = r.error;
    } else {
      const ano = parseInt(form.data.slice(0, 4)) || new Date().getFullYear();
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const { data: ult } = await (supabase as any).from('rnc').select('seq').eq('ano', ano).order('seq', { ascending: false }).limit(1);
        const seq = Math.max((ult?.[0]?.seq ?? 0) + 1, 40001);
        const r = await (supabase as any).from('rnc').insert({ ...payload, ano, seq, numero: `${ano}.${seq}` }).select('*').single();
        salvo = r.data; erro = r.error;
        if (salvo || erro?.code !== '23505') break; // só tenta de novo se o número já tiver sido usado
      }
    }
    setSalvando(false);
    if (erro || !salvo) { toast({ title: 'Erro ao salvar RNC', description: erro?.message, variant: 'destructive' }); return null; }
    const atualizado = doBanco(salvo);
    setForm(atualizado);
    toast({ title: `RNC ${atualizado.numero} salva` });
    carregarLista();
    return atualizado;
  };

  const gerarPdf = async () => {
    const salvo = await salvar(); // salva antes, para ter o número
    if (!salvo) return;
    setGerando(true);
    try { await gerarPdfRnc(salvo); }
    catch (e: any) { toast({ title: 'Erro ao gerar PDF', description: e?.message, variant: 'destructive' }); }
    setGerando(false);
  };

  const excluir = async () => {
    if (!form?.id) { setForm(null); return; }
    if (!window.confirm(`Excluir a RNC ${form.numero}?`)) return;
    const { error } = await (supabase as any).from('rnc').delete().eq('id', form.id);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'RNC excluída' });
    setForm(null);
    carregarLista();
  };

  // ── Lista ──
  if (!form) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" /> Reclamações (RNC)</h1>
          <Button onClick={() => { setForm(novaRnc(perfilNome)); setLoteBusca(''); }}><Plus className="h-4 w-4 mr-1" /> Nova RNC</Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">Nenhuma RNC registrada.</p>
        ) : (
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Nº</th>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">Produto</th>
                  <th className="text-left px-3 py-2">Lote</th>
                  <th className="text-left px-3 py-2">Parecer</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} className="border-t cursor-pointer hover:bg-muted/40" onClick={() => abrir(r.id)}>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">
                      {r.numero}
                      {r.origem && (
                        <span className={`ml-2 font-sans text-[10px] font-bold px-1.5 py-0.5 rounded ${r.origem === 'Revenda' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                          {r.origem === 'Revenda' ? 'REVENDA' : 'FABRICADO'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{fmtData(r.data)}</td>
                    <td className="px-3 py-2">{r.cliente}</td>
                    <td className="px-3 py-2">{r.produto ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.lote ?? '—'}</td>
                    <td className="px-3 py-2">{r.parecer ?? <span className="text-muted-foreground">Em análise</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ── Formulário ──
  return (
    <div className="max-w-5xl mx-auto space-y-4 pb-16">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setForm(null)}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        <h1 className="text-xl font-bold">{form.numero ? `RNC ${form.numero}` : 'Nova RNC'}</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={salvar} disabled={salvando || gerando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Salvar
          </Button>
          <Button onClick={gerarPdf} disabled={salvando || gerando}>
            {gerando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />} Gerar PDF
          </Button>
        </div>
      </div>

      <div className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-purple-700 dark:text-purple-300">Uso interno · não aparece no PDF</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Origem do item:</span>
          {['Fabricado', 'Revenda'].map((o) => (
            <Button key={o} type="button" size="sm" variant={form.origem === o ? 'default' : 'outline'}
              onClick={() => set('origem', form.origem === o ? '' : o)}>{o}</Button>
          ))}
        </div>
      </div>

      <Secao titulo="1. Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5"><Label>Nº RNC</Label><Input value={form.numero ?? 'gerado ao salvar'} disabled /></div>
          <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={form.data} onChange={(e) => set('data', e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Cliente *</Label><Input value={form.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Nome do cliente" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 relative">
            <Label>Lote</Label>
            {form.lote ? (
              <div className="flex items-center gap-2 h-10 rounded-md border px-3 text-sm">
                <span className="font-mono">{form.lote}</span>
                {!form.ordem_id && <span className="text-xs text-muted-foreground">(sem OP)</span>}
                <button type="button" className="ml-auto text-muted-foreground hover:text-foreground"
                  onClick={() => setForm((f) => (f ? { ...f, lote: '', ordem_id: null } : f))}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input className="pl-8" value={loteBusca} onChange={(e) => setLoteBusca(e.target.value)} placeholder="Buscar lote da OP…" />
                </div>
                {loteBusca.trim().length >= 2 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                    {loteSug.map((o) => (
                      <button key={o.id} type="button" className="flex gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => usarLote(o.lote, o.produto, o.id)}>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{o.lote}</span>
                        <span className="truncate">{o.produto}</span>
                      </button>
                    ))}
                    <button type="button" className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent border-t"
                      onClick={() => usarLote(loteBusca.trim(), '', null)}>
                      Usar "{loteBusca.trim()}" sem vincular a uma OP
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Produto / código</Label>
            <Input value={form.produto} onChange={(e) => set('produto', e.target.value)} placeholder="Preenchido pelo lote, ou digite" />
          </div>
        </div>
        <div className="space-y-1.5 sm:w-1/2">
          <Label>Tipo de processo do cliente</Label>
          <Input
            list="processos-cliente"
            value={form.processo_cliente}
            onChange={(e) => set('processo_cliente', e.target.value)}
            placeholder="Escolha da lista ou digite"
          />
          <datalist id="processos-cliente">
            {PROCESSOS.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
      </Secao>

      <Secao titulo="2. Reclamação">
        <div className="space-y-1.5"><Label>Problema relatado</Label><Textarea rows={3} value={form.problema} onChange={(e) => set('problema', e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Requisito violado (desenho/norma)</Label><Input value={form.requisito} onChange={(e) => set('requisito', e.target.value)} /></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5"><Label>Qtd. afetada</Label><Input inputMode="decimal" value={form.qtd_afetada} onChange={(e) => set('qtd_afetada', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>De (total)</Label><Input inputMode="decimal" value={form.qtd_total} onChange={(e) => set('qtd_total', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Unidade</Label><Input value={form.unidade} onChange={(e) => set('unidade', e.target.value)} placeholder="un, kg…" /></div>
          <div className="space-y-1.5">
            <Label>Criticidade</Label>
            <Select value={form.criticidade || undefined} onValueChange={(v) => set('criticidade', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {['Crítica', 'Maior', 'Menor'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Secao>

      <Secao titulo="3. Análises e testes">
        <div className="space-y-2">
          {form.testes.map((t, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[56px_1.4fr_1fr_1fr_1fr_140px_32px] gap-2 items-center">
              <span className="text-sm font-mono text-muted-foreground">T-{String(i + 1).padStart(2, '0')}</span>
              <Input placeholder="Ensaio / norma" value={t.ensaio} onChange={(e) => setTeste(i, 'ensaio', e.target.value)} />
              <Input placeholder="Equipamento" value={t.equipamento} onChange={(e) => setTeste(i, 'equipamento', e.target.value)} />
              <Input placeholder="Especificação" value={t.especificacao} onChange={(e) => setTeste(i, 'especificacao', e.target.value)} />
              <Input placeholder="Obtido" value={t.obtido} onChange={(e) => setTeste(i, 'obtido', e.target.value)} />
              <Select value={t.resultado} onValueChange={(v) => setTeste(i, 'resultado', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RESULTADOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              <button type="button" title="Remover teste" className="text-muted-foreground hover:text-destructive"
                onClick={() => setForm((f) => (f ? { ...f, testes: f.testes.filter((_, j) => j !== i) } : f))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => (f ? { ...f, testes: [...f.testes, testeVazio()] } : f))}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar teste
        </Button>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <p className="text-sm font-semibold">Simulação interna</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">O laboratório consegue simular em pequena escala o processo do cliente?</span>
            {[['sim', 'Sim'], ['nao', 'Não']].map(([v, l]) => (
              <Button key={v} type="button" size="sm" variant={form.simulavel === v ? 'default' : 'outline'}
                onClick={() => set('simulavel', form.simulavel === v ? '' : v)}>{l}</Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Resultado da simulação</Label>
            <Textarea rows={3} value={form.simulacao_resultado} onChange={(e) => set('simulacao_resultado', e.target.value)}
              placeholder={form.simulavel === 'nao' ? 'Por que não foi possível simular' : 'O que foi feito e o que aconteceu'} />
          </div>
        </div>
      </Secao>

      <Secao titulo="4. Causa raiz">
        <Textarea rows={3} value={form.causa_raiz} onChange={(e) => set('causa_raiz', e.target.value)} placeholder="Causa confirmada e qual ensaio a comprova" />
      </Secao>

      <Secao titulo="5. Conclusão e ações">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Parecer:</span>
          {['Procedente', 'Improcedente'].map((p) => (
            <Button key={p} type="button" size="sm" variant={form.parecer === p ? 'default' : 'outline'}
              onClick={() => set('parecer', form.parecer === p ? '' : p)}>{p}</Button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>Conclusão final</Label>
          <Textarea
            rows={6}
            value={form.parecer_justificativa}
            onChange={(e) => set('parecer_justificativa', e.target.value)}
            placeholder={
              form.parecer === 'Improcedente'
                ? 'Explique por que a reclamação não procede: o que foi testado, o que os resultados mostram e qual a provável causa do lado do cliente.'
                : form.parecer === 'Procedente'
                ? 'Explique o que falhou, como foi confirmado e o que será feito para não acontecer de novo.'
                : 'Conclusão detalhada da análise.'
            }
          />
        </div>

        <div className="space-y-2">
          {form.acoes.map((a, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[130px_1.6fr_1fr_150px_150px_32px] gap-2 items-center">
              <Select value={a.tipo} onValueChange={(v) => setAcao(i, 'tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_ACAO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Ação" value={a.acao} onChange={(e) => setAcao(i, 'acao', e.target.value)} />
              <Input placeholder="Responsável" value={a.responsavel} onChange={(e) => setAcao(i, 'responsavel', e.target.value)} />
              <Input type="date" value={a.prazo} onChange={(e) => setAcao(i, 'prazo', e.target.value)} />
              <Select value={a.status} onValueChange={(v) => setAcao(i, 'status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_ACAO.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <button type="button" title="Remover ação" className="text-muted-foreground hover:text-destructive"
                onClick={() => setForm((f) => (f ? { ...f, acoes: f.acoes.filter((_, j) => j !== i) } : f))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm"
          onClick={() => setForm((f) => (f ? { ...f, acoes: [...f.acoes, { tipo: 'Corretiva', acao: '', responsavel: '', prazo: '', status: 'Não iniciada' }] } : f))}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar ação
        </Button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="space-y-1.5"><Label>Elaborado por</Label><Input value={form.elaborado_por} onChange={(e) => set('elaborado_por', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Aprovado por</Label><Input value={form.aprovado_por} onChange={(e) => set('aprovado_por', e.target.value)} /></div>
        </div>
      </Secao>

      <div className="flex justify-end">
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={excluir}>
          <Trash2 className="h-4 w-4 mr-1" /> {form.id ? 'Excluir RNC' : 'Descartar'}
        </Button>
      </div>
    </div>
  );
}
