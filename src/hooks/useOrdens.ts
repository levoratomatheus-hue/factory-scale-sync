import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
type Ordem = Tables<'ordens'>;

export function useOrdens(date?: string) {
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [loading, setLoading] = useState(true);
  const today = date || new Date().toISOString().split('T')[0];

  const fetchOrdens = useCallback(async () => {
    let query = supabase
      .from('ordens')
      .select('*')
      .order('numero', { ascending: true });

    if (date) {
      // Painel do Gestor — filtra pelo dia selecionado
      query = query.eq('data_programacao', today);
    } else {
      // Balança — mostra tudo que ainda não foi concluído, qualquer dia
      query = query.neq('status', 'Concluído');
    }

    const { data, error } = await query;
    if (!error && data) setOrdens(data);
    setLoading(false);
  }, [today, date]);

  useEffect(() => {
    fetchOrdens();
    const channel = supabase
      .channel('ordens-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens' }, () => {
        fetchOrdens();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrdens]);

  const concluirOrdem = async (ordemId: string) => {
    const ordem = ordens.find(o => o.id === ordemId);
    if (!ordem) return;

    await supabase
      .from('ordens')
      .update({
        status: 'Concluído',
        data_conclusao: new Date().toISOString(),
      })
      .eq('id', ordemId);

    await supabase.from('historico').insert({
      ordem_id: ordemId,
      status_anterior: ordem.status,
      status_novo: 'Concluído',
    });

    const nextOrder = ordens.find(
      o => o.balanca === ordem.balanca && o.status === 'Em Aberto' && o.id !== ordemId
    );
    if (nextOr