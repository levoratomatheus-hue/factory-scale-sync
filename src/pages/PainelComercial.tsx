import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Search, PackageSearch, Loader2, AlertCircle, CalendarDays } from 'lucide-react';
import { formatKg } from '@/lib/utils';

// ── Helpers de data ───────────────────────────────────────────────────────────

function hoje(): string {
  const d = new Date();
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
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fixos = [[1,1],[4,21],[5,1],[9,7],[10,12],[11,2],[11,15],[12,25]]
    .map(([m, d]) => fmt(new Date(ano, m - 1, d, 12)));
  const e = pascoa(ano);
  const add = (n: number) => { const x = new Date(e); x.setDate(x.getDate() + n); return fmt(x); };
  return new Set([...fixos, add(-48), add(-47), add(-2), fmt(e), add(60)]);
}

function proximoDiaUtil(dataStr: string | null | undefined): string | null {
  if (!dataStr) return null;
  const ymd = dataStr.slice(0, 10);
  const d = new Date(ymd + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  let cacheAno = -1, feriados = new Set<string>();
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    const ano = d.getFullYear();
    if (ano !== cacheAno) { feriados = feriadosDoAno(ano); cacheAno = ano; }
    const day = d.getDay();
    if (day !== 0 && day !== 6 && !feriados.has(fmt(d))) break;
  }
  return fmt(d);
}

function subDias(dataStr: string, n: number): string {
  const d = new Date(dataStr + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Tipos e helpers ───────────────────────────────────────────────────────────

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
  formula_id: string | null;
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

// ── Componente ────────────────────────────────────────────────────────────────

export default function PainelComercial() {
  const [busca, setBusca] = useState('');
  const [dataSelecionada, setDataSelecionada] = useState(hoje());
  const [ordens, setOrdens] = useState<OrdemComercial[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const term = busca.trim();
  const modoTexto = term.length >= 3;

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
            .select('id, produto, lote, quantidade, status, data_programacao, formula_id')
            .in('status', STATUS_VISIVEIS)
            .or(`produto.ilike.%${term}%,lote.ilike.%${term}%`)
            .order('data_programacao', { ascending: false })
            .limit(300);

          if (error) throw new Error(error.message);
          rows = deduplicar((data as OrdemComercial[]) ?? []);
        } else {
          // Busca num range de 10 dias antes da data selecionada e filtra
          // client-side: disponibilidade = proximoDiaUtil(data_programacao) === dataSelecionada
          const dataMin = subDias(dataSelecionada, 10);
          const { data, error } = await supabase
            .from('ordens')
            .select('id, produto, lote, quantidade, status, data_programacao, formula_id')
            .in('status', STATUS_VISIVEIS)
            .gte('data_programacao', dataMin)
            .lt('data_programacao', dataSelecionada)
            .order('produto', { ascending: true })
            .limit(500);

          if (error) throw new Error(error.message);
          const todas = (data as OrdemComercial[]) ?? [];
          rows = deduplicar(todas.filter(op => proximoDiaUtil(op.data_programacao) === dataSelecionada));
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
  }, [busca, dataSelecionada]);

  let dataSelecionadaFormatted = dataSelecionada;
  try { dataSelecionadaFormatted = format(new Date(dataSelecionada + 'T12:00:00'), 'dd/MM/yyyy'); } catch { /* */ }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consulta de Produtos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {modoTexto
            ? 'Resultados da busca em todas as datas'
            : `Disponível em ${dataSelecionadaFormatted}`}
        </p>
      </div>

      {/* Seletor de data */}
      {!modoTexto && (
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
          <label className="text-sm text-muted-foreground whitespace-nowrap">Data de disponibilidade:</label>
          <input
            type="date"
            value={dataSelecionada}
            onChange={(e) => e.target.value && setDataSelecionada(e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring shadow-sm"
          />
          {dataSelecionada !== hoje() && (
            <button
              onClick={() => setDataSelecionada(hoje())}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Hoje
            </button>
          )}
        </div>
      )}

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
      ) : ordens === null || ordens.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <PackageSearch className="h-10 w-10" />
          <p className="text-sm text-center">
            {modoTexto
              ? 'Nenhum produto encontrado'
              : `Nenhum produto disponível em ${dataSelecionadaFormatted}`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordens.map((ordem) => {
            const concluido = ordem.status === 'concluido';
            const disp = proximoDiaUtil(ordem.data_programacao);
            let dispFormatted = '—';
            try {
              if (disp) dispFormatted = format(new Date(disp + 'T12:00:00'), 'dd/MM/yyyy');
            } catch { /* data inválida */ }
            const jaDisponivel = concluido && disp !== null && disp <= hoje();
            return (
              <div key={ordem.id} className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">{ordem.produto}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Lote {ordem.lote} · {formatKg(ordem.quantidade)} kg
                  </p>
                </div>
                {jaDisponivel ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 px-3 py-1 text-xs font-semibold whitespace-nowrap">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block shrink-0" />
                    Disponível desde {dispFormatted}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    Disponível em{' '}
                    <span className="font-semibold text-foreground">{dispFormatted}</span>
                  </span>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground text-right pt-1">
            {ordens.length} produto{ordens.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
