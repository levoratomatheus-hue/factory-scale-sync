import { useState } from 'react';
import { LayoutDashboard, Scale, PlusCircle, History, FileUp, LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import PainelGestor from './PainelGestor';
import PainelBalanca from './PainelBalanca';
import CriarOrdem from './CriarOrdem';
import PainelHistorico from './PainelHistorico';
import ImportarProgramacao from './ImportarProgramacao';
import Login from './Login';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const tabsGestor = [
  { id: 'gestor', label: 'Painel do Gestor', icon: LayoutDashboard },
  { id: 'criar', label: 'Nova Ordem', icon: PlusCircle },
  { id: 'balanca1', label: 'Balança 1', icon: Scale },
  { id: 'balanca2', label: 'Balança 2', icon: Scale },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'importar', label: 'Importar', icon: FileUp },
] as const;

type TabGestorId = (typeof tabsGestor)[number]['id'];

export default function Index() {
  const { perfil, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabGestorId>('gestor');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!perfil) return <Login />;

  // Operador — vai direto para sua balança
  if (perfil.papel === 'operador') {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <span className="font-bold text-lg">Pesagem</span>
                <span className="text-sm text-muted-foreground">— {perfil.nome}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <PainelBalanca balanca={perfil.balanca ?? 1} />
        </main>
      </div>
    );
  }

  // Gestor — acesso completo
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-14 gap-6">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">Pesagem</span>
            </div>
            <nav className="flex gap-1">
              {tabsGestor.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
            <Button variant="ghost" size="sm" onClick={logout} className="ml-auto">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'gestor' && <PainelGestor />}
        {activeTab === 'criar' && <CriarOrdem />}
        {activeTab === 'balanca1' && <PainelBalanca balanca={1} />}
        {activeTab === 'balanca2' && <PainelBalanca balanca={2} />}
        {activeTab === 'historico' && <PainelHistorico />}
        {activeTab === 'importar' && <ImportarProgramacao />}
      </main>
    </div>
  );
}
