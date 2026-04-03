import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Perfil {
  id: string;
  nome: string;
  papel: 'gestor' | 'operador';
  balanca: number | null;
}

export function useAuth() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPerfil = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', user.id)
        .single();

      setPerfil(data as Perfil | null);
      setLoading(false);
    };

    fetchPerfil();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchPerfil();
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setPerfil(null);
  };

  return { perfil, loading, logout };
}
