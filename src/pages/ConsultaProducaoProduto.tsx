import { useState, useRef, useCallback } from 'react';
import { Search, X, ChevronDown, Package, ShoppingCart } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/StatusBadge';
import { MarcaBadge } from '@/components/MarcaBadge';
import { cn } from '@/lib/utils';
import { formatKg } from '@/lib/utils';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Ordem {
  id: string;
  produto: string;
  lote: string;
  quantidade: number;
  quantidade_real: number | null;
  status: string;
  linha: number | null;
  balanca: number | null;
  formula_id: string | null;
  tamanho_batelada: number | null;
  obs: string | null;
  obs_linha: string | null;
  obs_laboratorio: string | null;
  marca: string | null;
  data_programacao: string | null;
  data_emissao: string | null;
  programacao_confirmada: boolean | null;
  criado_em: string;
  motivo_reprovacao: string | null;
  data_reprovacao: string | null;
  tipo_op: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return '—'; }
}

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return '—'; }
}

// Data de referência para ordenação e exibição: criado_em sempre existe.
function dataRef(ordem: Ordem): string {
  return ordem.criado_em;
}

// ── Card de OP ───────────────────────────────────────────────────────────────

function OrdemCard({ ordem }: { ordem: Ordem }) {
  const [open, setOpen] = useState(false);

  const reprovado = !!ordem.motivo_reprovacao;
  const concluido = ordem.status === 'concluido';
  const emLinha   = ordem.status === 'em_linha';
  const estoque   = ordem.tipo_op === 'estoque';

  const borderClass = reprovado
    ? 'border-red-300 bg-red-50/60 dark:bg-red-900/20'
    : concluido
    ? 'border-green-400 bg-green-100/80 dark:bg-green-900/40'
    : emLinha
    ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-900/20'
    : estoque
    ? 'border-purple-300 bg-purple-50/50 dark:bg-purple-900/20'
    : 'border-border';

  const dotClass = reprovado
    ? 'bg-red-500'
    : concluido
    ? 'bg-green-500'
    : emLinha
    ? 'bg-blue-500'
    : estoque
    ? 'bg-purple-500'
    : 'bg-orange-400';

  return (
    <div className={cn('rounded-xl border bg-card shadow-sm overflow-hidden', borderClass)}>
      {/* ── Header (sempre visível) ── */}
      <button
        className="w-full text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-2 px-3 py-2.5">
          {/* Dot de status */}
          <span className={cn('mt-1.5 h-2 w-2 rounded-full shrink-0', dotClass)} />

          {/* Produto + lote */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-snug break-words">{ordem.produto}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Lote {ordem.lote}
            </p>
          </div>

          {/* Bloco direito: quantidade + data ref + status */}
          <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
            <span className="text-xs font-bold tabular-nums">
              {formatKg(ordem.quantidade)} kg
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {fmtData(dataRef(ordem))}
            </span>
            <StatusBadge status={ordem.status} className="text-[10px] px-1.5 py-0" />
          </div>

          {/* Chevron */}
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground mt-1 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* ── Body expansível ── */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-2 space-y-2 border-t border-black/5 dark:border-white/10 text-xs text-muted-foreground">

            {/* Marca + tipo_op */}
            <div className="flex items-center gap-2 flex-wrap">
              <MarcaBadge marca={ordem.marca} size="sm" />
              {ordem.tipo_op && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[10px] font-semibold rounded px-1.5 py-0.5 border',
                    ordem.tipo_op === 'estoque'
                      ? 'text-purple-700 bg-purple-50 border-purple-200'
                      : 'text-blue-700 bg-blue-50 border-blue-200',
                  )}
                >
                  {ordem.tipo_op === 'estoque'
                    ? <><Package className="h-2.5 w-2.5 shrink-0" /> Estoque</>
                    : <><ShoppingCart className="h-2.5 w-2.5 shrink-0" /> Venda</>}
                </span>
              )}
            </div>

            {/* Grid de campos */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <Field label="Qtd. programada"  value={`${formatKg(ordem.quantidade)} kg`} />
              <Field label="Qtd. real"         value={ordem.quantidade_real != null ? `${formatKg(ordem.quantidade_real)} kg` : '—'} />
              {ordem.formula_id    && <Field label="Fórmula"    value={ordem.formula_id} />}
              {ordem.tamanho_batelada && <Field label="Batelada" value={`${formatKg(ordem.tamanho_batelada)} kg`} />}
              {ordem.linha   != null && <Field label="Linha"    value={String(ordem.linha)} />}
              {ordem.balanca != null && <Field label="Balança"  value={String(ordem.balanca)} />}
              <Field label="Criado em"     value={fmtDataHora(ordem.criado_em)} />
              {ordem.data_emissao    && <Field label="Emissão"   value={fmtData(ordem.data_emissao)} />}
              {ordem.data_programacao && <Field label="Programado" value={fmtData(ordem.data_programacao)} />}
              {ordem.data_reprovacao  && <Field label="Reprovado" value={fmtData(ordem.data_reprovacao)} />}
            </dl>

            {/* Obs */}
            {ordem.obs           && <ObsRow label="Obs. geral"  text={ordem.obs} />}
            {ordem.obs_linha      && <ObsRow label="Obs. linha"  text={ordem.obs_linha} />}
            {ordem.obs_laboratorio && <ObsRow label="Obs. lab"   text={ordem.obs_laboratorio} />}

            {/* Motivo reprovação */}
            {reprovado && (
              <div className="mt-1 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2.5 py-2 text-red-700 dark:text-red-400 text-[11px]">
                <span className="font-semibold">Reprovado:</span> {ordem.motivo_reprovacao}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ObsRow({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}: </span>
      <span className="text-foreground">{text}</span>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

const FIELDS =
  'id, produto, lote, quantidade, quantidade_real, status, linha, balanca, ' +
  'formula_id, tamanho_batelada, obs, obs_linha, obs_laboratorio, marca, ' +
  'data_programacao, data_emissao, programacao_confirmada, criado_em, ' +
  'motivo_reprovacao, data_reprovacao, tipo_op';

export default function ConsultaProducaoProduto() {
  const [busca, setBusca]     = useState('');
  const [termo, setTermo]     = useState('');   // termo confirmado (Enter / botão)
  const [ordens, setOrdens]   = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const buscar = useCallback(async (texto: string) => {
    const q = texto.trim();
    if (q.length < 3) return;
    setTermo(q);
    setBuscado(true);
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('ordens')
      .select(FIELDS)
      .ilike('produto', `%${q}%`)
      .order('criado_em', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) {
      console.error('[ConsultaProducaoProduto]', error.message);
      setOrdens([]);
      return;
    }
    setOrdens((data as Ordem[]) ?? []);
  }, []);

  const limpar = () => {
    setBusca('');
    setTermo('');
    setOrdens([]);
    setBuscado(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') buscar(busca);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Consulta por Produto</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Histórico completo de OPs de um produto, da mais recente à mais antiga.
        </p>
      </div>

      {/* Campo de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Código ou nome do produto (mín. 3 caracteres)"
            className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoComplete="off"
          />
          {busca && (
            <button
              onClick={limpar}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              title="Limpar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => buscar(busca)}
          disabled={busca.trim().length < 3 || loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          Buscar
        </button>
      </div>

      {/* Contagem / estados */}
      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse">Buscando…</p>
      )}

      {!loading && buscado && ordens.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{ordens.length}</span>{' '}
          {ordens.length === 1 ? 'OP encontrada' : 'OPs encontradas'} para{' '}
          <span className="font-mono font-semibold">"{termo}"</span>
        </p>
      )}

      {!loading && buscado && ordens.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">
            Nenhuma produção encontrada para{' '}
            <span className="font-mono font-semibold">"{termo}"</span>
          </p>
          <p className="text-xs mt-1 opacity-70">Verifique o código/nome e tente novamente.</p>
        </div>
      )}

      {!buscado && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Digite o código ou nome do produto e pressione Enter.</p>
        </div>
      )}

      {/* Lista de cards */}
      {!loading && ordens.length > 0 && (
        <div className="space-y-2">
          {ordens.map((o) => (
            <OrdemCard key={o.id} ordem={o} />
          ))}
        </div>
      )}
    </div>
  );
}
