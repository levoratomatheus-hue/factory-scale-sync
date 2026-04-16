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
      return;
    }

    const fetchFormula = async () => {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('formulas')
        .select('id, sequencia, materia_prima, fornecedor, unidade, percentual')
        .eq('formula_id', formulaId)
        .order('sequencia', { ascending: true });

      setLoading(false);

      if (err || !data) {
        setError('Erro ao buscar fórmula');
        setItens([]);
        return;
      }

      setItens(
        data.map((row) => ({
          ...row,
          quantidade_kg: parseFloat(((row.percentual / 100) * tamanhoBatelada).toFixed(3)),
        }))
      );
    };

    fetchFormula();
  }, [formulaId, tamanhoBatelada]);

  const setQuantidade = (id: string, quantidade_kg: number) => {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantidade_kg } : item))
    );
  };

  return { itens, loading, error, setQuantidade };
}
