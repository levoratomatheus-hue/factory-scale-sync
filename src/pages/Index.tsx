import { useState, ReactNode } from 'react';
import { LayoutDashboard, Scale, PlusCircle, History, FileUp, LogOut, Loader2, FlaskConical, Factory, ShieldCheck } from 'lucide-react';
import PainelGestor from './PainelGestor';
import PainelBalanca from './PainelBalanca';
import PainelMistura from './PainelMistura';
import PainelLinha from './PainelLinha';
import CriarOrdem from './CriarOrdem';
import PainelHistorico from './PainelHistorico';
import PainelLiberacao from './PainelLiberacao';
import ImportarProgramacao from './ImportarProgramacao';
import Login from './Login';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

const tabsGestor = [
  { id: 'gestor',    label: 'Painel do Gestor', icon: LayoutDashboard },
  { id: 'criar',     label: 'Nova Ordem',        icon: PlusCircle },
  { id: 'balanca1',  label: 'Balança 1',          icon: Scale },
  { id: 'balanca2',  label: 'Balança 2',          icon: Scale },
  { id: 'mistura',   label: 'Mistura',             icon: FlaskConical },
  { id: 'linha1',    label: 'Linha 1',             icon: Factory },
  { id: 'linha2',    label: 'Linha 2',             icon: Factory },
  { id: 'linha3',    label: 'Linha 3',             icon: Factory },
  { id: 'linha4',    label: 'Linha 4',             icon: Factory },
  { id: 'linha5',      label: 'Linha 5',      icon: Factory },
  { id: 'liberacao',   label: 'Liberação',    icon: ShieldCheck },
  { id: 'historico',   label: 'Histórico',    icon: History },
  { id: 'importar',  label: 'Importar',            icon: FileUp },
] as const;

type TabGestorId = (typeof tabsGestor)[number]['id'];

function resolveLinhaNumber(balanca: string | null): number | null {
  if (!balanca) return null;
  const match = balanca.match(/^linha(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

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

  if (perfil.papel === 'operador' && (perfil.balanca === '1' || perfil.balanca === '2')) {
    return (
      <OperadorLayout
        nome={perfil.nome}
        titulo={`Balança ${perfil.balanca}`}
        icon={<Scale className="h-4 w-4 shrink-0" />}
        onLogout={logout}
      >
        <PainelBalanca balanca={parseInt(perfil.balanca)} />
      </OperadorLayout>
    );
  }

  if (perfil.papel === 'operador' && perfil.balanca === 'mistura') {
    return (
      <OperadorLayout
        nome={perfil.nome}
        titulo="Mistura"
        icon={<FlaskConical className="h-4 w-4 shrink-0" />}
        onLogout={logout}
      >
        <PainelMistura />
      </OperadorLayout>
    );
  }

  const linhaNum = resolveLinhaNumber(perfil.balanca);
  if (perfil.papel === 'operador' && linhaNum !== null) {
    return (
      <OperadorLayout
        nome={perfil.nome}
        titulo={`Linha ${linhaNum}`}
        icon={<Factory className="h-4 w-4 shrink-0" />}
        onLogout={logout}
      >
        <PainelLinha linha={linhaNum} />
      </OperadorLayout>
    );
  }

  // Gestor — acesso completo
  const activeLabel = tabsGestor.find((t) => t.id === activeTab)?.label ?? '';

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="WeighMaster Pro">
                <Scale className="h-5 w-5 text-primary shrink-0" />
                <span className="font-bold truncate">WeighMaster Pro</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {tabsGestor.map((tab) => (
                  <SidebarMenuItem key={tab.id}>
                    <SidebarMenuButton
                      isActive={activeTab === tab.id}
                      tooltip={tab.label}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <tab.icon className="h-4 w-4 shrink-0" />
                      <span>{tab.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" onClick={logout}>
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex items-center gap-3 border-b bg-card px-4 h-12 sticky top-0 z-10">
          <SidebarTrigger />
          <span className="font-semibold text-sm">{activeLabel}</span>
        </header>
        <main className="p-6">
          {activeTab === 'gestor'    && <PainelGestor />}
          {activeTab === 'criar'     && <CriarOrdem />}
          {activeTab === 'balanca1'  && <PainelBalanca balanca={1} />}
          {activeTab === 'balanca2'  && <PainelBalanca balanca={2} />}
          {activeTab === 'mistura'   && <PainelMistura />}
          {activeTab === 'linha1'    && <PainelLinha linha={1} />}
          {activeTab === 'linha2'    && <PainelLinha linha={2} />}
          {activeTab === 'linha3'    && <PainelLinha linha={3} />}
          {activeTab === 'linha4'    && <PainelLinha linha={4} />}
          {activeTab === 'linha5'     && <PainelLinha linha={5} />}
          {activeTab === 'liberacao'  && <PainelLiberacao />}
          {activeTab === 'historico'  && <PainelHistorico />}
          {activeTab === 'importar'  && <ImportarProgramacao />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

interface OperadorLayoutProps {
  nome: string;
  titulo: string;
  icon: ReactNode;
  onLogout: () => void;
  children: ReactNode;
}

function OperadorLayout({ nome, titulo, icon, onLogout, children }: OperadorLayoutProps) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip={titulo}>
                {icon}
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="font-bold text-sm truncate">{titulo}</span>
                  <span className="text-xs text-muted-foreground truncate">{nome}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent />

        <SidebarFooter className="border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" onClick={onLogout}>
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex items-center gap-3 border-b bg-card px-4 h-12 sticky top-0 z-10">
          <SidebarTrigger />
          <span className="font-semibold text-sm">{titulo}</span>
          <span className="text-xs text-muted-foreground">— {nome}</span>
        </header>
        <main className="p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
