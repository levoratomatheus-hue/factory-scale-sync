import { useState } from 'react';
import { LayoutDashboard, Scale, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import PainelGestor from './PainelGestor';
import PainelBalanca from './PainelBalanca';
import CriarOrdem from './CriarOrdem';

const tabs = [
  { id: 'gestor', label: 'Painel do Gestor', icon: LayoutDashboard },
  { id: 'criar', label: 'Nova Ordem', icon: PlusCircle },
  { id: 'balanca1', label: 'Balança 1', icon: Scale },
  { id: 'balanca2', label: 'Balança 2', icon: Scale },
] as const;

type TabId = typeof tabs[number]['id'];

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabId>('gestor');

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-14 gap-6">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">Pesagem</span>
            </div>
            <nav className="flex gap-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'gestor' && <PainelGestor />}
        {activeTab === 'criar' && <CriarOrdem />}
        {activeTab === 'balanca1' && <PainelBalanca balanca={1} />}
        {activeTab === 'balanca2' && <PainelBalanca balanca={2} />}
      </main>
    </div>
  );
}
