import { useEffect, useState, useCallback } from "react";
import {
  Home,
  FolderKanban,
  ListTodo,
  BarChart3,
  LogOut,
  ChevronDown,
  HelpCircle,
  PanelLeft,
  Shield,
  CalendarDays,
  Trophy,
  Wrench,
  Bug,
  Video,
  FlaskConical,
  Plug,
  TrendingUp,
  Users2,
  HeartPulse,
  DatabaseZap,
  Contact,
  BadgeDollarSign,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SUPABASE_URL as LOVABLE_URL, SUPABASE_ANON_KEY as LOVABLE_KEY } from "@/lib/supabase";

const SIDEBAR_FOCUS_RING =
  "outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(234_89%_64%/0.95)] focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_1px_hsl(222_47%_7%),0_0_0_3px_hsl(234_89%_64%/0.22)]";

const SIDEBAR_SECTION_TRIGGER =
  `group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-200 ${SIDEBAR_FOCUS_RING}`;

const SIDEBAR_SUBLINK =
  `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-white/50 transition-all duration-200 hover:bg-white/[0.06] hover:text-white ${SIDEBAR_FOCUS_RING}`;


/** Busca avatar_url do usuário no Lovable Cloud (banco principal) */
async function fetchAvatarFromCloud(accessToken: string, authUserId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${LOVABLE_URL}/rest/v1/users?auth_user_id=eq.${authUserId}&select=personal_photo&limit=1`,
      {
        headers: {
          apikey: LOVABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.personal_photo ?? null;
  } catch {
    return null;
  }
}

function UserAvatar({ name, email, collapsed, avatarUrl }: { name?: string; email?: string; collapsed?: boolean; avatarUrl?: string | null }) {
  const initials = (name || email || "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatar = avatarUrl ? (
    <img src={avatarUrl} alt="Avatar" className="h-full w-full rounded-full object-cover" />
  ) : (
    <span className="text-xs font-bold text-white">{initials}</span>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center py-1 cursor-pointer">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(234_89%_64%)] to-[hsl(280_70%_55%)] text-[10px] font-bold text-white shadow-lg shadow-[hsl(234_89%_50%/0.4)] overflow-hidden">
              {avatar}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{name || email || "Usuário"}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/[0.08] px-3 py-3 transition-all hover:bg-white/[0.1] cursor-pointer group">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(234_89%_64%)] to-[hsl(280_70%_55%)] text-xs font-bold text-white shadow-lg shadow-[hsl(234_89%_50%/0.4)] overflow-hidden">
        {avatar}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-white">
          {name || "Usuário"}
        </p>
        <p className="truncate text-[11px] text-white/50">{email || ""}</p>
      </div>
    </div>
  );
}

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  iconColor?: string;
}

function SidebarNavItem({ to, icon: Icon, label, end, iconColor }: NavItemProps) {
  const { state, isMobile } = useSidebar();
  const collapsed = isMobile ? false : state === "collapsed";

  const link = (
    <NavLink
      to={to}
      end={end}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-white/60 transition-all duration-200 hover:bg-white/[0.08] hover:text-white whitespace-nowrap ${SIDEBAR_FOCUS_RING} ${collapsed ? "justify-center !px-0" : ""}`}
      activeClassName="!bg-white/[0.15] !text-white shadow-lg shadow-[hsl(234_89%_50%/0.2)] !rounded-xl hover:!bg-white/[0.15] hover:!text-white"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" style={iconColor ? { color: iconColor } : undefined} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

function ToggleButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      onClick={toggleSidebar}
      className={`flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70 ${SIDEBAR_FOCUS_RING}`}
      type="button"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}

type SectionKey = "management" | "tools" | "administration" | "sprint";

export function AppSidebar({
}: {
}) {
  const { session, logout, canAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  // On mobile Sheet, always show expanded content
  const collapsed = isMobile ? false : state === "collapsed";
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    const loadAvatar = async () => {
      try {
        const userRes = await fetch(`${LOVABLE_URL}/auth/v1/user`, {
          headers: { apikey: LOVABLE_KEY, Authorization: `Bearer ${session.accessToken}` },
        });
        if (!userRes.ok || cancelled) return;
        const userData = await userRes.json();
        const userId = userData?.id;
        if (!userId || cancelled) return;
        const url = await fetchAvatarFromCloud(session.accessToken!, userId);
        if (!cancelled && url) setAvatarUrl(url);
      } catch { /* ignore */ }
    };
    loadAvatar();
    return () => { cancelled = true; };
  }, [session?.accessToken]);


  // Determine which section is active based on route
  const getActiveSection = (): SectionKey | null => {
    const p = location.pathname;
    if (["/tarefas", "/analiticas", "/gamificacao", "/calendario", "/admin/testes/clientes", "/admin/testes/bonificacao"].some((r) => p.startsWith(r))) return "management";
    if (["/ferramentas", "/comodato"].some((r) => p.startsWith(r))) return "tools";
    if (p.startsWith("/admin/testes")) return "sprint";
    if (["/usuarios", "/integracoes", "/admin"].some((r) => p.startsWith(r))) return "administration";
    return null;
  };

  const activeSection = getActiveSection();

  // Only one section open at a time — auto-collapse others
  const [openSection, setOpenSection] = useState<SectionKey | null>(activeSection);

  // Sync open section when route changes + close mobile sidebar on navigate
  useEffect(() => {
    const active = getActiveSection();
    if (active) setOpenSection(active);
    if (isMobile) setOpenMobile(false);
  }, [location.pathname]);

  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? null : key));
  }, []);

  const isManagementActive = activeSection === "management";
  const isToolsActive = activeSection === "tools";
  const isAdministrationActive = activeSection === "administration";
  const isSprintActive = activeSection === "sprint";
  const canAccessBonus = canAccess("bonificacao");
  const canAccessClientes = canAccess("clientes");
  const canAccessUsuarios = canAccess("usuarios");
  const canAccessIntegracoes = canAccess("integracoes");
  const canAccessDiagnostico = canAccess("diagnostico");
  const canAccessSprint = canAccess("sprint");
  const showManagementSection =
    canAccess("analiticas") ||
    canAccessBonus ||
    canAccess("calendario") ||
    canAccessClientes ||
    canAccess("gamificacao") ||
    canAccess("tarefas");
  const showToolsSection = canAccess("ferramentas") || canAccess("comodato");
  const showAdministrationSection = canAccessUsuarios || canAccessIntegracoes || canAccessDiagnostico;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Sidebar
      collapsible="icon"
      className="!border-r-0"
      style={{
        background: "transparent",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Logo + toggle
           On mobile Sheet: show only logo (toggle is unnecessary)
           On desktop: show logo + collapse toggle */}
      <div className={`flex ${collapsed ? "flex-col items-center gap-2 px-1 pt-4 pb-1" : "flex-row items-center justify-between px-4 pt-5 pb-1"}`}>
        {!collapsed && (
          <img
            src="/resouce/ISP-Consulte-v3-branco.png"
            alt="ISP Consulte"
            className="h-9 w-auto object-contain transition-all duration-500 hover:brightness-125 hover:drop-shadow-[0_0_8px_hsl(234_89%_64%/0.5)]"
          />
        )}
        {!isMobile && (
          <div className={`flex ${collapsed ? "flex-col" : "flex-row"} items-center gap-1`}>
            <ToggleButton />
          </div>
        )}
      </div>

      <SidebarContent className={`${collapsed ? "px-1" : "px-3"} pt-5 overflow-x-hidden flex-1`}>
        {/* PRINCIPAL */}
        <div className="mb-5">
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
              Principal
            </p>
          )}
          <nav className="flex flex-col gap-0.5">
            <SidebarNavItem to="/" icon={Home} label="Início" end iconColor="hsl(234 89% 74%)" />
          </nav>
        </div>

        {/* GESTÃO */}
        {showManagementSection && (
          <div className="mb-5">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                Gestão
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              {collapsed ? (
                <>
                  {canAccess("tarefas") && <SidebarNavItem to="/tarefas" icon={ListTodo} label="Tarefas" iconColor="hsl(38 92% 50%)" />}
                  {canAccess("analiticas") && <SidebarNavItem to="/analiticas" icon={BarChart3} label="Analíticas" iconColor="hsl(280 70% 55%)" />}
                  {canAccessClientes && <SidebarNavItem to="/admin/testes/clientes" icon={Contact} label="Página do Cliente" iconColor="hsl(200 75% 50%)" />}
                  {canAccess("calendario") && <SidebarNavItem to="/calendario" icon={CalendarDays} label="Calendário" iconColor="hsl(160 84% 39%)" />}
                  {canAccessBonus && <SidebarNavItem to="/admin/testes/bonificacao" icon={BadgeDollarSign} label="Bonificação" iconColor="hsl(45 90% 55%)" />}
                  {canAccess("gamificacao") && <SidebarNavItem to="/gamificacao" icon={Trophy} label="Ranking" iconColor="hsl(45 90% 55%)" />}
                </>
              ) : (
                <>
                  <button
                    onClick={() => toggleSection("management")}
                    type="button"
                    className={`${SIDEBAR_SECTION_TRIGGER} ${
                      isManagementActive
                        ? "bg-white/[0.15] text-white shadow-lg shadow-[hsl(234_89%_50%/0.2)]"
                        : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <FolderKanban className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ color: "hsl(234 89% 74%)" }} />
                    <span className="flex-1 text-left truncate">Gestão</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${openSection === "management" ? "rotate-0" : "-rotate-90"}`}
                    />
                  </button>

                  {(openSection === "management" || isManagementActive) && (
                    <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l-2 border-white/10 pl-3">
                      {canAccess("tarefas") && (
                        <NavLink to="/tarefas" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <ListTodo className="h-4 w-4" style={{ color: "hsl(38 92% 50%)" }} /><span>Tarefas</span>
                        </NavLink>
                      )}
                      {canAccess("analiticas") && (
                        <NavLink to="/analiticas" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <BarChart3 className="h-4 w-4" style={{ color: "hsl(280 70% 55%)" }} /><span>Analíticas</span>
                        </NavLink>
                      )}
                      {canAccessClientes && (
                        <NavLink to="/admin/testes/clientes" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Contact className="h-4 w-4" style={{ color: "hsl(200 75% 50%)" }} /><span>Página do Cliente</span>
                        </NavLink>
                      )}
                      {canAccess("calendario") && (
                        <NavLink to="/calendario" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <CalendarDays className="h-4 w-4" style={{ color: "hsl(160 84% 39%)" }} /><span>Calendário</span>
                        </NavLink>
                      )}
                      {canAccessBonus && (
                        <NavLink to="/admin/testes/bonificacao" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <BadgeDollarSign className="h-4 w-4" style={{ color: "hsl(45 90% 55%)" }} /><span>Bonificação</span>
                        </NavLink>
                      )}
                      {canAccess("gamificacao") && (
                        <NavLink to="/gamificacao" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Trophy className="h-4 w-4" style={{ color: "hsl(45 90% 55%)" }} /><span>Ranking</span>
                        </NavLink>
                      )}
                    </div>
                  )}
                </>
              )}
            </nav>
          </div>
        )}

        {/* FERRAMENTAS */}
        {showToolsSection && (
          <div className="mb-5">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                Ferramentas
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              {collapsed ? (
                <>
                  {canAccess("ferramentas") && <SidebarNavItem to="/ferramentas" icon={Wrench} label="Ferramentas" iconColor="hsl(200 90% 50%)" />}
                  {canAccess("comodato") && <SidebarNavItem to="/comodato" icon={Video} label="Comodato" iconColor="hsl(24 92% 58%)" />}
                </>
              ) : (
                <>
                  <button
                    onClick={() => toggleSection("tools")}
                    type="button"
                    className={`${SIDEBAR_SECTION_TRIGGER} ${
                      isToolsActive
                        ? "bg-white/[0.15] text-white shadow-lg shadow-[hsl(234_89%_50%/0.2)]"
                        : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <Wrench className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ color: "hsl(200 90% 50%)" }} />
                    <span className="flex-1 text-left truncate">Ferramentas</span>
                    <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${openSection === "tools" ? "rotate-0" : "-rotate-90"}`} />
                  </button>
                  {(openSection === "tools" || isToolsActive) && (
                    <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l-2 border-white/10 pl-3">
                      {canAccess("ferramentas") && (
                        <NavLink to="/ferramentas" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Wrench className="h-4 w-4" style={{ color: "hsl(200 90% 50%)" }} /><span>Ferramentas</span>
                        </NavLink>
                      )}
                      {canAccess("comodato") && (
                        <NavLink to="/comodato" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Video className="h-4 w-4" style={{ color: "hsl(24 92% 58%)" }} /><span>Comodato</span>
                        </NavLink>
                      )}
                    </div>
                  )}
                </>
              )}
            </nav>
          </div>
        )}

        {/* SPRINT 6.0 */}
        {canAccessSprint && (
          <div className="mb-5">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                Sprint 6.0
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              {collapsed ? (
                <>
                  <SidebarNavItem to="/admin/testes" icon={FlaskConical} label="Central Gerencial" iconColor="hsl(160 84% 39%)" end />
                  <SidebarNavItem to="/admin/testes/roi" icon={TrendingUp} label="Performance e ROI" iconColor="hsl(38 92% 50%)" />
                  <SidebarNavItem to="/admin/testes/capacidade" icon={Users2} label="Operação e Capacidade" iconColor="hsl(200 75% 50%)" />
                  <SidebarNavItem to="/admin/testes/saude-cliente" icon={HeartPulse} label="Saúde do Cliente" iconColor="hsl(0 72% 51%)" />
                  <SidebarNavItem to="/admin/testes/governanca-dados" icon={DatabaseZap} label="Governança de Dados" iconColor="hsl(160 84% 39%)" />
                </>
              ) : (
                <>
                  <button
                    onClick={() => toggleSection("sprint")}
                    type="button"
                    className={`${SIDEBAR_SECTION_TRIGGER} ${
                      isSprintActive
                        ? "bg-white/[0.15] text-white shadow-lg shadow-[hsl(234_89%_50%/0.2)]"
                        : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <FlaskConical className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ color: "hsl(160 84% 39%)" }} />
                    <span className="flex-1 text-left truncate">Sprint 6.0</span>
                    <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${openSection === "sprint" ? "rotate-0" : "-rotate-90"}`} />
                  </button>
                  {(openSection === "sprint" || isSprintActive) && (
                    <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l-2 border-white/10 pl-3">
                      <NavLink to="/admin/testes" end className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                        <FlaskConical className="h-4 w-4" style={{ color: "hsl(160 84% 39%)" }} /><span>Central Gerencial</span>
                      </NavLink>
                      <NavLink to="/admin/testes/roi" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                        <TrendingUp className="h-4 w-4" style={{ color: "hsl(38 92% 50%)" }} /><span>Performance e ROI</span>
                      </NavLink>
                      <NavLink to="/admin/testes/capacidade" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                        <Users2 className="h-4 w-4" style={{ color: "hsl(200 75% 50%)" }} /><span>Operação e Capacidade</span>
                      </NavLink>
                      <NavLink to="/admin/testes/saude-cliente" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                        <HeartPulse className="h-4 w-4" style={{ color: "hsl(0 72% 51%)" }} /><span>Saúde do Cliente</span>
                      </NavLink>
                      <NavLink to="/admin/testes/governanca-dados" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                        <DatabaseZap className="h-4 w-4" style={{ color: "hsl(160 84% 39%)" }} /><span>Governança de Dados</span>
                      </NavLink>
                    </div>
                  )}
                </>
              )}
            </nav>
          </div>
        )}

        {canAccess("suporte") && (
          <div>
            {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                Suporte
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              <SidebarNavItem to="/suporte" icon={HelpCircle} label="Ajuda" iconColor="hsl(200 50% 70%)" />
            </nav>
          </div>
        )}

        {/* ADMINISTRAÇÃO */}
        {showAdministrationSection && (
          <div className="mb-5">
            {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/25">
                Administração
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              {collapsed ? (
                <>
                  {canAccessUsuarios && <SidebarNavItem to="/usuarios" icon={Shield} label="Painel de Usuários" iconColor="hsl(0 84% 60%)" />}
                  {canAccessIntegracoes && <SidebarNavItem to="/integracoes" icon={Plug} label="Integrações" iconColor="hsl(160 84% 39%)" />}
                  {canAccessDiagnostico && <SidebarNavItem to="/admin/diagnostico" icon={Bug} label="Diagnóstico" iconColor="hsl(38 92% 50%)" />}
                </>
              ) : (
                <>
                  <button
                    onClick={() => toggleSection("administration")}
                    type="button"
                    className={`${SIDEBAR_SECTION_TRIGGER} ${
                      isAdministrationActive
                        ? "bg-white/[0.15] text-white shadow-lg shadow-[hsl(234_89%_50%/0.2)]"
                        : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <Shield className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ color: "hsl(0 84% 60%)" }} />
                    <span className="flex-1 text-left truncate">Administração</span>
                    <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${openSection === "administration" ? "rotate-0" : "-rotate-90"}`} />
                  </button>
                  {(openSection === "administration" || isAdministrationActive) && (
                    <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l-2 border-white/10 pl-3">
                      {canAccessUsuarios && (
                        <NavLink to="/usuarios" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Shield className="h-4 w-4" style={{ color: "hsl(0 84% 60%)" }} /><span>Painel de Usuários</span>
                        </NavLink>
                      )}
                      {canAccessIntegracoes && (
                        <NavLink to="/integracoes" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Plug className="h-4 w-4" style={{ color: "hsl(160 84% 39%)" }} /><span>Integrações</span>
                        </NavLink>
                      )}
                      {canAccessDiagnostico && (
                        <NavLink to="/admin/diagnostico" className={SIDEBAR_SUBLINK} activeClassName="!text-white !bg-white/[0.1] !rounded-xl">
                          <Bug className="h-4 w-4" style={{ color: "hsl(38 92% 50%)" }} /><span>Diagnóstico</span>
                        </NavLink>
                      )}
                    </div>
                  )}
                </>
              )}
            </nav>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className={`!border-t-0 flex-none ${collapsed ? "px-1" : "px-3"} pb-4 pt-2 space-y-2`}>
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <UserAvatar name={session?.name} email={session?.email} collapsed={collapsed} avatarUrl={avatarUrl} />
        {collapsed ? (
            <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={handleLogout} className={`flex w-full items-center justify-center rounded-xl py-2 transition-all duration-200 hover:bg-white/[0.06] ${SIDEBAR_FOCUS_RING}`} style={{ color: "hsl(0 0% 60%)" }} type="button">
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sair</TooltipContent>
          </Tooltip>
        ) : (
          <button onClick={handleLogout} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all duration-200 hover:bg-white/[0.06] ${SIDEBAR_FOCUS_RING}`} style={{ color: "hsl(0 0% 50%)" }} type="button">
            <LogOut className="h-[18px] w-[18px]" />
            Sair
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
