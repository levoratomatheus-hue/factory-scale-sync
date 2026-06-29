import { useState, useCallback, useMemo, useEffect, ReactNode, lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LayoutDashboard, Scale, PlusCircle, History, FileUp, LogOut, Loader2, FlaskConical, Factory, ShieldCheck, CalendarDays, BarChart2, ChevronDown, Package, Briefcase, ClipboardList, Wrench, Settings, Home, Hammer, Sun, Moon } from 'lucide-react';
import Login from './Login';

const PainelGestor            = lazy(() => import('./PainelGestor'));
const PainelBalanca           = lazy(() => import('./PainelBalanca'));
const PainelMistura           = lazy(() => import('./PainelMistura'));
const PainelLinha             = lazy(() => import('./PainelLinha'));
const CriarOrdem              = lazy(() => import('./CriarOrdem'));
const PainelHistorico         = lazy(() => import('./PainelHistorico'));
const PainelAnalises          = lazy(() => import('./PainelAnalises'));
const PainelLiberacao         = lazy(() => import('./PainelLiberacao'));
const ImportarProgramacao     = lazy(() => import('./ImportarProgramacao'));
const PainelProgramacao       = lazy(() => import('./PainelProgramacao'));
const PainelProgramacaoBalanca = lazy(() => import('./PainelProgramacaoBalanca'));
const PainelConsultaFormula   = lazy(() => import('./PainelConsultaFormula'));
const PainelComercial         = lazy(() => import('./PainelComercial'));
const CadastroEquipamentos    = lazy(() => import('./CadastroEquipamentos'));
const EstoqueManutencao       = lazy(() => import('./EstoqueManutencao'));
const AbrirOS                 = lazy(() => import('./AbrirOS'));
const PainelManutencao        = lazy(() => import('./PainelManutencao'));
const PainelAnaliseManutencao   = lazy(() => import('./PainelAnaliseManutencao'));
const FerramentasManutencao     = lazy(() => import('./FerramentasManutencao'));
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import PaginaInicial from './PaginaInicial';
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
  | 'comercial'
  | 'painel_manutencao' | 'cadastro_equipamentos' | 'abrir_os' | 'analise_manutencao' | 'estoque_manutencao' | 'ferramentas_manutencao';

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

const manutencaoItems = [
  { id: 'painel_manutencao'       as TabGestorId, label: 'Painel de Manutenção',    icon: Wrench    },
  { id: 'analise_manutencao'      as TabGestorId, label: 'Análise de Manutenção',   icon: BarChart2 },
  { id: 'cadastro_equipamentos'   as TabGestorId, label: 'Equipamentos',            icon: Settings  },
  { id: 'abrir_os'                as TabGestorId, label: 'Abrir OS',                icon: PlusCircle },
  { id: 'estoque_manutencao'      as TabGestorId, label: 'Estoque',                 icon: Package   },
  { id: 'ferramentas_manutencao'  as TabGestorId, label: 'Ferramentas',             icon: Hammer    },
] as const;

function resolveLinhaNumber(balanca: string | null): number | null {
  if (!balanca) return null;
  const match = balanca.match(/^linha(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

const avatarColor: Record<string, string> = {
  gestor:    '#2563eb',
  operador:  '#16a34a',
  tecnico:   '#ea580c',
  comercial: '#7c3aed',
};
const papelLabel: Record<string, string> = {
  gestor:    'Gestor',
  operador:  'Operador',
  tecnico:   'Técnico',
  comercial: 'Comercial',
};

// Abas que ficam no DOM após a primeira visita (keep-alive).
// Formulários/one-shot ficam de fora e sempre remontam.
const KEEP_ALIVE_TABS = new Set<TabGestorId>([
  'gestor', 'programacao', 'programacao_balanca', 'historico', 'liberacao',
  'analises', 'consulta_formula', 'comercial',
  'balanca1', 'balanca2', 'mistura',
  'linha1', 'linha2', 'linha3', 'linha4', 'linha5',
  'painel_manutencao', 'analise_manutencao', 'cadastro_equipamentos',
  'estoque_manutencao', 'ferramentas_manutencao',
]);

// Mantém o componente montado no DOM mas invisível quando a aba não está ativa.
function KeepAlive({ active, children }: { active: boolean; children: ReactNode }) {
  return <div style={{ display: active ? '' : 'none' }}>{children}</div>;
}

const TAB_LOADING = (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

function UserProfile({ nome, papel, email }: { nome: string; papel: string; email: string | null }) {
  const inicial = nome?.trim()[0]?.toUpperCase() ?? '?';
  const bg = avatarColor[papel] ?? '#6b7280';
  return (
    <div className="flex items-center gap-3 px-3 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <div
        className="shrink-0 flex items-center justify-center rounded-full text-white font-bold text-sm"
        style={{ width: 32, height: 32, background: bg, fontFamily: 'Bebas Neue, sans-serif', fontSize: '1rem', letterSpacing: '0.05em' }}
      >
        {inicial}
      </div>
      <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
        <span className="text-sm font-bold text-foreground truncate leading-tight">{nome}</span>
        <span
          className="mt-0.5 self-start truncate rounded-full px-1.5 py-px text-[10px] font-semibold leading-none uppercase tracking-wide"
          style={{ background: `${bg}22`, color: bg }}
        >
          {papelLabel[papel] ?? papel}
        </span>
        {email && <span className="mt-0.5 text-[11px] text-muted-foreground truncate leading-tight">{email}</span>}
      </div>
    </div>
  );
}

export default function Index() {
  const { perfil, email, loading, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabGestorId | null>(null);
  const [prefillLote, setPrefillLote] = useState<number | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => {
      import('./PainelLinha');
      import('./PainelBalanca');
      import('./PainelProgramacao');
      import('./PainelLiberacao');
      import('./PainelHistorico');
    }, 200);
    return () => clearTimeout(t);
  }, []);

  const goToTab = useCallback((tab: TabGestorId | null) => {
    setActiveTab(tab);
  }, []);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set<string>()
  );

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleCriarOP = useCallback((lote: number) => {
    setPrefillLote(lote);
    goToTab('criar');
  }, [goToTab]);

  const activeLabel = useMemo(() => activeTab === null
    ? ''
    : ([...gruposGestor.flatMap((g) => g.items), ...manutencaoItems, { id: 'comercial' as TabGestorId, label: 'Painel Comercial' }]
        .find((i) => i.id === activeTab)?.label ?? ''),
  [activeTab]);

  // Acumula as abas visitadas — deve ficar antes dos early returns
  const [mountedTabs, setMountedTabs] = useState<Set<TabGestorId>>(
    () => activeTab && KEEP_ALIVE_TABS.has(activeTab) ? new Set([activeTab]) : new Set(),
  );
  useEffect(() => {
    if (activeTab && KEEP_ALIVE_TABS.has(activeTab)) {
      setMountedTabs((prev) => prev.has(activeTab) ? prev : new Set([...prev, activeTab]));
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!perfil) return <Login />;

  const goHome = () => {
    goToTab(null);
    setOpenGroups(new Set());
  };

  if (perfil.papel === 'operador' && (perfil.balanca === '1' || perfil.balanca === '2')) {
    return (
      <OperadorLayout
        nome={perfil.nome}
        titulo={`Balança ${perfil.balanca}`}
        icon={<Scale className="h-4 w-4 shrink-0" />}
        onLogout={logout}
      >
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <PainelBalanca balanca={parseInt(perfil.balanca)} />
          </Suspense>
        </ErrorBoundary>
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
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <PainelMistura />
          </Suspense>
        </ErrorBoundary>
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
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <PainelLinha linha={linhaNum} />
          </Suspense>
        </ErrorBoundary>
      </OperadorLayout>
    );
  }

  if (perfil.papel === 'tecnico') {
    return (
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" tooltip="Manutenção">
                  <Wrench className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="font-bold text-sm truncate">Manutenção</span>
                    <span className="text-xs text-muted-foreground truncate">{perfil.nome}</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'painel_manutencao'}
                      tooltip="Painel de Manutenção"
                      onClick={() => goToTab('painel_manutencao')}
                      size="sm"
                    >
                      <Wrench className="h-3.5 w-3.5 shrink-0" />
                      <span>Painel de Manutenção</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'abrir_os'}
                      tooltip="Abrir OS"
                      onClick={() => goToTab('abrir_os')}
                      size="sm"
                    >
                      <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Abrir OS</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeTab === 'ferramentas_manutencao'}
                      tooltip="Ferramentas"
                      onClick={() => goToTab('ferramentas_manutencao')}
                      size="sm"
                    >
                      <Hammer className="h-3.5 w-3.5 shrink-0" />
                      <span>Ferramentas</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t">
            <UserProfile nome={perfil.nome} papel={perfil.papel} email={email} />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                  <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
            <span className="font-semibold text-sm">
              {activeTab === 'abrir_os' ? 'Abrir OS' : activeTab === 'ferramentas_manutencao' ? 'Ferramentas' : 'Painel de Manutenção'}
            </span>
            <span className="text-xs text-muted-foreground">— {perfil.nome}</span>
          </header>
          <main className="p-6 overflow-x-hidden">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
                {activeTab === 'abrir_os'
                  ? <AbrirOS perfilNome={perfil.nome} onSuccess={() => goToTab('painel_manutencao')} />
                  : activeTab === 'ferramentas_manutencao'
                  ? <FerramentasManutencao papel={perfil.papel} />
                  : <PainelManutencao papel={perfil.papel} perfilId={perfil.id} perfilNome={perfil.nome} />}
              </Suspense>
            </ErrorBoundary>
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (perfil.papel === 'comercial') {
    return (
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b">
            <div className="flex items-center">
              <button onClick={goHome} className="flex-1 min-w-0 text-left px-3 py-2 hover:opacity-70 transition-opacity group-data-[collapsible=icon]:hidden">
                <div className="flex items-center gap-1.5">
                  <Factory className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-bold tracking-wide text-gray-800 dark:text-gray-200">
                    Gestão Industrial
                  </span>
                </div>
              </button>
              <button onClick={goHome} title="Início" className="shrink-0 mr-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors group-data-[collapsible=icon]:mx-auto">
                <Home className="h-4 w-4" />
              </button>
            </div>
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
            <UserProfile nome={perfil.nome} papel={perfil.papel} email={email} />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={toggleTheme}>
                  {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                  <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
                <PainelComercial />
              </Suspense>
            </ErrorBoundary>
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Gestor — acesso completo
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b">
          <div className="flex items-center">
            <button onClick={goHome} className="flex-1 min-w-0 text-left px-3 py-2 hover:opacity-70 transition-opacity group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-1.5">
                <Factory className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-bold tracking-wide text-gray-800 dark:text-gray-200">
                  Gestão Industrial
                </span>
              </div>
            </button>
            <button onClick={goHome} title="Início" className="shrink-0 mr-2 p-1.5 rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <Home className="h-4 w-4" />
            </button>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <button
              onClick={() => toggleGroup('producao')}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex items-center gap-1.5">
                <Package className="h-3 w-3 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Produção</span>
              </span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden', !openGroups.has('producao') && '-rotate-90')} />
            </button>
            {openGroups.has('producao') && (
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
            )}
          </SidebarGroup>

          <SidebarGroup>
            <button
              onClick={() => toggleGroup('manutencao')}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex items-center gap-1.5">
                <Wrench className="h-3 w-3 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Manutenção</span>
              </span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden', !openGroups.has('manutencao') && '-rotate-90')} />
            </button>
            {openGroups.has('manutencao') && (
            <SidebarGroupContent>
              <SidebarMenu>
                {manutencaoItems.map((item) => (
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
            </SidebarGroupContent>
            )}
          </SidebarGroup>

          <SidebarGroup>
            <button
              onClick={() => toggleGroup('comercial')}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-bold tracking-widest uppercase text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group-data-[collapsible=icon]:justify-center"
            >
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden">Comercial</span>
              </span>
              <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden', !openGroups.has('comercial') && '-rotate-90')} />
            </button>
            {openGroups.has('comercial') && (
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
            )}
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t">
          <UserProfile nome={perfil.nome} papel={perfil.papel} email={email} />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sair" onClick={logout}>
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Sair</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="overflow-x-hidden flex flex-col">
        {activeTab !== null && (
          <header className="flex items-center gap-3 border-b bg-card px-4 h-12 sticky top-0 z-10 shrink-0">
            <SidebarTrigger />
            {activeLabel && <span className="font-semibold text-sm">{activeLabel}</span>}
          </header>
        )}
        {activeTab === null ? (
          <PaginaInicial embedded />
        ) : (
          <main className="p-6 overflow-x-hidden">
            <ErrorBoundary>
              {/* ── Formulários/one-shot: sempre remontam ao abrir ── */}
              {activeTab === 'criar' && (
                <Suspense fallback={TAB_LOADING}>
                  <CriarOrdem prefillLote={prefillLote} onPrefillConsumed={() => setPrefillLote(undefined)} />
                </Suspense>
              )}
              {activeTab === 'importar' && (
                <Suspense fallback={TAB_LOADING}><ImportarProgramacao /></Suspense>
              )}
              {activeTab === 'abrir_os' && (
                <Suspense fallback={TAB_LOADING}>
                  <AbrirOS perfilNome={perfil.nome} onSuccess={() => goToTab('painel_manutencao')} />
                </Suspense>
              )}

              {/* ── Keep-alive: monta na 1ª visita, permanece no DOM depois ── */}
              {mountedTabs.has('gestor') && (
                <KeepAlive active={activeTab === 'gestor'}>
                  <Suspense fallback={TAB_LOADING}><PainelGestor onCriarOP={handleCriarOP} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('programacao') && (
                <KeepAlive active={activeTab === 'programacao'}>
                  <Suspense fallback={TAB_LOADING}><PainelProgramacao /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('programacao_balanca') && (
                <KeepAlive active={activeTab === 'programacao_balanca'}>
                  <Suspense fallback={TAB_LOADING}><PainelProgramacaoBalanca /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('balanca1') && (
                <KeepAlive active={activeTab === 'balanca1'}>
                  <Suspense fallback={TAB_LOADING}><PainelBalanca balanca={1} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('balanca2') && (
                <KeepAlive active={activeTab === 'balanca2'}>
                  <Suspense fallback={TAB_LOADING}><PainelBalanca balanca={2} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('mistura') && (
                <KeepAlive active={activeTab === 'mistura'}>
                  <Suspense fallback={TAB_LOADING}><PainelMistura /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('linha1') && (
                <KeepAlive active={activeTab === 'linha1'}>
                  <Suspense fallback={TAB_LOADING}><PainelLinha linha={1} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('linha2') && (
                <KeepAlive active={activeTab === 'linha2'}>
                  <Suspense fallback={TAB_LOADING}><PainelLinha linha={2} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('linha3') && (
                <KeepAlive active={activeTab === 'linha3'}>
                  <Suspense fallback={TAB_LOADING}><PainelLinha linha={3} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('linha4') && (
                <KeepAlive active={activeTab === 'linha4'}>
                  <Suspense fallback={TAB_LOADING}><PainelLinha linha={4} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('linha5') && (
                <KeepAlive active={activeTab === 'linha5'}>
                  <Suspense fallback={TAB_LOADING}><PainelLinha linha={5} /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('liberacao') && (
                <KeepAlive active={activeTab === 'liberacao'}>
                  <Suspense fallback={TAB_LOADING}><PainelLiberacao /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('historico') && (
                <KeepAlive active={activeTab === 'historico'}>
                  <Suspense fallback={TAB_LOADING}><PainelHistorico /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('consulta_formula') && (
                <KeepAlive active={activeTab === 'consulta_formula'}>
                  <Suspense fallback={TAB_LOADING}><PainelConsultaFormula /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('analises') && (
                <KeepAlive active={activeTab === 'analises'}>
                  <Suspense fallback={TAB_LOADING}><PainelAnalises /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('comercial') && (
                <KeepAlive active={activeTab === 'comercial'}>
                  <Suspense fallback={TAB_LOADING}><PainelComercial /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('painel_manutencao') && (
                <KeepAlive active={activeTab === 'painel_manutencao'}>
                  <Suspense fallback={TAB_LOADING}>
                    <PainelManutencao papel={perfil.papel} perfilId={perfil.id} perfilNome={perfil.nome} />
                  </Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('analise_manutencao') && (
                <KeepAlive active={activeTab === 'analise_manutencao'}>
                  <Suspense fallback={TAB_LOADING}><PainelAnaliseManutencao /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('cadastro_equipamentos') && (
                <KeepAlive active={activeTab === 'cadastro_equipamentos'}>
                  <Suspense fallback={TAB_LOADING}><CadastroEquipamentos /></Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('estoque_manutencao') && (
                <KeepAlive active={activeTab === 'estoque_manutencao'}>
                  <Suspense fallback={TAB_LOADING}>
                    <EstoqueManutencao papel={perfil.papel} perfilNome={perfil.nome} />
                  </Suspense>
                </KeepAlive>
              )}
              {mountedTabs.has('ferramentas_manutencao') && (
                <KeepAlive active={activeTab === 'ferramentas_manutencao'}>
                  <Suspense fallback={TAB_LOADING}>
                    <FerramentasManutencao papel={perfil.papel} />
                  </Suspense>
                </KeepAlive>
              )}
            </ErrorBoundary>
          </main>
        )}
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
