import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Horários-alvo do dia (em minutos desde meia-noite)
const HORARIOS_ALVO = [8 * 60, 11 * 60, 14 * 60, 17 * 60]; // 08, 11, 14, 17

function getSegundaDaSemana(date: Date): string {
  const d = new Date(date);
  const dia = d.getDay(); // 0=dom, 1=seg, ..., 6=sab
  const diff = dia === 0 ? -6 : 1 - dia; // volta até segunda
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function ehDiaUtil(date: Date): boolean {
  const dia = date.getDay();
  return dia >= 1 && dia <= 5; // seg=1 a sex=5
}

function minutosAgora(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

// Chave para sessionStorage: quais slots já foram exibidos hoje
function chaveSessionHoje(): string {
  const hoje = new Date().toISOString().split('T')[0];
  return `alerta_mp_mostrados_${hoje}`;
}

function getSlotsMostradosHoje(): number[] {
  try {
    const raw = sessionStorage.getItem(chaveSessionHoje());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function marcarSlotMostradoHoje(slotMinutos: number) {
  const mostrados = getSlotsMostradosHoje();
  if (!mostrados.includes(slotMinutos)) {
    mostrados.push(slotMinutos);
    sessionStorage.setItem(chaveSessionHoje(), JSON.stringify(mostrados));
  }
}

export function useAlertaRelatorioMP(isGestor: boolean, userId: string | null) {
  const [visivel, setVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Verifica se deve mostrar o banner agora
  const verificar = useCallback(async () => {
    const agora = new Date();

    // Só para gestores em dias úteis
    if (!isGestor || !ehDiaUtil(agora)) {
      setVisivel(false);
      return;
    }

    // Verifica se a semana já teve OK no banco
    const semanaInicio = getSegundaDaSemana(agora);
    const { data } = await supabase
      .from('alerta_relatorio_mp')
      .select('feito')
      .eq('semana_inicio', semanaInicio)
      .maybeSingle();

    if (data?.feito) {
      setVisivel(false);
      return;
    }

    // Qual é o último slot passado hoje que ainda não foi mostrado nesta sessão?
    const agora_min = minutosAgora(agora);
    const mostrados = getSlotsMostradosHoje();

    const slotPendente = [...HORARIOS_ALVO]
      .reverse() // do mais recente para o mais antigo
      .find((slot) => agora_min >= slot && !mostrados.includes(slot));

    if (slotPendente !== undefined) {
      marcarSlotMostradoHoje(slotPendente);
      setVisivel(true);
    } else {
      setVisivel(false);
    }
  }, [isGestor]);

  // Verifica ao montar e a cada 5 minutos
  useEffect(() => {
    if (!isGestor || !userId) {
      setVisivel(false);
      return;
    }

    verificar();

    intervalRef.current = setInterval(verificar, 5 * 60 * 1000); // a cada 5 min
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isGestor, userId, verificar]);

  const confirmarFeito = useCallback(async () => {
    if (!userId) return;
    setCarregando(true);
    const semanaInicio = getSegundaDaSemana(new Date());
    try {
      await supabase
        .from('alerta_relatorio_mp')
        .upsert(
          {
            semana_inicio: semanaInicio,
            feito: true,
            feito_em: new Date().toISOString(),
            feito_por: userId,
          },
          { onConflict: 'semana_inicio' }
        );
    } finally {
      setCarregando(false);
      setVisivel(false);
    }
  }, [userId]);

  const deixarParaDepois = useCallback(() => {
    // Já marcamos o slot como mostrado ao exibir, então apenas esconde
    setVisivel(false);
  }, []);

  return { visivel, carregando, confirmarFeito, deixarParaDepois };
}
