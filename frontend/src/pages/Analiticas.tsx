import { useMemo, useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { storage } from "@/modules/shared/storage";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useTasks } from "@/modules/tasks/api/useTasks";
import { useSharedTasks } from "@/contexts/SharedTasksContext";
import { useElapsedTimes } from "@/modules/tasks/api/useElapsedTimes";
import { useProjectHours } from "@/modules/tasks/api/useProjectHours";
import { useAnalyticsData } from "@/modules/analytics/hooks/useAnalyticsData";
import { classifyTask } from "@/modules/analytics/hooks/useAnalyticsData";
import PageSkeleton from "@/components/ui/PageSkeleton";
import AnalyticsPageHeader from "@/modules/analytics/components/AnalyticsPageHeader";
import DataErrorCard from "@/components/ui/DataErrorCard";
import AnalyticsKpiCards from "@/modules/analytics/components/AnalyticsKpiCards";
import AnalyticsProductivityPulse from "@/modules/analytics/components/AnalyticsProductivityPulse";
import AnalyticsVelocityChart from "@/modules/analytics/components/AnalyticsVelocityChart";
import AnalyticsProjectList from "@/modules/analytics/components/AnalyticsProjectList";
import AnalyticsFilters from "@/modules/analytics/components/AnalyticsFilters";
import AnalyticsPendingTasks from "@/modules/analytics/components/AnalyticsPendingTasks";
import AnalyticsProjectDrawer from "@/modules/analytics/components/AnalyticsProjectDrawer";
import type { AnalyticsFilterState } from "@/modules/analytics/components/AnalyticsFilters";
import type { ProjectAnalytics } from "@/modules/analytics/types";
import { usePageSEO } from "@/hooks/usePageSEO";
import { exportAnalyticsPDF } from "@/lib/exportPdf";
import ExportPDFModal, { type PDFExportSelection } from "@/modules/analytics/components/ExportPDFModal";

// Lazy-load contracted hours components so a DB error doesn't crash the whole page
const ContractedHoursModal = lazy(() =>
  import("@/modules/analytics/components/ContractedHoursModal").catch(() => ({
    default: () => null,
  }))
);

const PERIOD_DAYS: Record<AnalyticsFilterState["period"], number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  all: 365,
};

// Safe hook: always returns empty map if the feature is unavailable
function useSafeContractedHours() {
  const [data] = useState<Map<number, { contracted_hours: number; notes?: string | null }>>(new Map());
  const [tried, setTried] = useState(false);
  const [safeData, setSafeData] = useState<Map<number, { contracted_hours: number; notes?: string | null }>>(new Map());

  useEffect(() => {
    if (tried) return;
    setTried(true);

    // Dynamically import to avoid crashing the module
    import("@/modules/analytics/hooks/useContractedHours")
      .then(() => {
        // Module loaded OK — we'll render the real hook version below
      })
      .catch((err) => {
        console.warn("[Analiticas] useContractedHours unavailable:", err);
      });
  }, [tried]);

  const upsert = useCallback(async () => false, []);

  return { data: safeData, upsert };
}

export default function AnaliticasPage() {
  usePageSEO("/analiticas");
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const userName = session?.name;

  // Filters state — restored from localStorage (clear if different user)
  const FILTERS_KEY = "analiticas:filters";
  const IDENTITY_KEY = "analiticas:lastUser";
  const savedFilters = useMemo(() => {
    const lastUser = storage.get<string>(IDENTITY_KEY, "");
    const currentUser = session?.email || "";
    if (currentUser && lastUser && lastUser !== currentUser) {
      storage.remove(FILTERS_KEY);
      storage.set(IDENTITY_KEY, currentUser);
      return {} as Partial<AnalyticsFilterState>;
    }
    if (currentUser) storage.set(IDENTITY_KEY, currentUser);
    return storage.get<Partial<AnalyticsFilterState>>(FILTERS_KEY, {});
  }, [session?.email]);
  const [filters, setFilters] = useState<AnalyticsFilterState>({
    period: savedFilters.period || "180d",
    status: savedFilters.status || "all",
    projectIds: Array.isArray(savedFilters.projectIds) ? savedFilters.projectIds : [],
    consultant: savedFilters.consultant || "",
  });

  // Persist filters when they change
  useEffect(() => {
    storage.set(FILTERS_KEY, filters);
  }, [filters]);

  // Default filters for non-admin users: pre-select own consultant, allowed projects and period "all"
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!userName || !session?.role) return;
    const role = session.role;
    if (role === "admin" || role === "gerente" || role === "coordenador") return;

    const saved = storage.get<Partial<AnalyticsFilterState>>(FILTERS_KEY, {});
    const updates: Partial<AnalyticsFilterState> = {};

    // Non-admin should always start with own consultant selected
    if (saved.consultant !== userName) {
      updates.consultant = userName;
    }

    const allowedIds = (session.accessibleProjectIds ?? []).map(Number).filter((id) => Number.isFinite(id));
    const allowedSet = new Set<number>(allowedIds);
    const savedProjectIds = Array.isArray(saved.projectIds)
      ? saved.projectIds.map(Number).filter((id) => Number.isFinite(id))
      : [];

    if (allowedIds.length > 0) {
      const validSavedIds = savedProjectIds.filter((id) => allowedSet.has(id));
      if (validSavedIds.length === 0 || validSavedIds.length !== savedProjectIds.length) {
        updates.projectIds = validSavedIds.length > 0 ? validSavedIds : allowedIds;
      }
    } else if (savedProjectIds.length > 0) {
      updates.projectIds = [];
    }

    // Non-admin should open with "Tudo"
    if (saved.period !== "all") {
      updates.period = "all";
    }

    if (Object.keys(updates).length > 0) {
      setFilters((prev) => ({ ...prev, ...updates }));
    }
    defaultsAppliedRef.current = true;
  }, [userName, session?.role, session?.accessibleProjectIds]);

  const periodDays = PERIOD_DAYS[filters.period] ?? PERIOD_DAYS["all"];

  // Use shared 180d tasks from layout when period matches, otherwise fetch independently
  const effectivePeriod = filters.period === "all" ? "180d" : filters.period;
  const shared = useSharedTasks();
  const ownTasks = useTasks({ accessToken, period: effectivePeriod });
  const useShared = effectivePeriod === "180d" && shared;
  const { tasks: allTasks, loading: loadingTasks, error: errorTasks, reload: reloadTasks, lastUpdated, reloadCooldownMsLeft, reloadsRemainingThisMinute } = useShared ? shared : ownTasks;
  const { times, loading: loadingTimes, reload: reloadTimes, lastUpdated: lastUpdatedTimes } = useElapsedTimes({ accessToken, period: effectivePeriod });

  const refreshing = loadingTasks || loadingTimes;
  const combinedLastUpdated =
    lastUpdated && lastUpdatedTimes
      ? Math.min(lastUpdated, lastUpdatedTimes)
      : lastUpdated ?? lastUpdatedTimes ?? null;

  const formatLastUpdated = (timestamp: number | null) => {
    if (!timestamp) return "Nunca atualizado";
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return "Atualizado agora";
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `Atualizado há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `Atualizado há ${hours}h${rest ? ` ${rest} min` : ""}`;
  };

  // Auto-refresh every minute so analytics follow the latest task/time syncs
  useEffect(() => {
    const interval = setInterval(() => { reloadTasks(); reloadTimes(); }, 60_000);
    return () => clearInterval(interval);
  }, [reloadTasks, reloadTimes]);

  const { startIso, endIso } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - periodDays);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }, [periodDays]);

  const { data: projectHours, loading: loadingHours } = useProjectHours({ startIso, endIso });

  // Only block initial render on tasks+times, not hours (hours can load in background)
  const loading = loadingTasks || loadingTimes;
  const initialLoading = loading && allTasks.length === 0;

  const isAdmin = session?.role === "admin" || session?.role === "gerente" || session?.role === "coordenador";
  const accessibleProjectIds = session?.accessibleProjectIds;

  // Filter tasks by project access for non-admin users
  const companyName = session?.company?.trim()?.toLowerCase();
  const accessFilteredTasks = useMemo(() => {
    if (isAdmin) return allTasks;

    const hasExplicitIds = accessibleProjectIds && accessibleProjectIds.length > 0;
    const hasCompanyName = !!companyName;
    const normalizeLoose = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const myTasks = allTasks.filter((t) => {
      if (!userName) return false;
      const responsible = String(t.responsible_name ?? t.responsavel ?? t.consultant ?? t.owner ?? "");
      const me = normalizeLoose(userName);
      const owner = normalizeLoose(responsible);
      return owner && owner === me;
    });

    if (!hasExplicitIds && !hasCompanyName) return myTasks;

    // Use project IDs for exact matching (prevents substring false positives)
    const allowedIds = hasExplicitIds ? new Set(accessibleProjectIds!) : null;

    const filtered = allTasks.filter((t) => {
      const pid = Number(t.project_id);
      if (allowedIds && pid) {
        return allowedIds.has(pid);
      }

      // Fallback by company name ONLY when explicit project IDs are not available
      if (!hasExplicitIds && hasCompanyName && pid) {
        const projectName = normalizeLoose(String(t.projects?.name ?? t.project_name ?? t.project ?? t.projeto ?? ""));
        const needle = normalizeLoose(companyName!);
        if (projectName.includes(needle) && projectName !== needle) return true;
      }

      return false;
    });
    const visibleTasks = filtered.length > 0 ? filtered : myTasks;

    // Non-admin: show only projects where the logged user has linked tasks (faz parte)
    if (userName) {
      const me = normalizeLoose(userName);
      const myIds = new Set<number>();

      visibleTasks.forEach((t) => {
        const responsible = String(t.responsible_name ?? t.responsavel ?? t.consultant ?? t.owner ?? "")
          .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (responsible && responsible === me) {
          const pid = Number(t.project_id);
          if (pid) myIds.add(pid);
        }
      });

      if (myIds.size === 0) return visibleTasks;
      return visibleTasks.filter((t) => myIds.has(Number(t.project_id)));
    }

    return visibleTasks;
  }, [allTasks, isAdmin, accessibleProjectIds, companyName, userName]);

  const effectiveUser = isAdmin
    ? (filters.consultant || undefined)
    : userName;

  const {
    projects,
    toggleFavorite,
    userTasks,
  } = useAnalyticsData(accessFilteredTasks, projectHours, times, effectiveUser);

  // Extract unique consultant names for filter
  const consultants = useMemo(() => {
    if (isAdmin) {
      const set = new Set<string>();
      allTasks.forEach((t) => {
        const name = String(t.responsible_name ?? t.responsavel ?? t.consultant ?? "").trim();
        if (name) set.add(name);
      });
      return [...set].sort();
    }
    // Non-admin: only show own name
    return userName ? [userName] : [];
  }, [allTasks, isAdmin, userName]);

  // Build project_id → name lookup from tasks with join data (prevents phantom projects)
  const projectNameById = useMemo(() => {
    const map = new Map<number, string>();
    allTasks.forEach((t) => {
      const pid = Number(t.project_id);
      const joinName = t.projects && typeof t.projects === "object"
        ? String((t.projects as any).name ?? "").trim()
        : "";
      if (pid && joinName) map.set(pid, joinName);
    });
    return map;
  }, [allTasks]);

  // Extract unique project options for the filter dropdown
  const projectOptions = useMemo(() => {
    const map = new Map<number, string>();
    const source = isAdmin ? allTasks : accessFilteredTasks;
    source.forEach((t) => {
      const pid = Number(t.project_id);
      if (!pid) return;
      // Prioritize join name, then lookup map, then loose fields
      const joinName = t.projects && typeof t.projects === "object"
        ? String((t.projects as any).name ?? "").trim()
        : "";
      const name = joinName || projectNameById.get(pid) || String(t.project_name ?? t.project ?? t.projeto ?? `Projeto ${pid}`);
      if (!map.has(pid)) map.set(pid, name);
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const aHas = a.name.includes("<>");
        const bHas = b.name.includes("<>");
        if (aHas !== bHas) return aHas ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }, [allTasks, accessFilteredTasks, isAdmin, projectNameById]);

  // Apply status + project filter to user's tasks for display components
  const filteredTasks = useMemo(() => {
    let result = userTasks;
    if (filters.projectIds.length > 0) {
      const idSet = new Set(filters.projectIds);
      result = result.filter((t) => idSet.has(Number(t.project_id)));
    }
    if (filters.status !== "all") {
      result = result.filter((t) => classifyTask(t) === filters.status);
    }
    return result;
  }, [userTasks, filters.status, filters.projectIds]);

  // Period-aware hours
  // "Projetos que faço parte" = projects where the user is the RESPONSIBLE (has tasks assigned)
  // NOT just projects they have access to view
  const myProjectIds = useMemo(() => {
    const ids = new Set<number>();
    if (!userName) return ids;

    const me = userName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!me) return ids;

    // Search in the tasks the user can see for ones where THEY are the responsible
    const source = isAdmin ? allTasks : accessFilteredTasks;
    source.forEach((t) => {
      const responsible = String(t.responsible_name ?? t.responsavel ?? t.consultant ?? t.owner ?? "")
        .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (responsible && responsible === me) {
        const pid = Number(t.project_id);
        if (pid) ids.add(pid);
      }
    });
    return ids;
  }, [allTasks, accessFilteredTasks, isAdmin, userName]);

  // Apply non-admin defaults ONCE (on first load only)
  const nonAdminDefaultsApplied = useRef(false);
  useEffect(() => {
    if (nonAdminDefaultsApplied.current) return;
    if (isAdmin || !userName || myProjectIds.size === 0) return;

    nonAdminDefaultsApplied.current = true;
    const mine = Array.from(myProjectIds);
    setFilters((prev) => {
      // Only apply if no saved filters exist or consultant doesn't match
      const prevIds = prev.projectIds.map(Number).filter((id) => Number.isFinite(id));
      const validPrev = prevIds.filter((id) => myProjectIds.has(id));
      const nextIds = validPrev.length > 0 ? validPrev : mine;

      return {
        ...prev,
        consultant: userName,
        period: prev.period || "all",
        projectIds: nextIds,
      };
    });
  }, [isAdmin, myProjectIds, userName]);

  const [selectedProject, setSelectedProject] = useState<ProjectAnalytics | null>(null);
  const [drawerProject, setDrawerProject] = useState<ProjectAnalytics | null>(null);
  const [hoursModalProject, setHoursModalProject] = useState<ProjectAnalytics | null>(null);
  const [hoursModalClientProjects, setHoursModalClientProjects] = useState<ProjectAnalytics[] | undefined>(undefined);
  const [showExportModal, setShowExportModal] = useState(false);

  // Contracted hours — loaded dynamically to avoid crashing if table is missing
  const [contractedHoursData, setContractedHoursData] = useState<Map<number, { contracted_hours: number; notes?: string | null }>>(new Map());
  const [contractedHoursReady, setContractedHoursReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@/modules/analytics/hooks/useContractedHours")
      .then(() => {
        if (!cancelled) setContractedHoursReady(true);
      })
      .catch(() => {
        // Table not available — silently skip
      });
    return () => { cancelled = true; };
  }, []);

  const upsertContractedHours = useCallback(async (projectId: number, hours: number, updatedBy: string, notes: string): Promise<boolean> => {
    if (!contractedHoursReady) return false;
    try {
      const mod = await import("@/modules/analytics/hooks/useContractedHours");
      // We can't call hooks dynamically, so we'll use the supabase client directly
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await (supabase as any)
        .from("project_contracted_hours")
        .upsert({ project_id: projectId, contracted_hours: hours, updated_by: updatedBy, notes: notes ?? null }, { onConflict: "project_id" });
      if (error) throw error;
      // Refresh data
      const { data: rows } = await (supabase as any)
        .from("project_contracted_hours")
        .select("project_id, contracted_hours, notes, updated_by, updated_at");
      const map = new Map<number, { contracted_hours: number; notes?: string | null }>();
      (rows ?? []).forEach((r: any) => map.set(Number(r.project_id), r));
      setContractedHoursData(map);
      return true;
    } catch (err) {
      console.error("[Analiticas] upsertContractedHours failed:", err);
      return false;
    }
  }, [contractedHoursReady]);

  // Fetch contracted hours data once ready
  useEffect(() => {
    if (!contractedHoursReady) return;
    let cancelled = false;
    import("@/integrations/supabase/client").then(async ({ supabase }) => {
      try {
        const { data: rows, error } = await (supabase as any)
          .from("project_contracted_hours")
          .select("project_id, contracted_hours, notes, updated_by, updated_at");
        if (error) {
          console.warn("[Analiticas] contracted hours fetch error:", error.message);
          return;
        }
        if (cancelled) return;
        const map = new Map<number, { contracted_hours: number; notes?: string | null }>();
        (rows ?? []).forEach((r: any) => map.set(Number(r.project_id), r));
        setContractedHoursData(map);
      } catch (e) {
        console.warn("[Analiticas] contracted hours fetch failed:", e);
      }
    });
    return () => { cancelled = true; };
  }, [contractedHoursReady]);

  // Merge contracted hours into projects list
  const projectsWithContracted = useMemo(() => {
    return projects.map((p) => {
      const record = contractedHoursData.get(p.projectId);
      return record ? { ...p, hoursContracted: record.contracted_hours } : p;
    });
  }, [projects, contractedHoursData]);

  const displayedProjects = useMemo(() => {
    if (filters.projectIds.length === 0) return projectsWithContracted;
    const idSet = new Set(filters.projectIds);
    return projectsWithContracted.filter((project) => idSet.has(project.projectId));
  }, [projectsWithContracted, filters.projectIds]);

  const displayedProjectHours = useMemo(
    () => displayedProjects.reduce((sum, project) => sum + project.hoursUsed, 0),
    [displayedProjects],
  );

  const displayedActiveProjects = useMemo(
    () => displayedProjects.filter((project) => project.isActive).length,
    [displayedProjects],
  );

  const handleProjectClick = useCallback((project: ProjectAnalytics) => {
    setDrawerProject(project);
  }, []);

  const handleEditHours = useCallback((project: ProjectAnalytics) => {
    setHoursModalProject(project);
    setHoursModalClientProjects(undefined);
  }, []);

  const handleEditClientHours = useCallback((_clientName: string, projects: ProjectAnalytics[]) => {
    setHoursModalProject(projects[0]);
    setHoursModalClientProjects(projects);
  }, []);

  const handleSaveHours = useCallback(async (projectId: number, hours: number, notes: string): Promise<boolean> => {
    return upsertContractedHours(projectId, hours, session?.name ?? "admin", notes);
  }, [upsertContractedHours, session?.name]);

  const handleSaveAllClientHours = useCallback(async (projectIds: number[], hours: number, notes: string): Promise<boolean> => {
    const results = await Promise.all(
      projectIds.map((id) => upsertContractedHours(id, hours, session?.name ?? "admin", notes))
    );
    return results.every(Boolean);
  }, [upsertContractedHours, session?.name]);

  if (initialLoading) {
    return <PageSkeleton variant="analiticas" />;
  }

  if (errorTasks) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-8">
        <DataErrorCard
          message={errorTasks}
          onRetry={() => { reloadTasks(); reloadTimes(); }}
        />
      </div>
    );
  }

  return (
    <div className="page-gradient w-full">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-4 sm:p-5 md:p-8">
        {/* Header */}
        <AnalyticsPageHeader
          effectiveUser={effectiveUser}
          periodLabel={filters.period !== "180d" ? `Últimos ${periodDays} dias` : undefined}
          lastUpdatedText={formatLastUpdated(combinedLastUpdated)}
          refreshing={refreshing}
          onExportPdf={() => setShowExportModal(true)}
          onRefresh={() => { reloadTasks(); reloadTimes(); }}
          canExport={projects.length > 0}
          canRefresh={true}
          refreshDisabled={refreshing || reloadCooldownMsLeft > 0 || reloadsRemainingThisMinute <= 0}
          refreshTitle={
            reloadsRemainingThisMinute <= 0
              ? "Limite de 5 atualizações por minuto atingido"
              : reloadCooldownMsLeft > 0
              ? `Aguarde ${Math.ceil(reloadCooldownMsLeft / 1000)}s`
              : `Atualizar dados (${reloadsRemainingThisMinute} restantes)`
          }
          reloadsRemainingThisMinute={reloadsRemainingThisMinute}
          isCliente={session?.role === "cliente"}
        />

        {/* Search + Filters */}
        <AnalyticsFilters
          filters={filters}
          onChange={setFilters}
          projects={projectOptions}
          consultants={consultants}
          isAdmin={isAdmin}
          myProjectIds={myProjectIds}
          hideFilters={false}
        />

        {/* KPI Cards */}
        <AnalyticsKpiCards
          clients={displayedProjects.length}
          activeProjects={displayedActiveProjects}
          totalHours={displayedProjectHours}
          totalTasks={filteredTasks.length}
          doneCount={filteredTasks.filter((task) => classifyTask(task) === "done").length}
          overdueCount={filteredTasks.filter((task) => classifyTask(task) === "overdue").length}
          loading={loading}
        />

        {/* Row 1: Client Radar + Velocity Chart */}
        <div className="grid gap-5 lg:grid-cols-2">
          <AnalyticsProductivityPulse tasks={filteredTasks} classifyTask={classifyTask} />
          <AnalyticsVelocityChart tasks={filteredTasks} classifyTask={classifyTask} />
        </div>

        {/* Pending tasks list */}
        <AnalyticsPendingTasks
          tasks={filteredTasks}
          classifyTask={classifyTask}
        />

        {/* Projects list — grouped by client */}
        <AnalyticsProjectList
          projects={displayedProjects}
          onToggleFavorite={toggleFavorite}
          onProjectClick={handleProjectClick}
          onEditHours={isAdmin ? handleEditHours : undefined}
          onEditClientHours={isAdmin ? handleEditClientHours : undefined}
          selectedProject={selectedProject}
          myProjectIds={myProjectIds}
          isAdmin={isAdmin}
        />
      </div>

      {/* Project drill-down drawer */}
      <AnalyticsProjectDrawer
        project={drawerProject}
        tasks={accessFilteredTasks}
        classifyTask={classifyTask}
        onClose={() => setDrawerProject(null)}
      />

      {/* Admin: Contracted Hours Modal */}
      {isAdmin && hoursModalProject && (
        <Suspense fallback={null}>
          <ContractedHoursModal
            project={hoursModalProject}
            clientProjects={hoursModalClientProjects}
            currentHours={
              hoursModalClientProjects
                ? (contractedHoursData.get(hoursModalClientProjects[0]?.projectId)?.contracted_hours ?? 0)
                : (contractedHoursData.get(hoursModalProject.projectId)?.contracted_hours ?? 0)
            }
            onClose={() => { setHoursModalProject(null); setHoursModalClientProjects(undefined); }}
            onSave={handleSaveHours}
            onSaveAll={handleSaveAllClientHours}
          />
        </Suspense>
      )}

      {/* Modal de opções de exportação PDF */}
      {showExportModal && (
        <ExportPDFModal
          title="Exportar Relatório de Analíticas"
          onClose={() => setShowExportModal(false)}
          taskIntegrityData={projectsWithContracted.map((p) => ({
            title: p.projectName || "",
            project: p.projectName || "",
            consultant: "n/a",
            deadlineLabel: "n/a",
            durationLabel: p.hoursUsed > 0 ? `${Math.round(p.hoursUsed)}h` : "sem registro",
            statusKey: p.tasksOverdue > 0 ? "overdue" : p.tasksDone > 0 ? "done" : "pending",
          }))}
          onExport={async (_sel: PDFExportSelection, incompleteAction) => {
            let projectRows = projectsWithContracted.map((p) => ({
              name: p.projectName,
              totalTasks: p.tasksDone + p.tasksPending + p.tasksOverdue,
              doneTasks: p.tasksDone,
              overdueTasks: p.tasksOverdue,
              hours: p.hoursUsed,
              hoursContracted: p.hoursContracted,
            }));

            // Apply incomplete filter if user chose to exclude
            if (incompleteAction === "exclude") {
              projectRows = projectRows.filter((p) => p.name && p.name.trim() !== "");
            } else if (incompleteAction === "only-incomplete") {
              projectRows = projectRows.filter((p) => !p.name || p.name.trim() === "");
            }

            await exportAnalyticsPDF({
              userName: effectiveUser,
              period: `Últimos ${periodDays} dias`,
              generatedBy: userName || undefined,
              projects: projectRows,
              totals: {
                projects: projectRows.length,
                tasks: filteredTasks.length,
                done: filteredTasks.filter((task) => classifyTask(task) === "done").length,
                overdue: filteredTasks.filter((task) => classifyTask(task) === "overdue").length,
                hours: displayedProjectHours,
              },
            });
          }}
        />
      )}
    </div>
  );
}
