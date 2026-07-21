import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Perfil {
  id: string;
  nome: string;
  papel: 'gestor' | 'operador' | 'comercial' | 'tecnico' | 'desenvolvimento';
  balanca: string | null;
}

export function useAuth() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPerfil = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        setEmail(user.email ?? null);

        const { data, error } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (data) setPerfil(data as Perfil);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };

    fetchPerfil();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchPerfil();
      } else {
        setPerfil(null);
        setEmail(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setEmail(null);
  };

  return { perfil, email, loading, logout };
}
