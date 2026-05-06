import { useState, useCallback, ReactNode } from 'react';
import { LayoutDashboard, Scale, PlusCircle, History, FileUp, LogOut, Loader2, FlaskConical, Factory, ShieldCheck, CalendarDays, BarChart2, ChevronDown, Package, Briefcase, ClipboardList } from 'lucide-react';
import PainelGestor from './PainelGestor';
import PainelBalanca from './PainelBalanca';
import PainelMistura from './PainelMistura';
import PainelLinha from './PainelLinha';
import CriarOrdem from './CriarOrdem';
import PainelHistorico from './PainelHistorico';
import PainelAnalises from './PainelAnalises';
import PainelLiberacao from './PainelLiberacao';
import ImportarProgramacao from './ImportarProgramacao';
import PainelProgramacao from './PainelProgramacao';
import PainelProgramacaoBalanca from './PainelProgramacaoBalanca';
import PainelConsultaFormula from './PainelConsultaFormula';
import PainelComercial from './PainelComercial';
import Login from './Login';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

type TabGestorId =
  | 'gestor' | 'programacao' | 'programacao_balanca' | 'criar' | 'historico' | 'importar'
  | 'balanca1' | 'balanca2'
  | 'mistura'
  | 'linha1' | 'linha2' | 'linha3' | 'linha4' | 'linha5'
  | 'liberacao'
  | 'analises'
  | 'consulta_formula'
  | 'comercial';

const gruposGestor = [
  {
    id: 'pesagem',
    label: 'Pesagem',
    icon: Scale,
    items: [
      { id: 'balanca1' as TabGestorId, label: 'Balança 1', icon: Scale },
      { id: 'balanca2' as TabGestorId, label: 'Balança 2', icon: Scale },
    ],
  },
  {
    id: 'mistura',
    label: 'Mistura',
    icon: FlaskConical,
    items: [
      { id: 'mistura' as TabGestorId, label: 'Mistura', icon: FlaskConical },
    ],
  },
  {
    id: 'linhas',
    label: 'Linhas',
    icon: Factory,
    items: [
      { id: 'linha1' as TabGestorId, label: 'Linha 1', icon: Factory },
      { id: 'linha2' as TabGestorId, label: 'Linha 2', icon: Factory },
      { id: 'linha3' as TabGestorId, label: 'Linha 3', icon: Factory },
      { id: 'linha4' as TabGestorId, label: 'Linha 4', icon: Factory },
      { id: 'linha5' as TabGestorId, label: 'Linha 5', icon: Factory },
    ],
  },
  {
    id: 'qualidade',
    label: 'Qualidade',
    icon: ShieldCheck,
    items: [
      { id: 'liberacao' as TabGestorId, label: 'Liberação', icon: ShieldCheck },
    ],
  },
  {
    id: 'analises',
    label: 'Análises',
    icon: BarChart2,
    items: [
      { id: 'analises' as TabGestorId, label: 'Análises da Produção', icon: BarChart2 },
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    icon: LayoutDashboard,
    items: [
      { id: 'gestor'      as TabGestorId, label: 'Painel do Gestor', icon: LayoutDashboard },
      { id: 'programacao'         as TabGestorId, label: 'Programação',           icon: CalendarDays },
      { id: 'programacao_balanca' as TabGestorId, label: 'Programação Balanças',  icon: CalendarDays },
      { id: 'criar'               as TabGestorId, label: 'Nova Ordem',            icon: PlusCircle },
      { id: 'historico'   as TabGestorId, label: 'Histórico',        icon: History },
      { id: 'consulta_formula' as TabGestorId, label: 'Consulta por Fórmula', icon: ClipboardList },
      { id: 'importar'    as TabGestorId, label: 'Importar',         icon: FileUp },
    ],
  },
] as const;

function resolveLinhaNumber(balanca: string | null): number | null {
  if (!balanca) return null;
  const match = balanca.match(/^linha(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

export default function Index() {
  const { perfil, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabGestorId>('gestor');
  const [prefillLote, setPrefillLote] = useState<number | undefined>(undefined);

  const goToTab = useCallback((tab: TabGestorId) => {
    setActiveTab(tab);
  }, []);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(gruposGestor.map((g) => g.id))
  );

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleCriarOP = (lote: number) => {
    setPrefillLote(lote);
    goToTab('criar');
  };

  const activeLabel =
    gruposGestor.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label ?? '';

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

  if (perfil.papel === 'comercial') {
    return (
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="Zan Collor Produção">
                  <Scale className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-bold truncate">Zan Collor Produção</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2">
                <Briefcase className="h-3 w-3 shrink-0" />
                Comercial
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="Painel Comercial" size="sm">
                      <Briefcase className="h-3.5 w-3.5 shrink-0" />
                      <span>Painel Comercial</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
        <SidebarInset className="overflow-x-hidden">
          <header className="flex items-center gap-3 border-b bg-card px-4 h-12 sticky top-0 z-10">
            <SidebarTrigger />
            <span className="font-semibold text-sm">Painel Comercial</span>
            <span className="text-xs text-muted-foreground">— {perfil.nome}</span>
          </header>
          <main className="p-6 overflow-x-hidden">
            <PainelComercial />
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const goHome = () => {
    goToTab('gestor');
    setOpenGroups(new Set());
  };

  // Gestor — acesso completo
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Zan Collor Produção" onClick={goHome}>
                <Scale className="h-5 w-5 text-primary shrink-0" />
                <span className="font-bold truncate">Zan Collor Produção</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2">
              <Package className="h-3 w-3 shrink-0" />
              Produção
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {gruposGestor.map((grupo: typeof gruposGestor[number]) => {
                const isOpen = openGroups.has(grupo.id);
                return (
                  <div key={grupo.id}>
                    <button
                      onClick={() => toggleGroup(grupo.id)}
                      className="group/grp flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    >
                      <span className="flex items-center gap-1.5 group-data-[collapsible=icon]:justify-center">
                        <grupo.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">{grupo.label}</span>
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden',
                          !isOpen && '-rotate-90'
                        )}
                      />
                    </button>
                    {isOpen && (
                      <SidebarMenu className="ml-2 border-l border-sidebar-border pl-1 mb-1">
                        {grupo.items.map((item) => (
                          <SidebarMenuItem key={item.id}>
                            <SidebarMenuButton
                              isActive={activeTab === item.id}
                              tooltip={item.label}
                              onClick={() => goToTab(item.id)}
                              size="sm"
                            >
                              <item.icon className="h-3.5 w-3.5 shrink-0" />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    )}
                  </div>
                );
              })}
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2">
              <Briefcase className="h-3 w-3 shrink-0" />
              Comercial
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeTab === 'comercial'}
                    tooltip="Painel Comercial"
                    onClick={() => goToTab('comercial')}
                    size="sm"
                  >
                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                    <span>Painel Comercial</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
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

      <SidebarInset className="overflow-x-hidden">
        <header className="flex items-center gap-3 border-b bg-card px-4 h-12 sticky top-0 z-10">
          <SidebarTrigger />
          <span className="font-semibold text-sm">{activeLabel}</span>
        </header>
        <main className="p-6 overflow-x-hidden">
          {activeTab === 'gestor'              && <PainelGestor onCriarOP={handleCriarOP} />}
          {activeTab === 'programacao'         && <PainelProgramacao />}
          {activeTab === 'programacao_balanca' && <PainelProgramacaoBalanca />}
          {activeTab === 'criar'               && <CriarOrdem prefillLote={prefillLote} onPrefillConsumed={() => setPrefillLote(undefined)} />}
          {activeTab === 'balanca1'            && <PainelBalanca balanca={1} />}
          {activeTab === 'balanca2'            && <PainelBalanca balanca={2} />}
          {activeTab === 'mistura'             && <PainelMistura />}
          {activeTab === 'linha1'              && <PainelLinha linha={1} />}
          {activeTab === 'linha2'              && <PainelLinha linha={2} />}
          {activeTab === 'linha3'              && <PainelLinha linha={3} />}
          {activeTab === 'linha4'              && <PainelLinha linha={4} />}
          {activeTab === 'linha5'              && <PainelLinha linha={5} />}
          {activeTab === 'liberacao'           && <PainelLiberacao />}
          {activeTab === 'historico'           && <PainelHistorico />}
          {activeTab === 'consulta_formula'    && <PainelConsultaFormula />}
          {activeTab === 'analises'            && <PainelAnalises />}
          {activeTab === 'importar'            && <ImportarProgramacao />}
          {activeTab === 'comercial'           && <PainelComercial />}
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
