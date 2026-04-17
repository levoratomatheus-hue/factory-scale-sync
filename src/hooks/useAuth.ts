import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Perfil {
  id: string;
  nome: string;
  papel: 'gestor' | 'operador';
  balanca: string | null;
}

export function useAuth() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data, error } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        console.log('perfil data:', data);
        console.log('perfil error:', error);

        if (data) setPerfil(data as Perfil);
        setLoading(false);
      } catch (err) {
        console.log('erro useAuth:', err);
        setLoading(false);
      }
    };

    fetchPerfil();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchPerfil();
      } else {
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setPerfil(null);
  };

  return { perfil, loading, logout };
}
