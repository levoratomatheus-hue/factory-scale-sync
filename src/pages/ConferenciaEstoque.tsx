import { useState, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Upload, Search, ArrowLeftRight } from 'lucide-react';
import { cn, formatKg } from '@/lib/utils';
import { parseEstoqueTid, normalizeCod, TidItem } from '@/lib/parseEstoqueTid';

// ── Types ──────────────────────────────────────────────────────────────────────

type Marca = 'ZC' | 'PG';

type StatusConf =
  | 'ok'
  | 'divergente'
  | 'sem_sistema'  // TID tem a MP mas ela não está na tabela de estoque
  | 'so_sistema';  // MP está no estoque do sistema mas não veio no TID

interface LinhaConf {
  cod_tid: string | null;
  cod_pg: string | null;    // apenas PG; null para ZC
  nome: string;
  saldo_tid: number | null;
  saldo_sistema: number | null;
  diferenca: number | null; // saldo_tid - saldo_sistema
  status: StatusConf;
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<StatusConf, string> = {
  ok:          'OK',
  divergente:  'Divergente',
  sem_sistema: 'Só no TID',
  so_sistema:  'Só no sistema',
};

const STATUS_BADGE: Record<StatusConf, string> = {
  ok:          'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  divergente:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  sem_sistema: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  so_sistema:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_CARD_COLOR: Record<StatusConf, string> = {
  ok:          'text-green-600 dark:text-green-400',
  divergente:  'text-red-600 dark:text-red-400',
  sem_sistema: 'text-orange-600 dark:text-orange-400',
  so_sistema:  'text-blue-600 dark:text-blue-400',
};

const TOLERANCE = 0.001; // kg

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDiferenca(d: number): string {
  const prefix = d >= 0 ? '+' : '';
  return prefix + formatKg(d);
}

// ── Componente principal ────────────────────────────────────────────────────────

export default function ConferenciaEstoque() {
  const [marca, setMarca] = useState<Marca>('ZC');
  const [loading, setLoading] = useState(false);
  const [linhas, setLinhas] = useState<LinhaConf[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<StatusConf | 'todos'>('divergente');
  const [busca, setBusca] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Lógica de processamento ──────────────────────────────────────────────────

  async function processarArquivo(file: File) {
    setLoading(true);
    setLinhas([]);
    setBusca('');
    setFiltroStatus('divergente');
    try {
      const buffer = await file.arrayBuffer();
      const tidRows = parseEstoqueTid(buffer);
      if (marca === 'ZC') {
        await processarZC(tidRows);
      } else {
        await processarPG(tidRows);
      }
    } catch (err) {
      console.error('[ConferenciaEstoque] erro ao processar arquivo:', err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * ZC: match direto por cod_tid — estoque_mp já usa cod_tid como chave primária.
   */
  async function processarZC(tidRows: TidItem[]) {
    const { data: estoqueData, error: estoqueErr } = await (supabase as any)
      .from('estoque_mp')
      .select('cod_tid, materia_prima, saldo_kg');
    if (estoqueErr) throw estoqueErr;

    // Map: normCodTid → {cod_tid_raw, nome, saldo_kg}
    const sistemaMap = new Map<string, { cod_tid: string; nome: string; saldo_kg: number }>();
    for (const row of (estoqueData ?? [])) {
      sistemaMap.set(normalizeCod(row.cod_tid), {
        cod_tid:  row.cod_tid,
        nome:     row.materia_prima,
        saldo_kg: Number(row.saldo_kg),
      });
    }

    const resultado: LinhaConf[] = [];
    const normUsados = new Set<string>();

    for (const tid of tidRows) {
      const normTid = normalizeCod(tid.cod_tid);
      const sistema = sistemaMap.get(normTid);

      if (!sistema) {
        resultado.push({
          cod_tid:       tid.cod_tid,
          cod_pg:        null,
          nome:          tid.nome,
          saldo_tid:     tid.saldo_kg,
          saldo_sistema: null,
          diferenca:     null,
          status:        'sem_sistema',
        });
        continue;
      }

      normUsados.add(normTid);
      const diferenca = tid.saldo_kg - sistema.saldo_kg;
      resultado.push({
        cod_tid:       tid.cod_tid,
        cod_pg:        null,
        nome:          tid.nome,
        saldo_tid:     tid.saldo_kg,
        saldo_sistema: sistema.saldo_kg,
        diferenca,
        status:        Math.abs(diferenca) <= TOLERANCE ? 'ok' : 'divergente',
      });
    }

    // Itens no estoque_mp sem correspondência no TID
    for (const [normCod, item] of sistemaMap) {
      if (!normUsados.has(normCod)) {
        resultado.push({
          cod_tid:       item.cod_tid,
          cod_pg:        null,
          nome:          item.nome,
          saldo_tid:     null,
          saldo_sistema: item.saldo_kg,
          diferenca:     null,
          status:        'so_sistema',
        });
      }
    }

    setLinhas(resultado);
  }

  /**
   * PG: match direto cod_tid (normalizado) vs cod_pg (normalizado), sem mp_depara.
   * A tabela estoque_mp_pg é separada e usa cod_pg como identificador.
   */
  async function processarPG(tidRows: TidItem[]) {
    const { data: estoqueData, error: estoqueErr } = await (supabase as any)
      .from('estoque_mp_pg')
      .select('cod_pg, materia_prima, saldo_kg');
    if (estoqueErr) throw estoqueErr;

    // Map: normCodPg → {cod_pg_raw, nome, saldo_kg}
    const sistemaMap = new Map<string, { cod_pg: string; nome: string; saldo_kg: number }>();
    for (const row of (estoqueData ?? [])) {
      sistemaMap.set(normalizeCod(row.cod_pg), {
        cod_pg:   row.cod_pg,
        nome:     row.materia_prima,
        saldo_kg: Number(row.saldo_kg),
      });
    }

    const resultado: LinhaConf[] = [];
    const normUsados = new Set<string>();

    for (const tid of tidRows) {
      const normTid = normalizeCod(tid.cod_tid);
      const sistema = sistemaMap.get(normTid);

      if (!sistema) {
        resultado.push({
          cod_tid:       tid.cod_tid,
          cod_pg:        null,
          nome:          tid.nome,
          saldo_tid:     tid.saldo_kg,
          saldo_sistema: null,
          diferenca:     null,
          status:        'sem_sistema',
        });
        continue;
      }

      normUsados.add(normTid);
      const diferenca = tid.saldo_kg - sistema.saldo_kg;
      resultado.push({
        cod_tid:       tid.cod_tid,
        cod_pg:        sistema.cod_pg,
        nome:          tid.nome,
        saldo_tid:     tid.saldo_kg,
        saldo_sistema: sistema.saldo_kg,
        diferenca,
        status:        Math.abs(diferenca) <= TOLERANCE ? 'ok' : 'divergente',
      });
    }

    // Itens presentes no estoque_mp_pg mas sem correspondência no TID
    for (const [normCod, item] of sistemaMap) {
      if (!normUsados.has(normCod)) {
        resultado.push({
          cod_tid:       null,
          cod_pg:        item.cod_pg,
          nome:          item.nome,
          saldo_tid:     null,
          saldo_sistema: item.saldo_kg,
          diferenca:     null,
          status:        'so_sistema',
        });
      }
    }

    setLinhas(resultado);
  }

  // ── Derivados ────────────────────────────────────────────────────────────────

  const contadores = useMemo(() => {
    const c: Record<StatusConf, number> = {
      ok: 0, divergente: 0, sem_sistema: 0, so_sistema: 0,
    };
    for (const l of linhas) c[l.status]++;
    return c;
  }, [linhas]);

  const filtered = useMemo(() => {
    let result = linhas;
    if (filtroStatus !== 'todos') {
      result = result.filter((l) => l.status === filtroStatus);
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      result = result.filter(
        (l) =>
          l.nome.toLowerCase().includes(q) ||
          (l.cod_tid ?? '').toLowerCase().includes(q) ||
          (l.cod_pg ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [linhas, filtroStatus, busca]);

  const hasResults = linhas.length > 0;
  const mostrarCodPg = marca === 'PG';

  // ── Eventos ──────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setNomeArquivo(f.name);
      processarArquivo(f);
    }
    e.target.value = '';
  }

  function handleMarcaChange(nova: Marca) {
    if (nova === marca) return;
    setMarca(nova);
    setLinhas([]);
    setNomeArquivo(null);
    setBusca('');
    setFiltroStatus('divergente');
  }

  // ── Cards de resumo ──────────────────────────────────────────────────────────

  const SUMMARY_CARDS: { key: StatusConf; label: string }[] = [
    { key: 'divergente',  label: 'Divergentes'   },
    { key: 'ok',          label: 'OK'            },
    { key: 'sem_sistema', label: 'Só no TID'     },
    { key: 'so_sistema',  label: 'Só no sistema' },
  ];

  const STATUS_ORDER: StatusConf[] = [
    'divergente', 'ok', 'sem_sistema', 'so_sistema',
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 shrink-0" />
            Conferência de Estoque
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Somente leitura — confronta o saldo do TID com o saldo cadastrado no sistema
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Seletor de marca */}
          <div className="flex rounded-lg border overflow-hidden text-sm font-medium">
            <button
              className={cn(
                'px-3 py-1.5 transition-colors',
                marca === 'ZC'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
              onClick={() => handleMarcaChange('ZC')}
            >
              Zan Collor
            </button>
            <button
              className={cn(
                'px-3 py-1.5 transition-colors border-l',
                marca === 'PG'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
              onClick={() => handleMarcaChange('PG')}
            >
              Pigma
            </button>
          </div>

          {/* Upload */}
          <input
            ref={fileRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            size="sm"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            {nomeArquivo ? 'Trocar arquivo' : 'Enviar relatório TID'}
          </Button>
        </div>
      </div>

      {/* Nome do arquivo e total */}
      {nomeArquivo && !loading && (
        <p className="text-xs text-muted-foreground">
          Arquivo:{' '}
          <span className="font-mono">{nomeArquivo}</span>
          {' · '}
          <span className="font-medium text-foreground">{linhas.length}</span> itens processados
          {' · Marca: '}
          <span className="font-medium text-foreground">{marca === 'ZC' ? 'Zan Collor' : 'Pigma'}</span>
        </p>
      )}

      {/* ── Carregando ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground text-sm">Processando arquivo e consultando banco…</span>
        </div>
      )}

      {/* ── Cards de resumo ───────────────────────────────────────────────── */}
      {hasResults && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {SUMMARY_CARDS.map(({ key, label }) => (
            <Card
              key={key}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md select-none',
                filtroStatus === key && 'ring-2 ring-primary',
                contadores[key] === 0 && 'opacity-50 pointer-events-none',
              )}
              onClick={() =>
                setFiltroStatus((prev) => (prev === key ? 'todos' : key))
              }
            >
              <CardContent className="p-3 text-center">
                <p className={cn('text-3xl font-bold tabular-nums leading-tight', STATUS_CARD_COLOR[key])}>
                  {contadores[key]}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      {hasResults && !loading && (
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant={filtroStatus === 'todos' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFiltroStatus('todos')}
          >
            Todos ({linhas.length})
          </Button>
          {STATUS_ORDER.map((s) => (
            <Button
              key={s}
              variant={filtroStatus === s ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              disabled={contadores[s] === 0}
              onClick={() =>
                setFiltroStatus((prev) => (prev === s ? 'todos' : s))
              }
            >
              {STATUS_LABELS[s]} ({contadores[s]})
            </Button>
          ))}

          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome ou código…"
              className="pl-7 h-7 text-xs w-60"
            />
          </div>
        </div>
      )}

      {/* ── Tabela ────────────────────────────────────────────────────────── */}
      {hasResults && !loading && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Cód. TID</th>
                <th className="text-left px-3 py-2 font-medium">Matéria-Prima</th>
                {mostrarCodPg && <th className="text-left px-3 py-2 font-medium">Cód. PG</th>}
                <th className="text-right px-3 py-2 font-medium">Saldo TID (kg)</th>
                <th className="text-right px-3 py-2 font-medium">Saldo Sistema (kg)</th>
                <th className="text-right px-3 py-2 font-medium">Diferença (kg)</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={mostrarCodPg ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhum item encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.map((l, i) => {
                  const difPos = l.diferenca !== null && l.diferenca > TOLERANCE;
                  const difNeg = l.diferenca !== null && l.diferenca < -TOLERANCE;
                  return (
                    <tr
                      key={i}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      {/* Cód. TID */}
                      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                        {l.cod_tid ?? '—'}
                      </td>

                      {/* Nome */}
                      <td
                        className="px-3 py-2 font-medium max-w-[200px] truncate"
                        title={l.nome}
                      >
                        {l.nome || '—'}
                      </td>

                      {/* Cód. PG (somente PG) */}
                      {mostrarCodPg && (
                        <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                          {l.cod_pg ?? '—'}
                        </td>
                      )}

                      {/* Saldo TID */}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.saldo_tid !== null ? formatKg(l.saldo_tid) : '—'}
                      </td>

                      {/* Saldo sistema */}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.saldo_sistema !== null ? formatKg(l.saldo_sistema) : '—'}
                      </td>

                      {/* Diferença */}
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums font-semibold',
                          difPos && 'text-red-600 dark:text-red-400',
                          difNeg && 'text-orange-600 dark:text-orange-400',
                        )}
                      >
                        {l.diferenca !== null ? formatDiferenca(l.diferenca) : '—'}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            STATUS_BADGE[l.status],
                          )}
                        >
                          {STATUS_LABELS[l.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Rodapé com totais dos filtrados */}
            {filtered.length > 0 && (
              <tfoot className="bg-muted/30 text-muted-foreground font-medium border-t-2">
                <tr>
                  <td colSpan={mostrarCodPg ? 3 : 2} className="px-3 py-2 text-xs">
                    {filtered.length} item{filtered.length !== 1 ? 's' : ''}
                    {filtroStatus !== 'todos' && ` · filtro: ${STATUS_LABELS[filtroStatus as StatusConf]}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-foreground">
                    {formatKg(
                      filtered.reduce((acc, l) => acc + (l.saldo_tid ?? 0), 0),
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs text-foreground">
                    {formatKg(
                      filtered.reduce((acc, l) => acc + (l.saldo_sistema ?? 0), 0),
                    )}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Estado vazio ─────────────────────────────────────────────────── */}
      {!hasResults && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <ArrowLeftRight className="h-14 w-14 mb-4 opacity-15" />
          <p className="text-sm font-medium">Nenhum dado carregado</p>
          <p className="text-xs mt-1 text-center max-w-sm">
            Selecione a marca (<strong>Zan Collor</strong> ou <strong>Pigma</strong>) e envie o
            relatório de estoque exportado do TID (.txt) para iniciar a conferência.
          </p>
        </div>
      )}
    </div>
  );
}
