import { Component, type ErrorInfo, useMemo, useEffect, useRef, useDeferredValue } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth, type AccessArea } from "@/modules/auth/hooks/useAuth";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useTasks } from "@/modules/tasks/api/useTasks";
import { SharedTasksProvider } from "@/contexts/SharedTasksContext";
import SyncIndicator from "@/components/SyncIndicator";
import { useTrackPresence } from "@/hooks/useUserPresence";
import AssistantReminder from "@/components/AssistantReminder";
import { useTaskStatusAlerts } from "@/hooks/useTaskStatusAlerts";
import MobileHeader from "@/components/MobileHeader";
import DataErrorCard from "@/components/ui/DataErrorCard";
import { useNotifications } from "@/hooks/useNotifications";
import {
  parseDateValue,
  isDeadlineSoon,
  normalizeTaskTitle,
} from "@/modules/tasks/utils";
import WelcomeTasksModal from "@/components/WelcomeTasksModal";


/** Map route paths to access areas */
const ROUTE_TO_AREA: Record<string, AccessArea> = {
  "/tarefas": "tarefas",
  "/analiticas": "analiticas",
  "/comodato": "comodato",
  "/integracoes": "integracoes",
  "/usuarios": "usuarios",
  "/calendario": "calendario",
  "/gamificacao": "gamificacao",
  "/ferramentas": "ferramentas",
  "/suporte": "suporte",
  "/admin/testes": "usuarios",
  "/admin/testes/roi": "usuarios",
  "/admin/testes/capacidade": "usuarios",
  "/admin/testes/saude-cliente": "usuarios",
  "/admin/testes/bonificacao": "bonificacao",
  "/admin/diagnostico": "diagnostico",
  "/admin/testes/clientes": "clientes",
  "/admin/testes/governanca-dados": "usuarios",
  "/admin/testes/cadastros": "usuarios",
  "/admin/testes/integracoes": "integracoes",
};

/** Lightweight task normalization for notification purposes only */
function toNotifTask(task: Record<string, any>) {
  const taskId = String(task.task_id ?? task.id ?? "");
  const title = normalizeTaskTitle(
    String(task.title ?? task.nome ?? task.name ?? "Tarefa")
  );
  const project = String(
    task.projects?.name ?? task.project_name ?? task.project ?? task.projeto ?? ""
  );
  const consultant = String(
    task.responsible_name ?? task.consultant ?? task.consultor ?? task.responsavel ?? task.responsible ?? ""
  );
  const statusRaw = String(task.status ?? task.situacao ?? "").toLowerCase();
  const deadline =
    parseDateValue(task.due_date) ??
    parseDateValue(task.dueDate) ??
    parseDateValue(task.deadline) ??
    parseDateValue(task.data) ??
    null;

  const isDone = ["5", "done", "concluido", "concluído", "completed", "finalizado"].includes(statusRaw);
  const isOverdue = !isDone && deadline !== null && deadline < new Date();
  const deadlineIsSoon = !isDone && !isOverdue && isDeadlineSoon(deadline, new Date());

  return {
    taskId,
    title,
    project,
    consultant,
    responsibleId: task.responsible_id ?? task.user_id ?? null,
    statusKey: isDone ? "done" : isOverdue ? "overdue" : "pending",
    deadlineDate: deadline,
    deadlineIsSoon,
  };
}

/** Normalize a string for flexible comparison */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const taskBelongsToSession = (
  task: Record<string, any>,
  sessionName?: string | null,
  sessionBitrixUserId?: string | null,
) => {
  const responsibleId = String(task.responsible_id ?? task.user_id ?? "").trim();
  const bitrixUserId = String(sessionBitrixUserId ?? "").trim();
  if (responsibleId && bitrixUserId && responsibleId === bitrixUserId) {
    return true;
  }

  const responsible = norm(
    String(task.responsible_name ?? task.consultant ?? task.owner ?? task.responsavel ?? "")
  );
  const me = norm(sessionName ?? "");
  return !!responsible && !!me && (responsible.includes(me) || me.includes(responsible));
};

// Sidebar width constants — must match sidebar.tsx
const SIDEBAR_WIDTH = "15.5rem";
const SIDEBAR_WIDTH_ICON = "3rem";

class RouteErrorBoundary extends Component<
  { resetKey: string; children: React.ReactNode },
  { hasError: boolean; errorMessage: string | null }
> {
  state = {
    hasError: false,
    errorMessage: null as string | null,
  };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || "Falha inesperada ao renderizar esta tela.",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[dashboard-route-error]", error, errorInfo);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[calc(100vh-3.5rem)] px-4 py-6 sm:px-5 md:px-8">
          <div className="mx-auto w-full max-w-[1900px]">
            <DataErrorCard
              title="Esta tela falhou ao abrir"
              message={`O conteúdo encontrou um erro de renderização e foi interrompido para evitar a tela preta. ${
                this.state.errorMessage ? `Detalhe: ${this.state.errorMessage}. ` : ""
              }Tente trocar de tela. Se continuar acontecendo, recarregue a página e faça login novamente.`}
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  LAYOUT ARCHITECTURE — MANTER ESTA ESTRUTURA PARA NOVAS TELAS     │
 * │                                                                     │
 * │  Desktop: CSS Grid com sidebar fixa + conteúdo scrollável           │
 * │  Mobile:  Grid 1-coluna + MobileHeader sticky + Sidebar Sheet       │
 * │                                                                     │
 * │  • Notification bell: único no MobileHeader (mobile) ou             │
 * │    AppSidebar (desktop). NUNCA duplicar.                            │
 * │  • Novas páginas devem usar <Outlet /> — NÃO criar layouts novos.  │
 * │  • Responsividade: usar Tailwind breakpoints (sm/md/lg) e          │
 * │    isMobile do useSidebar quando necessário.                        │
 * └─────────────────────────────────────────────────────────────────────┘
 */
function DashboardInner() {
  const { session, isAuthenticated, loadingSession, canAccess } = useAuth();
  const location = useLocation();
  const { state: sidebarState, isMobile } = useSidebar();
  const isAdmin =
    session?.role === "admin" ||
    session?.role === "gerente" ||
    session?.role === "coordenador";

  const companyName = session?.company?.trim();
  const accessibleProjectIds = session?.accessibleProjectIds;

  // Track presence for the logged-in user so admins can see who's online
  // We use email as the presence key since it's always available in the session
  useTrackPresence(
    session?.email,
    session?.name,
    session?.email,
  );

  const sharedTasksResult = useTasks({
    accessToken: session?.accessToken,
    period: "180d",
  });
  const { tasks, loading, reload } = sharedTasksResult;

  // Auto-refresh a cada minuto para refletir mudanças do sync sem depender de reload manual
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const id = setInterval(() => reloadRef.current(), 60_000);
    return () => clearInterval(id);
  }, []);

  // Defer notification processing so it doesn't block page paint during navigation
  const deferredTasks = useDeferredValue(tasks);

  const accessFilteredTasks = useMemo(() => {
    if (isAdmin) return deferredTasks;

    const hasExplicitIds = accessibleProjectIds && accessibleProjectIds.length > 0;
    const hasCompanyName = !!companyName;
    const myTasks = deferredTasks.filter((t) => {
      return taskBelongsToSession(t, session?.name, session?.bitrixUserId);
    });

    if (!hasExplicitIds && !hasCompanyName) return myTasks;

    const allowedIds = hasExplicitIds ? new Set(accessibleProjectIds!) : null;

    const filtered = deferredTasks.filter((t) => {
      const pid = Number(t.project_id);
      if (allowedIds && pid && allowedIds.has(pid)) return true;

      if (hasCompanyName && pid) {
        const projectName = norm(String(t.projects?.name ?? t.project_name ?? t.project ?? t.projeto ?? ""));
        const needle = norm(companyName!);
        if (projectName.includes(needle) && projectName !== needle) return true;
      }

      return false;
    });

    return filtered.length > 0 ? filtered : myTasks;
  }, [deferredTasks, isAdmin, accessibleProjectIds, companyName, session?.name]);

  // For non-admin users, further filter by consultant name so they only see their own tasks
  const userScopedTasks = useMemo(() => {
    if (isAdmin) return accessFilteredTasks;
    if (!session?.name && !session?.bitrixUserId) return accessFilteredTasks;
    return accessFilteredTasks.filter((t) => {
      return taskBelongsToSession(t, session?.name, session?.bitrixUserId);
    });
  }, [accessFilteredTasks, isAdmin, session?.name, session?.bitrixUserId]);

  const notifTasks = useMemo(
    () => userScopedTasks.map(toNotifTask),
    [userScopedTasks]
  );

  // Status change alerts via the Assistant widget
  const statusAlertData = useMemo(
    () =>
      notifTasks.map((t) => ({
        id: t.taskId || t.title || "",
        status: t.statusKey || "",
        title: t.title || "",
        project: t.project || "",
      })),
    [notifTasks]
  );
  const userId = session?.email || "";
  const { alert: statusAlert, dismissAlert } = useTaskStatusAlerts(statusAlertData, !loading, userId, session?.role);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(
    notifTasks,
    session?.name,
    session?.role,
    userId,
    session?.bitrixUserId,
  );


  if (loadingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(96,122,255,0.12),transparent_28%),linear-gradient(180deg,hsl(234_45%_8%),hsl(222_47%_5%))] px-4">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-5 text-center backdrop-blur-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-foreground">Restaurando sua sessão</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Estamos validando seu acesso para evitar telas vazias.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const requiredArea = ROUTE_TO_AREA[location.pathname];
  if (requiredArea && !canAccess(requiredArea)) {
    return <Navigate to="/" replace />;
  }

  const sidebarWidth = isMobile
    ? "0px"
    : sidebarState === "collapsed"
    ? SIDEBAR_WIDTH_ICON
    : SIDEBAR_WIDTH;


  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${sidebarWidth} 1fr`,
        minHeight: "100vh",
        transition: "grid-template-columns 200ms linear",
        background: "hsl(222 47% 5%)",
        alignItems: "stretch",
      }}
    >
      <SyncIndicator syncing={loading} />

      {/* Sidebar column (hidden on mobile — uses Sheet overlay instead) */}
      {!isMobile && (
        <div
          style={{
            background: "linear-gradient(180deg, hsl(234 50% 12%) 0%, hsl(260 45% 10%) 50%, hsl(234 45% 8%) 100%)",
            boxShadow: "4px 0 30px -4px rgba(0,0,0,0.7)",
            zIndex: 20,
            position: "relative",
            alignSelf: "stretch",
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              height: "100vh",
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarWidth: "none",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <AppSidebar
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
            />
          </div>
        </div>
      )}

      {/* Main content column */}
      <main style={{ minWidth: 0, overflowX: "hidden", gridColumn: isMobile ? "1 / -1" : undefined }}>
        {/* Mobile top bar with hamburger — notification bell lives HERE on mobile (single instance) */}
        <MobileHeader
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
        />

        {/* Mobile sidebar (Sheet overlay) — NO notification bell here to avoid duplication */}
        {isMobile && (
          <AppSidebar
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkAsRead={markAsRead}
            onMarkAllAsRead={markAllAsRead}
          />
        )}

        <SharedTasksProvider value={sharedTasksResult}>
          <RouteErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </SharedTasksProvider>
      </main>

      {/* Virtual Assistant Reminder */}
      <AssistantReminder notifTasks={notifTasks} statusAlert={statusAlert} onDismissAlert={dismissAlert} />

      {/* First-access welcome modal */}
      {session?.email && <WelcomeTasksModal userEmail={session.email} />}
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <DashboardInner />
    </SidebarProvider>
  );
}

