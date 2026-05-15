import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, PackageSearch, Loader2, AlertCircle } from 'lucide-react';
import { formatKg } from '@/lib/utils';

// ── Helpers de data ───────────────────────────────────────────────────────────

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia, 12, 0, 0);
}

function feriadosDoAno(ano: number): Set<string> {
  const fixos = [[1,1],[4,21],[5,1],[9,7],[10,12],[11,2],[11,15],[12,25]]
    .map(([m, d]) => fmtYmd(new Date(ano, m - 1, d, 12)));
  const e = pascoa(ano);
  const add = (n: number) => { const x = new Date(e); x.setDate(x.getDate() + n); return fmtYmd(x); };
  return new Set([...fixos, add(-48), add(-47), add(-2), fmtYmd(e), add(60)]);
}

function proximoDiaUtil(dataStr: string | null | undefined): string | null {
  if (!dataStr) return null;
  const d = new Date(dataStr.slice(0, 10) + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  let cacheAno = -1, feriados = new Set<string>();
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    const ano = d.getFullYear();
    if (ano !== cacheAno) { feriados = feriadosDoAno(ano); cacheAno = ano; }
    if (d.getDay() !== 0 && d.getDay() !== 6 && !feriados.has(fmtYmd(d))) break;
  }
  return fmtYmd(d);
}

function subDias(dataStr: string, n: number): string {
  const d = new Date(dataStr + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return fmtYmd(d);
}

function somarDiasUteis(dataStr: string, n: number): string {
  const d = new Date(dataStr + 'T12:00:00');
  let feriados = feriadosDoAno(d.getFullYear());
  let cacheAno = d.getFullYear();
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    const ano = d.getFullYear();
    if (ano !== cacheAno) { feriados = feriadosDoAno(ano); cacheAno = ano; }
    if (d.getDay() !== 0 && d.getDay() !== 6 && !feriados.has(fmtYmd(d))) count++;
  }
  return fmtYmd(d);
}

function diasUteisEntre(dataInicio: string, dataFim: string): number {
  if (dataInicio >= dataFim) return 0;
  const d = new Date(dataInicio + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  const fim = new Date(dataFim + 'T12:00:00');
  let count = 0;
  let cacheAno = -1;
  let feriados = new Set<string>();
  while (d <= fim) {
    const ano = d.getFullYear();
    if (ano !== cacheAno) { feriados = feriadosDoAno(ano); cacheAno = ano; }
    if (d.getDay() !== 0 && d.getDay() !== 6 && !feriados.has(fmtYmd(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function diasUteisSemanAtual(): string[] {
  const today = new Date();
  const dow = today.getDay();
  const distToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + distToMon);
  monday.setHours(12, 0, 0, 0);
  const dias: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const s = fmtYmd(d);
    if (!feriadosDoAno(d.getFullYear()).has(s)) dias.push(s);
  }
  return dias;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

const STATUS_VISIVEIS = [
  'pendente', 'aguardando_linha', 'aguardando_mistura',
  'em_pesagem', 'em_mistura', 'em_linha', 'concluido',
];

interface OrdemComercial {
  id: string;
  produto: string;
  lote: string;
  quantidade: number;
  status: string;
  data_programacao: string;
  data_emissao: string | null;
  data_conclusao: string | null;
  formula_id: string | null;
  programacao_confirmada: boolean | null;
}

function deduplicar(rows: OrdemComercial[]): OrdemComercial[] {
  const byFormula = new Map<string, OrdemComercial>();
  const semFormula: OrdemComercial[] = [];
  for (const op of rows) {
    if (!op.formula_id) { semFormula.push(op); continue; }
    const cur = byFormula.get(op.formula_id);
    if (!cur || op.data_programacao > cur.data_programacao) byFormula.set(op.formula_id, op);
  }
  return [...byFormula.values(), ...semFormula]
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));
}

const SELECT_FIELDS = 'id, produto, lote, quantidade, status, data_programacao, data_emissao, data_conclusao, formula_id, programacao_confirmada';

// ── Componente ────────────────────────────────────────────────────────────────

export default function PainelComercial() {
  const [busca, setBusca] = useState('');
  const [ordens, setOrdens] = useState<OrdemComercial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const term = busca.trim();
  const modoTexto = term.length >= 3;
  const diasSemana = useMemo(() => diasUteisSemanAtual(), []);
  const hj = hoje();

  useEffect(() => {
    let cancelled = false;
    const delay = modoTexto ? 350 : 0;

    const timer = setTimeout(async () => {
      setLoading(true);
      setErro(null);
      try {
        let rows: OrdemComercial[] = [];

        if (modoTexto) {
          const { data, error } = await supabase
            .from('ordens')
            .select(SELECT_FIELDS)
            .in('status', STATUS_VISIVEIS)
            .or(`produto.ilike.%${term}%,lote.ilike.%${term}%`)
            .order('data_programacao', { ascending: false })
            .limit(300);
          if (error) throw new Error(error.message);
          rows = deduplicar((data as OrdemComercial[]) ?? []);
        } else {
          const weekStart = diasSemana[0];
          const weekEnd = diasSemana[diasSemana.length - 1];
          const dataMinProg = subDias(weekStart, 10);
          const dataMinEmissao = subDias(weekStart, 14);
          const diasSet = new Set(diasSemana);

          const [{ data: dataProg, error: errProg }, { data: dataEmissao, error: errEmissao }] = await Promise.all([
            supabase
              .from('ordens')
              .select(SELECT_FIELDS)
              .in('status', STATUS_VISIVEIS)
              .eq('programacao_confirmada', true)
              .gte('data_programacao', dataMinProg)
              .lte('data_programacao', weekEnd)
              .order('produto', { ascending: true })
              .limit(1000),
            supabase
              .from('ordens')
              .select(SELECT_FIELDS)
              .in('status', STATUS_VISIVEIS)
              .neq('programacao_confirmada', true)
              .gte('data_emissao', dataMinEmissao)
              .lte('data_emissao', weekEnd)
              .order('produto', { ascending: true })
              .limit(1000),
          ]);

          if (errProg) throw new Error(errProg.message);
          if (errEmissao) throw new Error(errEmissao.message);

          const confirmadas = ((dataProg as OrdemComercial[]) ?? [])
            .filter(op => {
              if (op.status === 'concluido' && op.data_conclusao)
                return diasSet.has(op.data_conclusao.substring(0, 10));
              return diasSet.has(proximoDiaUtil(op.data_programacao) ?? '');
            });
          const naoConfirmadas = ((dataEmissao as OrdemComercial[]) ?? [])
            .filter(op => op.data_emissao && diasSet.has(somarDiasUteis(op.data_emissao, 7)));

          rows = [...confirmadas, ...naoConfirmadas];
        }

        if (!cancelled) setOrdens(rows);
      } catch (e) {
        if (!cancelled) {
          setErro(e instanceof Error ? e.message : 'Erro ao buscar dados.');
          setOrdens([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delay);

    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  // Agrupa OPs por dia de disponibilidade (apenas no modo semanal)
  const ordPorDia = useMemo(() => {
    const map = new Map<string, OrdemComercial[]>();
    if (!ordens || modoTexto) return map;
    for (const op of ordens) {
      const confirmada = op.programacao_confirmada === true;
      const dia = op.status === 'concluido' && op.data_conclusao
        ? op.data_conclusao.substring(0, 10)
        : confirmada
          ? proximoDiaUtil(op.data_programacao)
          : (op.data_emissao ? somarDiasUteis(op.data_emissao, 7) : null);
      if (!dia) continue;
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(op);
    }
    const dedup = new Map<string, OrdemComercial[]>();
    for (const [dia, ops] of map) dedup.set(dia, deduplicar(ops));
    return dedup;
  }, [ordens, modoTexto]);

  // Resultados de busca deduplicados (apenas no modo texto)
  const resultadosBusca = useMemo(() => {
    if (!ordens || !modoTexto) return [];
    return ordens;
  }, [ordens, modoTexto]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consulta de Produtos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {modoTexto ? 'Resultados da busca em todas as datas' : 'Disponibilidade da semana atual'}
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por produto ou lote (mín. 3 letras)…"
          className="w-full rounded-xl border bg-background pl-9 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          Confirmado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
          Estimado
        </span>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {erro}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : modoTexto ? (
        /* ── Modo busca: lista plana ── */
        resultadosBusca.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <PackageSearch className="h-10 w-10" />
            <p className="text-sm">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {resultadosBusca.map((op) => {
              const confirmada = op.programacao_confirmada === true;
              const concluida = op.status === 'concluido' && !!op.data_conclusao;
              const borderClass = concluida || confirmada
                ? 'border-green-300 bg-green-50/50'
                : 'border-orange-300 bg-orange-50/50';
              const emissaoFmt = op.data_emissao
                ? format(new Date(op.data_emissao + 'T12:00:00'), 'dd/MM/yyyy')
                : '—';
              const conclusaoFmt = op.data_conclusao
                ? format(new Date(op.data_conclusao.substring(0, 10) + 'T12:00:00'), 'dd/MM/yyyy')
                : null;
              const du = op.data_emissao ? diasUteisEntre(op.data_emissao, (op.data_conclusao ?? hj).substring(0, 10)) : null;
              const dispStr = concluida
                ? op.data_conclusao!.substring(0, 10)
                : confirmada
                  ? proximoDiaUtil(op.data_programacao)
                  : op.data_emissao ? somarDiasUteis(op.data_emissao, 7) : null;
              const dispFmt = dispStr
                ? format(new Date(dispStr + 'T12:00:00'), 'dd/MM/yyyy')
                : '—';
              const dispLabel = concluida
                ? 'Disponível'
                : dispStr
                  ? dispStr < hj ? 'Disponível desde' : dispStr === hj ? 'Disponível hoje' : 'Disponível em'
                  : null;
              return (
                <div key={op.id} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${borderClass}`}>
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${concluida || confirmada ? 'bg-green-500' : 'bg-orange-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight">{op.produto}</p>
                    <p className="text-xs text-muted-foreground">Lote {op.lote} · <span className="font-medium text-foreground">{formatKg(op.quantidade)} kg</span></p>
                    <p className="text-xs text-muted-foreground">Emitido {emissaoFmt}
                      {du !== null && (
                        <span className={`ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-bold leading-4 ${
                          du <= 5 ? 'bg-blue-100 text-blue-700 border-blue-200'
                            : du <= 10 ? 'bg-orange-100 text-orange-700 border-orange-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                        }`}>{du}du</span>
                      )}
                    </p>
                    {conclusaoFmt && (
                      <p className="text-xs text-green-600 font-medium">Concluído em {conclusaoFmt}</p>
                    )}
                  </div>
                  {dispLabel && (
                    <div className={`text-right shrink-0 rounded-lg px-2 py-1 ${concluida ? 'bg-green-100 border border-green-300' : ''}`}>
                      <p className={`text-[10px] uppercase tracking-wide ${concluida ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>{dispLabel}</p>
                      <p className={`text-sm font-semibold ${concluida ? 'text-green-800' : ''}`}>{dispStr === hj && !concluida ? '' : dispFmt}</p>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground text-right pt-1">
              {resultadosBusca.length} produto{resultadosBusca.length !== 1 ? 's' : ''}
            </p>
          </div>
        )
      ) : (
        /* ── Modo semanal: cards por dia ── */
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
          {diasSemana.map((dia) => {
            const ops = ordPorDia.get(dia) ?? [];
            const isHoje = dia === hj;
            const nomeDia = capitalize(
              format(new Date(dia + 'T12:00:00'), 'EEEE', { locale: ptBR })
            );
            const dataDia = format(new Date(dia + 'T12:00:00'), 'dd/MM');

            return (
              <div
                key={dia}
                className={`min-w-[220px] w-[220px] shrink-0 rounded-xl border shadow-sm flex flex-col ${
                  isHoje
                    ? 'border-primary/60 bg-primary/5'
                    : 'border-border bg-card'
                }`}
              >
                {/* Cabeçalho */}
                <div
                  className={`px-3 py-2.5 border-b flex items-center justify-between gap-2 ${
                    isHoje ? 'border-primary/30' : 'border-border'
                  }`}
                >
                  <span className={`font-semibold text-sm ${isHoje ? 'text-primary' : ''}`}>
                    {nomeDia}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{dataDia}</span>
                </div>

                {/* Lista de OPs */}
                <div className="px-3 py-3 space-y-3 flex-1">
                  {ops.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum produto previsto</p>
                  ) : (
                    ops.map((op) => {
                      const confirmada = op.programacao_confirmada === true;
                      const emissaoFmt = op.data_emissao
                        ? format(new Date(op.data_emissao + 'T12:00:00'), 'dd/MM', { locale: ptBR })
                        : '—';
                      const conclusaoFmt = op.data_conclusao
                        ? format(new Date(op.data_conclusao.substring(0, 10) + 'T12:00:00'), 'dd/MM', { locale: ptBR })
                        : null;
                      const du = op.data_emissao ? diasUteisEntre(op.data_emissao, (op.data_conclusao ?? hj).substring(0, 10)) : null;

                      const duBadge = du !== null
                        ? du <= 5
                          ? { cls: 'bg-blue-100 text-blue-700 border-blue-200', label: `${du}du` }
                          : du <= 10
                            ? { cls: 'bg-orange-100 text-orange-700 border-orange-200', label: `${du}du` }
                            : { cls: 'bg-red-100 text-red-700 border-red-200', label: `${du}du` }
                        : null;

                      return (
                        <div key={op.id} className="flex items-start gap-2 border rounded-lg p-2 bg-background">
                          <span
                            className={`mt-[3px] h-2 w-2 rounded-full shrink-0 ${
                              confirmada ? 'bg-green-500' : 'bg-orange-400'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug break-words">{op.produto}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Lote {op.lote} · <span className="font-medium text-foreground">{formatKg(op.quantidade)} kg</span></p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-xs text-muted-foreground">Emitido {emissaoFmt}</span>
                              {duBadge && (
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-bold leading-4 ${duBadge.cls}`}>
                                  {duBadge.label}
                                </span>
                              )}
                            </div>
                            {conclusaoFmt && (
                              <p className="text-xs text-green-600 font-medium mt-0.5">Concluído {conclusaoFmt}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
