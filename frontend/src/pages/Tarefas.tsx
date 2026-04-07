import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeaderCard from "@/components/PageHeaderCard";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "@/modules/shared/storage";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { usePageSEO } from "@/hooks/usePageSEO";
import PageSkeleton from "@/components/ui/PageSkeleton";
import DataErrorCard from "@/components/ui/DataErrorCard";
import EmptyState from "@/components/ui/EmptyState";

import { ProjectPerformanceGauge } from "@/modules/tasks/ui/TaskCharts";
import { TaskFilters } from "@/modules/tasks/ui/TaskFilters";
import { TaskListTable } from "@/modules/tasks/ui/TaskListTable";
import { TaskCharts } from "@/modules/tasks/ui/TaskCharts";
import { useElapsedTimes } from "@/modules/tasks/api/useElapsedTimes";
import { useTasks } from "@/modules/tasks/api/useTasks";
import { type TaskRecord, type TaskView } from "@/modules/tasks/types";
import {
  RefreshCw,
  Clock,
  AlertTriangle,
  Layers,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  FolderKanban,
  Timer,
  CheckCircle2,
  Hourglass,
  TrendingUp,
  BarChart3,
  ChevronDown,
  FileDown,
  Info,
} from "lucide-react";
import {
  deadlineColor,
  formatDatePtBR,
  formatDurationHHMM,
  formatHoursHuman,
  formatSecondsHuman,
  isDeadlineSoon,
  parseDateValue,
  collectTaskRelevantDates,
  normalizeTaskTitle,
  type TaskStatusKey,
} from "@/modules/tasks/utils";
import { STATUS_LABELS } from "@/modules/tasks/types";
import { exportTasksPDF } from "@/lib/exportPdf";
import ExportPDFModal, { type PDFExportSelection, type TaskIntegrityInfo } from "@/modules/analytics/components/ExportPDFModal";
import { FormattedDescription } from "@/modules/tasks/ui/FormattedDescription";

/* ─── Helpers (business logic preserved) ─── */

const isCompletedStatus = (value?: string) => {
  const n = (value ?? "").toLowerCase();
  return ["done", "concluido", "concluído", "completed", "finalizado"].includes(n);
};

const mapStatusKey = (statusRaw: string | number | undefined, deadline: Date | null): TaskStatusKey => {
  if (statusRaw === undefined || statusRaw === null) return "unknown";
  const asNumber = typeof statusRaw === "number" ? statusRaw : Number(statusRaw);
  if (!Number.isNaN(asNumber)) {
    if (asNumber === 5) return "done";
    if (deadline && deadline < new Date()) return "overdue";
    if ([2, 3, 4, 6].includes(asNumber)) return "pending";
  }
  const asString = String(statusRaw).toLowerCase();
  if (isCompletedStatus(asString)) return "done";
  if (deadline && deadline < new Date()) return "overdue";
  if (["em andamento", "in progress", "pendente", "pending"].includes(asString)) return "pending";
  return "unknown";
};

const getNumeric = (task: TaskRecord, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = task[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
};

const pickField = (task: TaskRecord, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    if (task[key]) return String(task[key]);
  }
  return fallback;
};

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

const normalizeComparableText = (value?: string | null) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const taskBelongsToSession = (
  consultantName: string | null | undefined,
  responsibleId: string | number | null | undefined,
  sessionName?: string | null,
  sessionBitrixUserId?: string | null,
) => {
  const consultant = normalizeComparableText(consultantName);
  const me = normalizeComparableText(sessionName);
  const taskResponsibleId = String(responsibleId ?? "").trim();
  const userBitrixId = String(sessionBitrixUserId ?? "").trim();

  if (taskResponsibleId && userBitrixId && taskResponsibleId === userBitrixId) {
    return true;
  }

  return !!consultant && !!me && (consultant.includes(me) || me.includes(consultant));
};

const normalizeTask = (task: TaskRecord, durationSeconds?: number, projectNameById?: Map<string, string>): TaskView => {
  const title = normalizeTaskTitle(pickField(task, ["title", "nome", "name"], "Tarefa sem título"));
  const projectId = pickField(task, ["project_id", "projectId"], "").trim();
  const projectFromJoin =
    task.projects && typeof task.projects === "object"
      ? pickField(task.projects as TaskRecord, ["name"], "")
      : "";
  // 1. Use join name (most accurate)
  // 2. Use lookup map (resolves via other tasks with same project_id)
  // 3. Fallback to loose fields
  const projectFromMap = projectId && projectNameById ? (projectNameById.get(projectId) ?? "") : "";
  const project =
    projectFromJoin ||
    projectFromMap ||
    pickField(task, ["project", "projeto", "project_name", "group_name", "group"], "") ||
    (projectId ? `Projeto #${projectId}` : "Projeto indefinido");
  const consultant = pickField(task, ["responsible_name", "consultant", "owner", "responsavel"], "Sem consultor");
  const description = pickField(task, ["description", "descricao"], "Sem descrição");
  const statusRaw = pickField(task, ["status", "situacao", "estado"], "").toLowerCase();
  const deadline =
    parseDateValue(task["due_date"]) ||
    parseDateValue(task["dueDate"]) ||
    parseDateValue(task["deadline"]) ||
    parseDateValue(task["data"]);
  const statusKey = mapStatusKey(statusRaw, deadline);
  const isDone = statusKey === "done";
  const isOverdue = statusKey === "overdue" || (!isDone && deadline !== null && deadline < new Date());
  const deadlineIsSoon = !isDone && !isOverdue && isDeadlineSoon(deadline, new Date());
  const durationFromTask = getNumeric(task, ["duration_minutes", "duration", "tempo_total", "minutes"]);
  const seconds = durationSeconds ?? (durationFromTask ? durationFromTask * 60 : undefined);

  return {
    title,
    description,
    project,
    consultant,
    statusKey,
    durationSeconds: seconds,
    durationLabel: formatDurationHHMM(seconds),
    deadlineDate: deadline,
    deadlineLabel: formatDatePtBR(deadline),
    deadlineColor: deadlineColor(statusKey, isOverdue),
    deadlineIsSoon,
    userId: task["user_id"] ?? null,
    raw: task,
  };
};

const filterByPeriod = (tasks: TaskView[], period: string) => {
  if (period === "all") return tasks;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return tasks.filter((task) => {
    const relevantDates = collectTaskRelevantDates(task.raw);
    return relevantDates.some((date) => date >= threshold);
  });
};

/* ─── Animations ─── */
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

/* ─── Page ─── */

export default function TarefasPage() {
  usePageSEO("/tarefas");
  const { session } = useAuth();
  const isAdmin = session?.role === "admin" || session?.role === "gerente" || session?.role === "coordenador";
  const [nowTs] = useState(() => Date.now());

  // Filter state — restored from localStorage (clear if different user)
  const FILTERS_KEY = "tarefas:filters";
  const IDENTITY_KEY = "tarefas:lastUser";
  const savedFilters = useMemo(() => {
    const lastUser = storage.get<string>(IDENTITY_KEY, "");
    const currentUser = session?.email || "";
    if (currentUser && lastUser && lastUser !== currentUser) {
      storage.remove(FILTERS_KEY);
      storage.set(IDENTITY_KEY, currentUser);
      return {} as Record<string, string>;
    }
    if (currentUser) storage.set(IDENTITY_KEY, currentUser);
    return storage.get<Record<string, string>>(FILTERS_KEY, {});
  }, [session?.email]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState(savedFilters.status || "all");
  const [deadline, setDeadline] = useState(savedFilters.deadline || "all");
  const [period, setPeriod] = useState(savedFilters.period || "30d");
  const [dateFrom, setDateFrom] = useState(savedFilters.dateFrom || "");
  const [dateTo, setDateTo] = useState(savedFilters.dateTo || "");
  const [deadlineTo, setDeadlineTo] = useState(savedFilters.deadlineTo || "");
  const [consultant, setConsultant] = useState(savedFilters.consultant || "all");
  const [project, setProject] = useState<string[]>(() => {
    const saved = savedFilters.project;
    if (Array.isArray(saved)) return saved as string[];
    if (saved && saved !== "all") return [saved];
    return [];
  });

  // Auto-filter "só meu" when navigating from alert CTA
  const [overdueFromModal, setOverdueFromModal] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("filterMine") === "true" && session?.name) {
      setConsultant(session.name);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("filterOverdue") === "true") {
      setStatus("overdue");
      setPeriod("all");
      if (session?.name) setConsultant(session.name);
      setOverdueFromModal(true);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const notifStatus = params.get("notifStatus");
    const notifConsultant = params.get("notifConsultant");
    const notifProject = params.get("notifProject");
    const notifSearch = params.get("notifSearch");
    const notifScope = params.get("notifScope");
    const notifPeriod = params.get("notifPeriod");
    const hasNotifContext =
      !!notifStatus || !!notifConsultant || !!notifProject || !!notifSearch || !!notifScope || !!notifPeriod;

    if (hasNotifContext) {
      setPage(1);
      setDateFrom("");
      setDateTo("");
      setDeadlineTo("");
      setDeadline("all");
      setProject(notifProject ? [notifProject] : []);
      setSearch(notifSearch ?? "");
      setDebouncedSearch(notifSearch ?? "");
      setStatus(
        notifStatus === "done" || notifStatus === "pending" || notifStatus === "overdue"
          ? notifStatus
          : "all"
      );
      setPeriod(
        notifPeriod === "7d" || notifPeriod === "30d" || notifPeriod === "90d" || notifPeriod === "custom" || notifPeriod === "all"
          ? notifPeriod
          : "all"
      );

      if (notifScope === "mine" && session?.name) {
        setConsultant(session.name);
      } else if (notifConsultant) {
        setConsultant(notifConsultant);
      } else {
        setConsultant("all");
      }

      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [session?.name]);

  // Default filters for non-admin users: pre-select their name as consultant
  // and their accessible projects
  const defaultsAppliedRef = useRef(false);
  const projectDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!session?.name || !session?.role) return;
    const role = session.role;
    if (role === "admin" || role === "gerente" || role === "coordenador") return;

    // Non-admin should always start with own consultant selected
    const saved = storage.get<Record<string, any>>(FILTERS_KEY, {});
    if (saved.consultant !== session.name) {
      setConsultant(session.name);
    }
    // Non-admin should open with "Tudo"
    if (saved.period !== "all") {
      setPeriod("all");
    }
    defaultsAppliedRef.current = true;
  }, [session?.name, session?.role]);
  const [page, setPage] = useState(1);
  const [chartSlide, setChartSlide] = useState(0);
  const [showCharts, setShowCharts] = useState(true);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showTaskListInfo, setShowTaskListInfo] = useState(false);

  // Persist filters when they change
  useEffect(() => {
    storage.set(FILTERS_KEY, { status, deadline, period, dateFrom, dateTo, deadlineTo, consultant, project });
  }, [status, deadline, period, dateFrom, dateTo, deadlineTo, consultant, project]);
  const pageSize = 10;

  const searchInputRef = useRef<HTMLInputElement>(null!);
  const filtersBoxRef = useRef<HTMLDivElement>(null);

  // Data hooks
  const { tasks, loading, error, reload, lastUpdated, totalCount, reloadCooldownMsLeft, reloadsRemainingThisMinute } = useTasks({
    accessToken: session?.accessToken,
    period,
    dateFrom,
    dateTo,
  });
  const {
    times,
    loading: loadingTimes,
    error: timesError,
    reload: reloadTimes,
    lastUpdated: lastUpdatedTimes,
  } = useElapsedTimes({
    accessToken: session?.accessToken,
    period,
    dateFrom,
    dateTo,
  });

  // Auto-refresh every minute so status/deadline changes appear quickly after sync
  useEffect(() => {
    const interval = setInterval(() => { reload(); reloadTimes(); }, 60_000);
    return () => clearInterval(interval);
  }, [reload, reloadTimes]);

  const scrollToFilters = useCallback(() => {
    filtersBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const hasActiveFilters =
    !!search || status !== "all" || deadline !== "all" || period !== "all" || consultant !== "all" || project.length > 0 || !!dateFrom || !!dateTo || !!deadlineTo;

  const resetFilters = useCallback(() => {
    setSearch(""); setDebouncedSearch(""); setStatus("all"); setDeadline("all");
    setPeriod("all"); setConsultant("all"); setProject([]);
    setDateFrom(""); setDateTo(""); setDeadlineTo(""); setPage(1);
    requestAnimationFrame(() => { scrollToFilters(); searchInputRef.current?.focus(); });
  }, [scrollToFilters]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const refreshing = loading || loadingTimes;
  const combinedLastUpdated =
    lastUpdated && lastUpdatedTimes
      ? Math.min(lastUpdated, lastUpdatedTimes)
      : lastUpdated ?? lastUpdatedTimes ?? null;

  // Duration map
  const durationByTaskId = useMemo(() => {
    const map: Record<string, number> = {};
    times.forEach((entry) => {
      if (entry.task_id === undefined || entry.task_id === null) return;
      const key = String(entry.task_id);
      const seconds = typeof entry.seconds === "number" ? entry.seconds : Number(entry.seconds);
      if (Number.isNaN(seconds)) return;
      map[key] = (map[key] ?? 0) + seconds;
    });
    return map;
  }, [times]);

  // Time entries grouped by task_id for detailed tracking view
  const timeEntriesByTaskId = useMemo(() => {
    const map: Record<string, typeof times> = {};
    times.forEach((entry) => {
      if (entry.task_id === undefined || entry.task_id === null) return;
      const key = String(entry.task_id);
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    });
    return map;
  }, [times]);

  // Build user_id → name map from tasks (responsible_id → responsible_name)
  // and also from time entries cross-referenced with task consultants
  const userNames = useMemo(() => {
    const map: Record<string, string> = {};
    // Method 1: Direct from task responsible_id → responsible_name
    tasks.forEach((task) => {
      const uid = task.responsible_id ?? task.user_id;
      const name = String(task.responsible_name ?? task.consultant ?? task.owner ?? task.responsavel ?? "").trim();
      if (uid && name && name !== "Sem consultor") {
        map[String(uid)] = name;
      }
    });
    // Method 2: Cross-reference time entries with tasks
    // If a task has only one unique user_id in its entries, that user is the task's consultant
    if (Object.keys(map).length === 0) {
      const taskConsultantMap = new Map<string, string>();
      tasks.forEach((task) => {
        const tid = String(task.task_id ?? task.id ?? "");
        const name = String(task.responsible_name ?? task.consultant ?? task.owner ?? task.responsavel ?? "").trim();
        if (tid && name && name !== "Sem consultor") {
          taskConsultantMap.set(tid, name);
        }
      });
      Object.entries(timeEntriesByTaskId).forEach(([taskId, entries]) => {
        const consultantName = taskConsultantMap.get(taskId);
        if (!consultantName) return;
        const uniqueUserIds = new Set(entries.map(e => String(e.user_id ?? "")).filter(Boolean));
        if (uniqueUserIds.size === 1) {
          const userId = [...uniqueUserIds][0];
          if (!map[userId]) map[userId] = consultantName;
        }
      });
    }
    return map;
  }, [tasks, timeEntriesByTaskId]);

  // Build a project_id → name lookup from tasks that have the join data
  // This prevents phantom projects when some tasks fall back to group_name
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((task) => {
      const pid = task.project_id != null ? String(task.project_id) : null;
      const joinName = task.projects && typeof task.projects === "object"
        ? String((task.projects as any).name ?? "").trim()
        : "";
      if (pid && joinName) map.set(pid, joinName);
    });
    return map;
  }, [tasks]);

  // Normalize tasks
  const normalizedTasks = useMemo(() => {
    return tasks.map((task) => {
      const rawId = task["id"] ?? task["task_id"];
      const taskId = rawId === undefined || rawId === null ? undefined : String(rawId);
      const seconds = taskId ? durationByTaskId[taskId] : undefined;
      return normalizeTask(task, seconds, projectNameById);
    });
  }, [tasks, durationByTaskId, projectNameById]);

  // Status alerts now handled globally via DashboardLayout → AssistantReminder

  // Filter by accessible projects (non-admin users only see assigned projects)
  const companyName = session?.company?.trim();
  const accessibleProjectNames = session?.accessibleProjectNames;
  const accessibleProjectIds = session?.accessibleProjectIds;
  const projectFilteredTasks = useMemo(() => {
    // Admins, gerentes, coordenadores see everything
    if (isAdmin) return normalizedTasks;

    const hasExplicitIds = accessibleProjectIds && accessibleProjectIds.length > 0;
    const hasCompanyName = !!companyName;
    const myTasks = normalizedTasks.filter((task) => {
      return taskBelongsToSession(
        task.consultant,
        task.raw.responsible_id ?? task.raw.user_id,
        session?.name,
        session?.bitrixUserId,
      );
    });

    // Sem vínculo de projeto configurado, ainda mostramos as tarefas do próprio responsável.
    if (!hasExplicitIds && !hasCompanyName) return myTasks;

    // Use project IDs for exact matching (prevents substring false positives)
    const allowedIds = hasExplicitIds ? new Set(accessibleProjectIds!) : null;
    const allowedNames = new Set((accessibleProjectNames ?? []).map((name) => normalizeComparableText(name)).filter(Boolean));

    const getProjectAccessKey = (task: TaskView) => {
      const pid = Number(task.raw.project_id);
      if (pid) return `id:${pid}`;
      const name = normalizeComparableText(task.project);
      return name ? `name:${name}` : null;
    };

    const filtered = normalizedTasks.filter((task) => {
      // Check by exact project ID match
      const pid = Number(task.raw.project_id);
      if (allowedIds && pid) {
        return allowedIds.has(pid);
      }

      const normalizedProjectName = normalizeComparableText(task.project);
      if (allowedNames.size > 0 && normalizedProjectName && allowedNames.has(normalizedProjectName)) {
        return true;
      }

      // Fallback by company name ONLY when explicit project IDs are not available
      if (!hasExplicitIds && hasCompanyName && normalizedProjectName) {
        const needle = normalizeComparableText(companyName!);
        // Only match if the project name starts with or contains the company as a segment
        // e.g. "DS Tech <> ISP Consulte" matches company "ISP Consulte" via the <> pattern
        if (normalizedProjectName.includes(needle) && normalizedProjectName !== needle) return true;
      }

      return false;
    });

    // Non-admin: show only projects where the logged user has linked tasks (faz parte)
    if (session?.name || session?.bitrixUserId) {
      const myProjectKeys = new Set<string>();

      filtered.forEach((task) => {
        if (
          taskBelongsToSession(
            task.consultant,
            task.raw.responsible_id ?? task.raw.user_id,
            session?.name,
            session?.bitrixUserId,
          )
        ) {
          const projectKey = getProjectAccessKey(task);
          if (projectKey) myProjectKeys.add(projectKey);
        }
      });

      if (myProjectKeys.size === 0) return filtered.length > 0 ? filtered : myTasks;
      return filtered.filter((task) => {
        const projectKey = getProjectAccessKey(task);
        return !!projectKey && myProjectKeys.has(projectKey);
      });
    }

    return filtered.length > 0 ? filtered : myTasks;
  }, [normalizedTasks, isAdmin, accessibleProjectIds, accessibleProjectNames, companyName, session?.name, session?.bitrixUserId]);

  // Scope by company (kept for backward compat, now uses projectFilteredTasks)
  const scopedTasks = projectFilteredTasks;

  // Compute user's project names for "mine first" sorting in filter dropdown
  // "Projetos que faço parte" = projects where the user is the RESPONSIBLE (has tasks assigned)
  // NOT just projects they have access to view
  const myProjectNames = useMemo(() => {
    const uName = session?.name;
    if (!uName) return new Set<string>();

    const names = new Set<string>();
    normalizedTasks.forEach((t) => {
      if (
        taskBelongsToSession(
          t.consultant,
          t.raw.responsible_id ?? t.raw.user_id,
          session?.name,
          session?.bitrixUserId,
        )
      ) {
        const name = (t.project || "").trim();
        if (name && name.toLowerCase() !== "projeto indefinido") names.add(name);
      }
    });
    return names;
  }, [normalizedTasks, session?.name, session?.bitrixUserId]);

  // Default project filter for non-admin: pre-select only projects where user "faz parte"
  useEffect(() => {
    if (projectDefaultsAppliedRef.current) return;
    if (!session?.role) return;
    const role = session.role;
    if (role === "admin" || role === "gerente" || role === "coordenador") return;
    if (normalizedTasks.length === 0) return;

    const saved = storage.get<Record<string, any>>(FILTERS_KEY, {});
    const savedProject = saved.project;
    const savedProjects = Array.isArray(savedProject)
      ? savedProject.filter(Boolean)
      : savedProject && savedProject !== "all"
      ? [savedProject]
      : [];

    const allowedNames = myProjectNames;

    if (savedProjects.length > 0) {
      const validSaved = savedProjects.filter((name) => allowedNames.has(name));
      if (validSaved.length !== savedProjects.length) {
        setProject(validSaved.length > 0 ? validSaved : Array.from(allowedNames));
      }
      projectDefaultsAppliedRef.current = true;
      return;
    }

    if (allowedNames.size > 0) {
      setProject(Array.from(allowedNames));
      projectDefaultsAppliedRef.current = true;
      return;
    }

    setProject([]);
    projectDefaultsAppliedRef.current = true;
  }, [session?.role, normalizedTasks, myProjectNames]);

  const searchTerm = debouncedSearch.trim().toLowerCase();

  const matchesSearchTerm = useCallback(
    (task: TaskView, term: string) =>
      !term ||
      task.title.toLowerCase().includes(term) ||
      task.consultant.toLowerCase().includes(term) ||
      task.project.toLowerCase().includes(term) ||
      task.description.toLowerCase().includes(term),
    []
  );

  const searchScopedTasks = useMemo(() => {
    if (!searchTerm) return scopedTasks;
    return scopedTasks.filter((t) => matchesSearchTerm(t, searchTerm));
  }, [scopedTasks, searchTerm, matchesSearchTerm]);

  // Filter options — projects with "<>" in the name go to the end
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    searchScopedTasks.forEach((task) => {
      const name = (task.project || "").trim();
      if (!name || name.toLowerCase() === "projeto indefinido") return;
      set.add(name);
    });
    return Array.from(set).sort((a, b) => {
      const aHas = a.includes("<>");
      const bHas = b.includes("<>");
      if (aHas !== bHas) return aHas ? 1 : -1;
      return a.localeCompare(b);
    });
  }, [searchScopedTasks]);

  const consultantOptions = useMemo(() => {
    const set = new Set<string>();
    searchScopedTasks.forEach((task) => {
      const name = (task.consultant || "").trim();
      if (!name) return;
      set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [searchScopedTasks]);

  const lockedProject = session?.role === "cliente" && session.company?.trim();
  const effectiveProjectFilter: string[] = lockedProject ? [session.company?.trim() ?? ""] : project;

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    const byPeriod =
      period === "custom"
        ? scopedTasks.filter((task) => {
            const from = dateFrom ? parseDateValue(dateFrom) : null;
            const to = dateTo ? parseDateValue(dateTo) : null;
            const relevantDates = collectTaskRelevantDates(task.raw);
            if (relevantDates.length === 0) return false;

            const endOfDay = to ? new Date(to) : null;
            if (endOfDay) endOfDay.setHours(23, 59, 59, 999);

            return relevantDates.some((date) => {
              if (from && date < from) return false;
              if (endOfDay && date > endOfDay) return false;
              return true;
            });
          })
        : filterByPeriod(scopedTasks, period);

    const visible = byPeriod.filter((task) => {
      const projectNormalized = (task.project || "").trim().toLowerCase();
      if (projectNormalized === "projeto indefinido") return false;

      const matchesConsultant =
        consultant === "all" ||
        normalizeComparableText(task.consultant) === normalizeComparableText(consultant);
      const matchesProject = effectiveProjectFilter.length === 0 || effectiveProjectFilter.some(p => task.project.toLowerCase().includes(p.toLowerCase()));
      const matchesStatus =
        status === "all"
          ? true
          : status === "done"
            ? task.statusKey === "done"
            : status === "overdue"
              ? task.statusKey === "overdue"
              : task.statusKey === "pending" || task.statusKey === "unknown";
      const matchesDeadline =
        deadline === "all"
          ? true
          : deadline === "overdue"
            ? task.statusKey === "overdue"
            : deadline === "done"
              ? task.statusKey === "done"
              : task.statusKey === "pending" || task.statusKey === "unknown";
      const deadlineDate = parseDateValue(task.raw["due_date"]) || parseDateValue(task.raw["dueDate"]) || parseDateValue(task.raw["deadline"]);
      const deadlineLimit = deadlineTo ? parseDateValue(deadlineTo) : null;
      const matchesDeadlineDate = !deadlineLimit || (deadlineDate ? deadlineDate <= deadlineLimit : false);

      return matchesSearchTerm(task, searchTerm) && matchesConsultant && matchesProject && matchesStatus && matchesDeadline && matchesDeadlineDate;
    });

    const score = (task: TaskView) => {
      if (task.statusKey === "overdue") return -100;
      if (task.statusKey === "pending" || task.statusKey === "unknown") {
        if (task.deadlineDate) {
          const days = (task.deadlineDate.getTime() - nowTs) / (24 * 60 * 60 * 1000);
          return Math.max(days, 0);
        }
        return 50;
      }
      if (task.statusKey === "done") return 100;
      return 75;
    };

    return [...visible].sort((a, b) => {
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      return a.title.localeCompare(b.title);
    });
  }, [scopedTasks, period, searchTerm, status, deadline, dateFrom, dateTo, deadlineTo, consultant, effectiveProjectFilter, nowTs, matchesSearchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const paginatedTasks = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, page]);

  // Stats — always use filtered count so numbers match visible tasks
  const stats = useMemo(() => {
    const total = filteredTasks.length;
    const done = filteredTasks.filter((t) => t.statusKey === "done").length;
    const overdue = filteredTasks.filter((t) => t.statusKey === "overdue").length;
    const pending = filteredTasks.filter((t) => t.statusKey === "pending" || t.statusKey === "unknown").length;
    const durations = filteredTasks.map((t) => t.durationSeconds).filter((v): v is number => typeof v === "number");
    const totalSeconds = durations.reduce((acc, curr) => acc + curr, 0);
    return { total, done, overdue, pending, totalSeconds: totalSeconds || 0 };
  }, [filteredTasks]);

  // Unique clients & projects
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    filteredTasks.forEach((t) => {
      const clientName = t.raw.projects && typeof t.raw.projects === "object"
        ? String((t.raw.projects as any)?.name ?? "").trim()
        : "";
      const projectName = (t.project || "").trim();
      const name = clientName || projectName;
      if (name && name.toLowerCase() !== "projeto indefinido") set.add(name);
    });
    return set;
  }, [filteredTasks]);

  const uniqueProjects = useMemo(() => {
    const set = new Set<string>();
    filteredTasks.forEach((t) => {
      const name = (t.project || "").trim();
      if (name && name.toLowerCase() !== "projeto indefinido") set.add(name);
    });
    return set;
  }, [filteredTasks]);

  const pendingHighlights = useMemo(() => {
    return filteredTasks
      .filter((t) => t.statusKey === "pending" || t.statusKey === "overdue" || t.statusKey === "unknown")
      .sort((a, b) => {
        const aDate = (a.deadlineDate ?? parseDateValue(a.raw["created_at"]))?.getTime() ?? Infinity;
        const bDate = (b.deadlineDate ?? parseDateValue(b.raw["created_at"]))?.getTime() ?? Infinity;
        return aDate - bDate;
      })
      .slice(0, 8);
  }, [filteredTasks]);

  // Activity bars
  const activityBars = useMemo(() => {
    const monthMap = new Map<string, { done: number; pending: number }>();
    filteredTasks.forEach((t) => {
      const d = t.deadlineDate || parseDateValue(t.raw["created_at"]) || parseDateValue(t.raw["createdAt"]);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = monthMap.get(key) ?? { done: 0, pending: 0 };
      if (t.statusKey === "done") cur.done += 1;
      else cur.pending += 1;
      monthMap.set(key, cur);
    });
    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, val]) => {
        const [, m] = key.split("-");
        const monthLabel = new Date(2024, Number(m) - 1).toLocaleString("pt-BR", { month: "short" }).replace(".", "");
        return { month: monthLabel, done: val.done, pending: val.pending, total: val.done + val.pending };
      });
  }, [filteredTasks]);

  const maxBarValue = Math.max(1, ...activityBars.map((b) => b.total));

  // Project hours for bar chart
  const projectHoursData = useMemo(() => {
    const map = new Map<string, { seconds: number; count: number }>();
    filteredTasks.forEach((t) => {
      const name = (t.project || "").trim();
      if (!name || name.toLowerCase() === "projeto indefinido") return;
      const cur = map.get(name) ?? { seconds: 0, count: 0 };
      cur.seconds += t.durationSeconds ?? 0;
      cur.count += 1;
      map.set(name, cur);
    });
    return [...map.entries()]
      .map(([name, { seconds, count }]) => ({ name, hours: seconds / 3600, hoursLabel: formatSecondsHuman(seconds), count }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);
  }, [filteredTasks]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [debouncedSearch, status, deadline, period, dateFrom, dateTo, deadlineTo, consultant]);

  const totalHours = stats.totalSeconds / 3600;
  const totalHoursLabel = formatSecondsHuman(stats.totalSeconds);
  const pctDone = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const chartSlides = [
    { id: "overview", label: "Visão Geral" },
    { id: "charts", label: "Gráficos Detalhados" },
  ];

  // Show skeleton on initial load (no cached data yet)
  if (loading && tasks.length === 0 && !error) {
    return <PageSkeleton variant="tarefas" />;
  }

  if (error && tasks.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-8">
        <DataErrorCard
          message={error}
          onRetry={() => { reload(); reloadTimes(); }}
        />
      </div>
    );
  }

  return (
    <div className="page-gradient w-full">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-4 sm:p-5 md:p-8 overflow-x-hidden">

        {/* ═══ HEADER ═══ */}
        <PageHeaderCard
          icon={Layers}
          title="Tarefas"
          subtitle="Progresso, prazos e desempenho das atividades."
          actions={
            <>
              {session?.role !== "cliente" && (
                <button
                  type="button"
                  onClick={() => setShowExportModal(true)}
                  disabled={filteredTasks.length === 0}
                  className="group flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-white/50 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.06] hover:text-emerald-400 disabled:opacity-40"
                  title="Exportar PDF"
                >
                  <FileDown className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              )}
              {session?.role !== "cliente" && (
                <button
                  type="button"
                  onClick={() => { reload(); reloadTimes(); }}
                  disabled={refreshing || reloadCooldownMsLeft > 0 || reloadsRemainingThisMinute <= 0}
                  title={
                    reloadsRemainingThisMinute <= 0
                      ? "Limite de 5 atualizações por minuto atingido"
                      : reloadCooldownMsLeft > 0
                      ? `Aguarde ${Math.ceil(reloadCooldownMsLeft / 1000)}s`
                      : `Atualizar dados (${reloadsRemainingThisMinute} restantes)`
                  }
                  className="group flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-white/50 transition-all hover:border-white/[0.15] hover:bg-white/[0.05] hover:text-white/70 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">
                    {refreshing
                      ? "Atualizando..."
                      : reloadsRemainingThisMinute <= 0
                      ? "Limite atingido"
                      : "Atualizar"}
                  </span>
                  {reloadsRemainingThisMinute > 0 && reloadsRemainingThisMinute < 5 && !refreshing && (
                    <span className="opacity-50">({reloadsRemainingThisMinute})</span>
                  )}
                </button>
              )}
            </>
          }
        />

          {/* Priority summary block */}
          {overdueFromModal && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-2xl border border-border/10 bg-white/[0.02] p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/12 mt-0.5">
                    <Clock className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-foreground sm:text-base">Prioridades de hoje</h2>
                    <p className="text-xs text-muted-foreground/55 mt-0.5 leading-relaxed">
                      {stats.overdue > 0
                        ? `Você tem ${stats.overdue} atividade${stats.overdue > 1 ? "s" : ""} pendente${stats.overdue > 1 ? "s" : ""} de atenção. Comece por elas.`
                        : "Nenhuma atividade atrasada no momento. Continue acompanhando seus prazos."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setStatus("all"); setOverdueFromModal(false); }}
                    className="rounded-lg border border-border/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  >
                    Ver todas
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStatus("overdue"); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      status === "overdue"
                        ? "bg-amber-500/15 border border-amber-500/20 text-amber-400"
                        : "border border-border/10 bg-white/[0.03] text-muted-foreground/70 hover:bg-amber-500/10 hover:text-amber-400"
                    }`}
                  >
                    Somente atrasadas
                    {stats.overdue > 0 && (
                      <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-400 tabular-nums">
                        {stats.overdue}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverdueFromModal(false)}
                    className="rounded-lg p-1.5 text-muted-foreground/35 transition-colors hover:bg-white/[0.06] hover:text-muted-foreground/60"
                    title="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

        {/* ═══ FILTERS (moved here, below header) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          ref={filtersBoxRef}
          className="mb-5"
        >
          <TaskFilters
            search={search} setSearch={setSearch}
            status={status} setStatus={setStatus}
            deadline={deadline} setDeadline={setDeadline}
            period={period} setPeriod={setPeriod}
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            deadlineTo={deadlineTo} setDeadlineTo={setDeadlineTo}
            consultant={consultant} setConsultant={setConsultant}
            consultantOptions={isAdmin ? consultantOptions : (session?.name ? [session.name] : [])}
            searchRef={searchInputRef}
            project={effectiveProjectFilter} setProject={setProject}
            projectOptions={projectOptions}
            projectDisabled={Boolean(lockedProject)}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={resetFilters}
            myProjectNames={myProjectNames}
            hideFilters={false}
          />
        </motion.div>

        {/* ═══ KPI CARDS ═══ */}
        <motion.div variants={stagger} initial="initial" animate="animate" className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard icon={Layers} label="Total de Tarefas" value={stats.total} color="purple" delay={0} loading={loading} sub={`${uniqueProjects.size} projeto${uniqueProjects.size !== 1 ? "s" : ""} ativo${uniqueProjects.size !== 1 ? "s" : ""}`} />
          <KpiCard icon={Timer} label="Horas Alocadas" value={totalHoursLabel} color="blue" delay={0.05} loading={loading} sub={stats.total > 0 ? `~${formatHoursHuman(totalHours / Math.max(stats.total, 1))} por tarefa` : "Sem dados"} />
          <KpiCard icon={Hourglass} label="Em Andamento" value={stats.pending} color="yellow" delay={0.1} loading={loading} sub={stats.total > 0 ? `${Math.round((stats.pending / stats.total) * 100)}% do total` : "Nenhuma"} />
          <KpiCard icon={CheckCircle2} label="Concluídas" value={stats.done} color="green" delay={0.15} loading={loading} sub={stats.total > 0 ? `${pctDone}% de conclusão` : "Nenhuma"} />
          <KpiCard icon={AlertTriangle} label="Atrasadas" value={stats.overdue} color="red" delay={0.2} loading={loading} sub={stats.overdue > 0 ? `Requer ação imediata` : "Tudo em dia ✓"} />
        </motion.div>

        {/* ═══ MAIN DASHBOARD: Collapsible 3-column ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mb-5"
        >
          <button
            type="button"
            onClick={() => setShowDashboard((v) => !v)}
            className="flex items-center gap-2 mb-3 text-sm font-semibold text-[hsl(var(--task-text))] hover:text-[hsl(var(--task-yellow))] transition"
          >
            <Layers className="h-4 w-4" />
            Painel de Desempenho
            <ChevronDown className={`h-4 w-4 transition-transform ${showDashboard ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {showDashboard && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(240px,260px)_minmax(280px,320px)]">

          {/* LEFT: Focus — Top performers */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="task-card flex flex-col max-h-[60vh] xl:max-h-[calc(100vh-340px)] min-h-[260px] overflow-hidden md:col-span-1"
          >
            <div className="flex items-center justify-between mb-4 sticky top-0 z-10 bg-[hsl(var(--task-surface))] pb-2">
              <div>
                <h2 className="text-lg font-extrabold text-[hsl(var(--task-text))] tracking-tight">
                  Desempenho da Equipe
                </h2>
              </div>
            </div>

            {/* Top performers list */}
            <div className="space-y-2 flex-1 overflow-y-auto styled-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="h-6 w-6 rounded-full border-2 border-white/10 border-t-[hsl(var(--task-purple))]"
                  />
                  <p className="text-xs text-[hsl(var(--task-text-muted))]">Carregando dados da equipe…</p>
                </div>
              ) : (() => {
                const performerMap = new Map<string, { total: number; done: number; overdue: number; pending: number; hours: number }>();
                filteredTasks.forEach((t) => {
                  const name = (t.consultant || "").trim() || "Sem responsável";
                  const cur = performerMap.get(name) ?? { total: 0, done: 0, overdue: 0, pending: 0, hours: 0 };
                  cur.total += 1;
                  if (t.statusKey === "done") cur.done += 1;
                  else if (t.statusKey === "overdue") cur.overdue += 1;
                  else cur.pending += 1;
                  cur.hours += (t.durationSeconds ?? 0) / 3600;
                  performerMap.set(name, cur);
                });
                const performers = [...performerMap.entries()]
                  .sort((a, b) => b[1].done - a[1].done || b[1].total - a[1].total)
                  .slice(0, 6);
                const maxTotal = Math.max(1, ...performers.map(([, d]) => d.total));

                if (!performers.length) {
                  return <EmptyState variant="users" />;
                }

                return performers.map(([name, data], idx) => {
                  const pctBar = data.total > 0 ? (data.done / data.total) * 100 : 0;
                  const pctDoneLocal = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
                  // Cor única: verde para progresso concluído
                  const color = "hsl(142 71% 45%)";
                  return (
                    <motion.div
                      key={name}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + idx * 0.06 }}
                      className="rounded-xl border border-[hsl(var(--task-border))] bg-[hsl(var(--task-bg))] p-3 hover:border-[hsl(var(--task-border-light))] transition"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold bg-[hsl(var(--task-purple)/0.15)] text-[hsl(var(--task-purple))]"
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[hsl(var(--task-text))] truncate">{name}</p>
                          <div className="flex items-center gap-2.5 text-[11px] flex-wrap mt-0.5">
                            <span className="text-emerald-400 font-medium">{data.done} feitas</span>
                            {data.pending > 0 && <span className="text-[hsl(var(--task-yellow))] font-medium">{data.pending} em andamento</span>}
                            {data.overdue > 0 && <span className="text-rose-400/80 font-medium">{data.overdue} atrasadas</span>}
                          </div>
                        </div>
                        <span className="text-sm font-extrabold text-emerald-400">{pctDoneLocal}%</span>
                      </div>
                      {/* Progress bar with loading shimmer */}
                      <div className="h-2 rounded-full bg-[hsl(var(--task-border))] overflow-hidden relative">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pctBar}%` }}
                          transition={{ duration: 1.2, delay: 0.4 + idx * 0.12, ease: [0.22, 1, 0.36, 1] }}
                          className="h-full rounded-full relative overflow-hidden"
                          style={{ background: `linear-gradient(90deg, hsl(142 71% 45%), hsl(142 71% 55%))` }}
                        >
                          <div
                            className="absolute inset-0 animate-[task-shimmer_2s_ease-in-out_infinite]"
                            style={{
                              background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)`,
                              backgroundSize: "200% 100%",
                            }}
                          />
                        </motion.div>
                      </div>
                    </motion.div>
                  );
                });
              })()}
            </div>
          </motion.div>

          {/* CENTER: Performance Gauge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="task-card flex flex-col items-center justify-center md:col-span-1"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[hsl(var(--task-yellow))] mb-2">
              Progresso das Tarefas
            </p>
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="h-6 w-6 rounded-full border-2 border-white/10 border-t-[hsl(var(--task-yellow))]"
                />
                <p className="text-xs text-[hsl(var(--task-text-muted))]">Carregando progresso…</p>
              </div>
            ) : (
              <>
                <div className="flex-1 flex items-center justify-center w-full">
                  <ProjectPerformanceGauge tasks={filteredTasks ?? []} footerHint="" />
                </div>
                <div className="grid grid-cols-2 gap-2 w-full mt-3">
                  <div className="rounded-xl bg-[hsl(var(--task-bg))] border border-[hsl(var(--task-border))] px-3 py-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-[hsl(var(--task-text-muted))]">Pendentes</p>
                    <p className="text-xl font-extrabold text-[hsl(var(--task-yellow))]">{stats.pending}</p>
                  </div>
                  <div className="rounded-xl bg-[hsl(var(--task-bg))] border border-[hsl(var(--task-border))] px-3 py-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-[hsl(var(--task-text-muted))]">Feitas</p>
                    <p className="text-xl font-extrabold text-emerald-400">{stats.done}</p>
                  </div>
                </div>
              </>
            )}
          </motion.div>

          {/* RIGHT: Deadlines */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="task-card flex flex-col max-h-[60vh] xl:max-h-[calc(100vh-340px)] min-h-[260px] overflow-hidden md:col-span-2 xl:col-span-1"
          >
            <div className="flex items-center justify-center gap-2 mb-4 sticky top-0 z-10 bg-[hsl(var(--task-surface))] pb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[hsl(var(--task-yellow)/0.15)]">
                <Clock className="h-3.5 w-3.5 text-[hsl(var(--task-yellow))]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-[hsl(var(--task-text))]">Prazos</p>
                <p className="text-[10px] text-[hsl(var(--task-text-muted))]">Próximas entregas pendentes</p>
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="h-6 w-6 rounded-full border-2 border-white/10 border-t-[hsl(var(--task-yellow))]"
                  />
                  <p className="text-xs text-[hsl(var(--task-text-muted))]">Carregando prazos…</p>
                </div>
              ) : pendingHighlights.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400/20 mb-2" />
                  <p className="text-xs text-[hsl(var(--task-text-muted))]">Tudo em dia!</p>
                </div>
              ) : (
                pendingHighlights.map((task, idx) => (
                  <motion.div
                    key={`${task.title}-${idx}`}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + idx * 0.04 }}
                    className={`group relative rounded-xl border border-[hsl(var(--task-border))] bg-[hsl(var(--task-bg))] p-3 transition-all hover:border-[hsl(var(--task-yellow)/0.3)] hover:bg-[hsl(var(--task-surface-hover))] ${task.statusKey === "overdue" ? "task-deadline-shake" : ""}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1.5 shrink-0 h-2 w-2 rounded-full ${
                        task.statusKey === "overdue" ? "bg-rose-400 animate-pulse" : "bg-[hsl(var(--task-yellow))]"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[hsl(var(--task-text))] leading-snug group-hover:whitespace-normal truncate group-hover:truncate-none">{task.title}</p>
                        <p className="text-[10px] text-[hsl(var(--task-text-muted))] mt-0.5 truncate group-hover:whitespace-normal">{task.project}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[9px]">
                      <span className={`font-semibold ${task.statusKey === "overdue" ? "text-rose-400" : "text-[hsl(var(--task-text-muted))]"}`}>
                        {task.deadlineLabel || "Sem prazo"}
                      </span>
                      <span className="text-[hsl(var(--task-text-muted))]">{task.consultant}</span>
                    </div>
                    {/* Expanded on hover */}
                    <div className="hidden group-hover:block mt-2 pt-2 border-t border-[hsl(var(--task-border)/0.3)] max-h-28 overflow-y-auto custom-scrollbar">
                      <FormattedDescription text={task.description || "Sem descrição"} />
                      {task.durationSeconds != null && task.durationSeconds > 0 && (
                        <p className="text-[9px] text-[hsl(var(--task-text-muted))] mt-1">
                          Tempo: <span className="font-bold text-[hsl(var(--task-text))]">{task.durationLabel}</span>
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {stats.overdue > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 task-shake" />
                <span className="text-[10px] font-bold text-rose-400">
                  {stats.overdue} tarefa{stats.overdue > 1 ? "s" : ""} atrasada{stats.overdue > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </motion.div>
        </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ═══ CHARTS SECTION (Collapsible + Slides) ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mb-6"
        >
          <button
            type="button"
            onClick={() => setShowCharts((v) => !v)}
            className="flex items-center gap-2 mb-3 text-sm font-semibold text-[hsl(var(--task-text))] hover:text-[hsl(var(--task-yellow))] transition"
          >
            <BarChart3 className="h-4 w-4" />
            Análise Detalhada
            <ChevronDown className={`h-4 w-4 transition-transform ${showCharts ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {showCharts && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <TaskCharts
                  tasks={filteredTasks}
                  barProjectsOverride={projectHoursData}
                  loading={loading}
                  onPickConsultant={(name) => setConsultant(name)}
                  onPickProject={(name) => setProject([name])}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>




        {/* ═══ TASK LIST ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.45 }}
          className="relative"
        >
          <div className="mb-3 flex items-center gap-3">
            <h3 className="text-base font-bold text-[hsl(var(--task-text))]">
              Lista de Atividades
            </h3>
            <span className="text-xs font-normal text-[hsl(var(--task-text-muted))]">
              {filteredTasks.length} {filteredTasks.length === 1 ? "tarefa encontrada" : "tarefas encontradas"}
            </span>
            <button
              type="button"
              onClick={() => setShowTaskListInfo(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--task-text-muted)/0.55)] transition hover:bg-[hsl(var(--task-surface-hover))] hover:text-[hsl(var(--task-text))]"
              aria-label="Mais informações sobre a lista"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>

          <AnimatePresence>
            {showTaskListInfo && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="absolute inset-x-0 top-8 z-20 overflow-hidden rounded-2xl border border-[hsl(var(--task-border))] bg-[hsl(var(--task-bg)/0.98)] backdrop-blur-sm"
              >
                <div className="flex items-center justify-between border-b border-[hsl(var(--task-border)/0.55)] px-4 py-3">
                  <h4 className="text-sm font-bold text-[hsl(var(--task-text))]">Como esta lista é organizada</h4>
                  <button
                    type="button"
                    onClick={() => setShowTaskListInfo(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[hsl(var(--task-text-muted))] transition hover:bg-[hsl(var(--task-surface-hover))] hover:text-[hsl(var(--task-text))]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2.5 px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--task-text-muted))]">
                  <p>
                    A <strong className="text-[hsl(var(--task-text))]">Lista de Atividades</strong> prioriza tarefas mais críticas no topo.
                  </p>
                  <ul className="list-disc space-y-1 pl-4 marker:text-[hsl(var(--task-yellow))]">
                    <li><strong className="text-rose-400">Atrasadas</strong> aparecem primeiro.</li>
                    <li>Depois vêm tarefas em andamento com prazo mais próximo.</li>
                    <li>Tarefas concluídas ficam ao final da ordenação.</li>
                  </ul>
                  <p>
                    Os filtros (prazo, responsável, projeto e período) refinam a lista antes da ordenação final.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {(error || timesError) && (
            <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2.5 text-xs text-rose-400">
              {String(error || timesError)}
            </div>
          )}

          {(loading || loadingTimes) && tasks.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="task-shimmer h-14 rounded-xl" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--task-border))] bg-[hsl(var(--task-surface))] px-6 py-16 text-center">
              <Layers className="mb-3 h-10 w-10 text-[hsl(var(--task-text-muted)/0.15)]" />
              <p className="text-sm font-medium text-[hsl(var(--task-text-muted))]">Nenhuma atividade encontrada</p>
              <p className="mt-1 text-xs text-[hsl(var(--task-text-muted)/0.5)]">Tente ajustar os filtros ou atualizar os dados.</p>
            </div>
          ) : (
            <>
              <TaskListTable tasks={paginatedTasks} timeEntriesByTaskId={timeEntriesByTaskId} userNames={userNames} />

              {filteredTasks.length > pageSize && (
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[hsl(var(--task-text-muted))]">
                  <span>
                    {Math.min((page - 1) * pageSize + 1, filteredTasks.length)}–{Math.min(page * pageSize, filteredTasks.length)} de {filteredTasks.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-lg border border-[hsl(var(--task-border))] p-1.5 transition hover:border-[hsl(var(--task-yellow)/0.4)] disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 text-xs font-medium text-[hsl(var(--task-text))]">
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-lg border border-[hsl(var(--task-border))] p-1.5 transition hover:border-[hsl(var(--task-yellow)/0.4)] disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Modal de opções de exportação PDF */}
      {showExportModal && (
        <ExportPDFModal
          title="Exportar Relatório de Tarefas"
          onClose={() => setShowExportModal(false)}
          taskIntegrityData={filteredTasks.map((t): TaskIntegrityInfo => ({
            title: t.title,
            project: t.project,
            consultant: t.consultant,
            deadlineLabel: t.deadlineLabel,
            durationLabel: t.durationLabel,
            statusKey: t.statusKey,
          }))}
          onExport={async (sel: PDFExportSelection, incompleteAction) => {
            const EMPTY_MARKERS = ["sem título", "sem projeto", "sem consultor", "sem prazo", "sem registro", "sem status", "tarefa sem título", "projeto indefinido", ""];

            const isFieldEmpty = (v: string) => EMPTY_MARKERS.includes(v.trim().toLowerCase()) || v.trim() === "" || v.trim() === "—";

            const isTaskIncomplete = (t: typeof filteredTasks[0]) => {
              if (isFieldEmpty(t.title)) return true;
              if (isFieldEmpty(t.project)) return true;
              if (sel.includeResponsible && isFieldEmpty(t.consultant)) return true;
              if (sel.includeDeadline && isFieldEmpty(t.deadlineLabel)) return true;
              if (sel.includeDuration && isFieldEmpty(t.durationLabel)) return true;
              return false;
            };

            let tasksToExport = filteredTasks.filter((t) => {
              if (t.statusKey === "done" && !sel.includeDone) return false;
              if (t.statusKey === "overdue" && !sel.includeOverdue) return false;
              if ((t.statusKey === "pending" || t.statusKey === "unknown") && !sel.includePending) return false;
              return true;
            });

            if (incompleteAction === "exclude") {
              tasksToExport = tasksToExport.filter((t) => !isTaskIncomplete(t));
            } else if (incompleteAction === "only-incomplete") {
              tasksToExport = tasksToExport.filter((t) => isTaskIncomplete(t));
            }

            const rows = tasksToExport.map((t) => ({
              title: (t.title || "").trim() || "Sem título",
              project: (t.project || "").trim() || "Sem projeto",
              consultant: sel.includeResponsible ? ((t.consultant || "").trim() || "Sem responsável") : "—",
              statusLabel: STATUS_LABELS[t.statusKey]?.label || "Sem status",
              deadlineLabel: sel.includeDeadline ? ((t.deadlineLabel || "").trim() || "Sem prazo") : "—",
              durationLabel: sel.includeDuration ? ((t.durationLabel || "").trim() || "Sem registro") : "—",
            }));

            await exportTasksPDF({
              tasks: rows,
              stats: {
                total: rows.length,
                done: rows.filter((r) => r.statusLabel === STATUS_LABELS.done?.label).length,
                overdue: rows.filter((r) => r.statusLabel === STATUS_LABELS.overdue?.label).length,
                pending: rows.filter((r) => r.statusLabel === STATUS_LABELS.pending?.label || r.statusLabel === STATUS_LABELS.unknown?.label).length,
                totalHours: `${totalHoursLabel}h`,
              },
              generatedBy: session?.name || undefined,
            });
          }}
        />
      )}
    </div>
  );
}

/* ─── KPI Card Component ─── */

type KpiCardProps = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: "yellow" | "purple" | "blue" | "green" | "red";
  delay?: number;
  loading?: boolean;
  sub?: string;
};

const colorMap = {
  yellow: { icon: "bg-[hsl(var(--task-yellow)/0.15)] text-[hsl(var(--task-yellow))]", glow: "hover:border-[hsl(var(--task-yellow)/0.3)] hover:shadow-[0_0_20px_hsl(var(--task-yellow)/0.08)]" },
  purple: { icon: "bg-[hsl(var(--task-purple)/0.15)] text-[hsl(var(--task-purple))]", glow: "hover:border-[hsl(var(--task-purple)/0.3)] hover:shadow-[0_0_20px_hsl(var(--task-purple)/0.08)]" },
  blue: { icon: "bg-[hsl(220_90%_56%/0.15)] text-[hsl(220_90%_56%)]", glow: "hover:border-[hsl(220_90%_56%/0.3)] hover:shadow-[0_0_20px_hsl(220_90%_56%/0.08)]" },
  green: { icon: "bg-emerald-500/15 text-emerald-400", glow: "hover:border-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.08)]" },
  red: { icon: "bg-rose-500/15 text-rose-400", glow: "hover:border-rose-500/30 hover:shadow-[0_0_20px_rgba(244,63,94,0.08)]" },
};

function KpiCard({ icon: Icon, label, value, color, delay = 0, loading: isLoading, sub }: KpiCardProps) {
  const c = colorMap[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`task-card group flex items-center gap-2.5 p-3 sm:p-4 transition-all ${c.glow}`}
    >
      <div className={`flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl ${c.icon}`}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--task-text-muted))] truncate">{label}</p>
        {isLoading ? (
          <div className="h-5 w-12 rounded bg-white/[0.06] animate-pulse mt-1" />
        ) : (
          <>
            <p className="text-lg sm:text-xl font-extrabold text-[hsl(var(--task-text))] leading-tight">{value}</p>
            {sub && <p className="text-[9px] text-[hsl(var(--task-text-muted)/0.6)] mt-0.5 truncate">{sub}</p>}
          </>
        )}
      </div>
    </motion.div>
  );
}
