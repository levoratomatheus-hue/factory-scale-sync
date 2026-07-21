import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatKg } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Download, Search, FlaskConical, BarChart3, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MpDepara {
  cod_excel: string;
  descricao: string;
  tipo: string | null;
}

interface ConsumoMpRow {
  id: string;
  cod_mp_excel: string;
  materia_prima: string;
  quantidade_kg: number;
  data_retirada: string;
  observacao: string | null;
  retirado_por: string;
  criado_em: string;
}

interface TotalPorMp {
  cod_mp_excel: string;
  materia_prima: string;
  total_kg: number;
  num_retiradas: number;
}

interface Props {
  perfilNome: string;
}

function fmt(d: string) {
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function toInputDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function startOfWeek(d: Date) {
  const day = d.getDay(); // 0=Dom
  const diff = day === 0 ? -6 : 1 - day; // segunda-feira
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  return r;
}
function endOfWeek(d: Date) {
  const sw = startOfWeek(d);
  const r = new Date(sw);
  r.setDate(sw.getDate() + 6);
  return r;
}

export default function ConsumoMP({ perfilNome }: Props) {
  // ─── Seção 1 – Lançar retirada ───────────────────────────────────────────
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<MpDepara[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const [mpSelecionada, setMpSelecionada] = useState<MpDepara | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(toInputDate(new Date()));
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [retiradas, setRetiradas] = useState<ConsumoMpRow[]>([]);
  const [carregandoRetiradas, setCarregandoRetiradas] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Seção 2 – Relatório ─────────────────────────────────────────────────
  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(toInputDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [dataFim, setDataFim] = useState(toInputDate(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)));
  const [relatorio, setRelatorio] = useState<ConsumoMpRow[]>([]);
  const [carregandoRel, setCarregandoRel] = useState(false);

  // ── Autocomplete ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busca.length < 2) { setSugestoes([]); setShowSugestoes(false); return; }
    debounceRef.current = setTimeout(async () => {
      const { data: rows } = await supabase
        .from('mp_depara')
        .select('cod_excel, descricao, tipo')
        .or(`descricao.ilike.%${busca}%,cod_excel.ilike.%${busca}%`)
        .order('descricao')
        .limit(20);
      setSugestoes(rows ?? []);
      setShowSugestoes(true);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  // ── Últimas retiradas ─────────────────────────────────────────────────────
  const fetchRetiradas = useCallback(async () => {
    setCarregandoRetiradas(true);
    const { data: rows } = await supabase
      .from('consumo_mp')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(20);
    setRetiradas(rows ?? []);
    setCarregandoRetiradas(false);
  }, []);

  useEffect(() => { fetchRetiradas(); }, [fetchRetiradas]);

  // ── Registrar retirada ────────────────────────────────────────────────────
  const handleRegistrar = async () => {
    if (!mpSelecionada) { toast({ title: 'Selecione uma matéria-prima', variant: 'destructive' }); return; }
    const qtd = parseFloat(quantidade.replace(',', '.'));
    if (!quantidade || isNaN(qtd) || qtd <= 0) { toast({ title: 'Informe uma quantidade válida (> 0)', variant: 'destructive' }); return; }
    if (!data) { toast({ title: 'Informe a data', variant: 'destructive' }); return; }

    setSalvando(true);
    const { error } = await supabase.from('consumo_mp').insert({
      cod_mp_excel: mpSelecionada.cod_excel,
      materia_prima: mpSelecionada.descricao,
      quantidade_kg: qtd,
      data_retirada: data,
      observacao: observacao.trim() || null,
      retirado_por: perfilNome,
    });
    setSalvando(false);

    if (error) {
      toast({ title: 'Erro ao registrar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Retirada registrada com sucesso!' });
    setBusca('');
    setMpSelecionada(null);
    setQuantidade('');
    setData(toInputDate(new Date()));
    setObservacao('');
    setSugestoes([]);
    setShowSugestoes(false);
    fetchRetiradas();
    setTimeout(() => buscaRef.current?.focus(), 100);
  };

  // ── Excluir retirada ──────────────────────────────────────────────────────
  const handleExcluir = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('consumo_mp').delete().eq('id', id);
    if (error) { toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Lançamento excluído' });
    fetchRetiradas();
  };

  // ── Relatório ─────────────────────────────────────────────────────────────
  const fetchRelatorio = useCallback(async () => {
    setCarregandoRel(true);
    const { data: rows } = await supabase
      .from('consumo_mp')
      .select('*')
      .gte('data_retirada', dataInicio)
      .lte('data_retirada', dataFim)
      .order('data_retirada', { ascending: false });
    setRelatorio(rows ?? []);
    setCarregandoRel(false);
  }, [dataInicio, dataFim]);

  useEffect(() => { fetchRelatorio(); }, [fetchRelatorio]);

  // ── Totais por MP ─────────────────────────────────────────────────────────
  const totaisPorMp: TotalPorMp[] = (() => {
    const map = new Map<string, TotalPorMp>();
    for (const r of relatorio) {
      const key = r.cod_mp_excel;
      if (!map.has(key)) {
        map.set(key, { cod_mp_excel: r.cod_mp_excel, materia_prima: r.materia_prima, total_kg: 0, num_retiradas: 0 });
      }
      const entry = map.get(key)!;
      entry.total_kg += r.quantidade_kg;
      entry.num_retiradas += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total_kg - a.total_kg);
  })();

  const totalGeralKg = totaisPorMp.reduce((s, t) => s + t.total_kg, 0);
  const numMpDistintas = totaisPorMp.length;

  // ── Atalhos de período ────────────────────────────────────────────────────
  const aplicarAtalho = (atalho: 'hoje' | 'semana' | 'mes' | 'ano') => {
    const h = new Date();
    if (atalho === 'hoje') { setDataInicio(toInputDate(h)); setDataFim(toInputDate(h)); }
    else if (atalho === 'semana') { setDataInicio(toInputDate(startOfWeek(h))); setDataFim(toInputDate(endOfWeek(h))); }
    else if (atalho === 'mes') { setDataInicio(toInputDate(new Date(h.getFullYear(), h.getMonth(), 1))); setDataFim(toInputDate(new Date(h.getFullYear(), h.getMonth() + 1, 0))); }
    else if (atalho === 'ano') { setDataInicio(toInputDate(new Date(h.getFullYear(), 0, 1))); setDataFim(toInputDate(new Date(h.getFullYear(), 11, 31))); }
  };

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const exportarCSV = () => {
    const rows = [
      ['Data', 'Cód. MP', 'Matéria-Prima', 'Quantidade (kg)', 'Retirado por', 'Observação'],
      ...relatorio.map(r => [
        fmt(r.data_retirada),
        r.cod_mp_excel,
        r.materia_prima,
        String(r.quantidade_kg).replace('.', ','),
        r.retirado_por,
        r.observacao ?? '',
      ]),
    ];
    const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumo_mp_${dataInicio}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Tabs defaultValue="lancar">
        <TabsList className="mb-4">
          <TabsTrigger value="lancar" className="gap-1.5">
            <FlaskConical className="h-4 w-4" />
            Lançar Retirada
          </TabsTrigger>
          <TabsTrigger value="relatorio" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Relatório por Período
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════
            ABA 1 – LANÇAR RETIRADA
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="lancar" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Nova Retirada de MP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Busca de MP */}
              <div className="space-y-1.5 relative">
                <Label>Matéria-Prima *</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={buscaRef}
                    placeholder="Buscar por código ou descrição…"
                    value={mpSelecionada ? `${mpSelecionada.cod_excel} – ${mpSelecionada.descricao}` : busca}
                    onChange={e => {
                      if (mpSelecionada) { setMpSelecionada(null); }
                      setBusca(e.target.value);
                    }}
                    onFocus={() => { if (busca.length >= 2 && !mpSelecionada) setShowSugestoes(true); }}
                    onBlur={() => setTimeout(() => setShowSugestoes(false), 150)}
                    className="pl-8 pr-8"
                  />
                  {(busca || mpSelecionada) && (
                    <button
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => { setBusca(''); setMpSelecionada(null); setSugestoes([]); setShowSugestoes(false); buscaRef.current?.focus(); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {showSugestoes && sugestoes.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                    {sugestoes.map(mp => (
                      <button
                        key={mp.cod_excel}
                        className="flex items-start gap-2 w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setMpSelecionada(mp); setBusca(''); setShowSugestoes(false); }}
                      >
                        <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0">{mp.cod_excel}</span>
                        <span className="leading-tight">{mp.descricao}</span>
                        {mp.tipo && <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">{mp.tipo}</Badge>}
                      </button>
                    ))}
                  </div>
                )}
                {showSugestoes && busca.length >= 2 && sugestoes.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">
                    Nenhuma MP encontrada para "{busca}"
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Quantidade */}
                <div className="space-y-1.5">
                  <Label>Quantidade (kg) *</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,000"
                    value={quantidade}
                    onChange={e => setQuantidade(e.target.value)}
                  />
                </div>

                {/* Data */}
                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input
                    type="date"
                    value={data}
                    onChange={e => setData(e.target.value)}
                  />
                </div>
              </div>

              {/* Observação */}
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea
                  placeholder="Finalidade, experimento, etc."
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={2}
                />
              </div>

              <Button onClick={handleRegistrar} disabled={salvando} className="w-full sm:w-auto">
                {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Registrar Retirada
              </Button>
            </CardContent>
          </Card>

          {/* Últimas retiradas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Últimas 20 Retiradas</CardTitle>
            </CardHeader>
            <CardContent>
              {carregandoRetiradas ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : retiradas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma retirada registrada ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left pb-2 pr-3 font-medium">Data</th>
                        <th className="text-left pb-2 pr-3 font-medium">Cód.</th>
                        <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                        <th className="text-right pb-2 pr-3 font-medium">Qtd (kg)</th>
                        <th className="text-left pb-2 pr-3 font-medium">Retirado por</th>
                        <th className="text-left pb-2 pr-3 font-medium">Obs.</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {retiradas.map(r => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.data_retirada)}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.cod_mp_excel}</td>
                          <td className="py-2 pr-3">{r.materia_prima}</td>
                          <td className="py-2 pr-3 text-right font-mono">{formatKg(r.quantidade_kg)}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">{r.retirado_por}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[160px] truncate">{r.observacao ?? '—'}</td>
                          <td className="py-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive/60 hover:text-destructive"
                              onClick={() => handleExcluir(r.id)}
                              title="Excluir lançamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════
            ABA 2 – RELATÓRIO POR PERÍODO
        ════════════════════════════════════════════════════════════ */}
        <TabsContent value="relatorio" className="space-y-4">
          {/* Filtros */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label>De</Label>
                  <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-36" />
                </div>
                <div className="space-y-1.5">
                  <Label>Até</Label>
                  <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(['hoje', 'semana', 'mes', 'ano'] as const).map(a => (
                    <Button key={a} variant="outline" size="sm" onClick={() => aplicarAtalho(a)}>
                      {a === 'hoje' ? 'Hoje' : a === 'semana' ? 'Esta semana' : a === 'mes' ? 'Este mês' : 'Este ano'}
                    </Button>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={exportarCSV} className="gap-1.5 ml-auto">
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {carregandoRel ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="col-span-2">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total no período</p>
                    <p className="text-2xl font-bold">{formatKg(totalGeralKg)} <span className="text-sm font-normal text-muted-foreground">kg</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">MPs distintas</p>
                    <p className="text-2xl font-bold">{numMpDistintas}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nº de retiradas</p>
                    <p className="text-2xl font-bold">{relatorio.length}</p>
                  </CardContent>
                </Card>
              </div>

              {relatorio.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Nenhuma retirada no período selecionado.</CardContent></Card>
              ) : (
                <>
                  {/* Totais por MP */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Totais por Matéria-Prima</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground text-xs">
                              <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                              <th className="text-left pb-2 pr-3 font-medium">Código</th>
                              <th className="text-right pb-2 pr-3 font-medium">Total (kg)</th>
                              <th className="text-right pb-2 font-medium">Nº retiradas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {totaisPorMp.map((t, i) => (
                              <tr key={t.cod_mp_excel} className={cn('border-b last:border-0 hover:bg-muted/40 transition-colors', i === 0 && 'font-medium')}>
                                <td className="py-2 pr-3">{t.materia_prima}</td>
                                <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.cod_mp_excel}</td>
                                <td className="py-2 pr-3 text-right font-mono">{formatKg(t.total_kg)}</td>
                                <td className="py-2 text-right text-muted-foreground">{t.num_retiradas}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Histórico detalhado */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Histórico Detalhado</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground text-xs">
                              <th className="text-left pb-2 pr-3 font-medium">Data</th>
                              <th className="text-left pb-2 pr-3 font-medium">Matéria-Prima</th>
                              <th className="text-right pb-2 pr-3 font-medium">Qtd (kg)</th>
                              <th className="text-left pb-2 pr-3 font-medium">Retirado por</th>
                              <th className="text-left pb-2 font-medium">Observação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {relatorio.map(r => (
                              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                                <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.data_retirada)}</td>
                                <td className="py-2 pr-3">
                                  <div className="leading-tight">
                                    <span>{r.materia_prima}</span>
                                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{r.cod_mp_excel}</span>
                                  </div>
                                </td>
                                <td className="py-2 pr-3 text-right font-mono">{formatKg(r.quantidade_kg)}</td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground">{r.retirado_por}</td>
                                <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">{r.observacao ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
