import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FormulaItem {
  id: string;
  sequencia: number | null;
  materia_prima: string;
  fornecedor: string | null;
  unidade: string | null;
  percentual: number;
  quantidade_kg: number;
}

export function useFormula(formulaId: string | null, tamanhoBatelada: number | null) {
  const [itens, setItens] = useState<FormulaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formulaId || !tamanhoBatelada || tamanhoBatelada <= 0) {
      setItens([]);
      setLoading(false);
      setError(null);
      return;
    }

    setItens([]);
    setLoading(true);
    setError(null);

    let cancelled = false;

    supabase
      .from('formulas')
      .select('id, sequencia, materia_prima, fornecedor, unidade, percentual')
      .eq('formula_id', formulaId)
      .order('sequencia', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err || !data) {
          setError('Erro ao buscar fórmula');
          setItens([]);
          return;
        }
        if (data.length === 0) {
          setError('Fórmula não encontrada');
          setItens([]);
          return;
        }
        setError(null);
        setItens(
          data.map((row) => ({
            ...row,
            quantidade_kg: parseFloat(((row.percentual / 100) * tamanhoBatelada).toFixed(3)),
          }))
        );
      });

    return () => { cancelled = true; };
  }, [formulaId, tamanhoBatelada]);

  const setQuantidade = (id: string, quantidade_kg: number) => {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantidade_kg } : item))
    );
  };

  return { itens, loading, error, setQuantidade };
}
