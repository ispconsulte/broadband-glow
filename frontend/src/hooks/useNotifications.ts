import { useCallback, useMemo, useState } from "react";
import { storage } from "@/modules/shared/storage";

export type AppNotification = {
  taskId?: string;
  overdueProjectCount?: number;
  id: string;
  type: "overdue" | "deadline_soon" | "new_assignment" | "info" | "project_alert";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  projectName?: string;
  consultantName?: string;
  daysRemaining?: number;
  deadlineDateStr?: string;
  isOwnTask?: boolean;
  link?: string;
};

const DAILY_RESET_MS = 24 * 60 * 60 * 1000;

const norm = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const makeId = (type: string, title: string, project = "", consultant = "", taskId = "") =>
  `${type}::${taskId || title}::${project}::${consultant}`.replace(/\s+/g, "_").slice(0, 160);

type TaskLike = {
  taskId?: string;
  title?: string;
  project?: string;
  statusKey?: string;
  deadlineDate?: Date | null;
  deadlineIsSoon?: boolean;
  consultant?: string;
  responsibleId?: string | number | null;
};

function buildTaskNotificationLink(task: TaskLike, own: boolean, kind: AppNotification["type"]) {
  const params = new URLSearchParams();
  params.set("notifSource", "bell");
  params.set("notifPeriod", "all");

  const status =
    kind === "project_alert" ? "overdue" : task.statusKey === "overdue" ? "overdue" : task.statusKey === "done" ? "done" : "pending";
  params.set("notifStatus", status);

  if (own) params.set("notifScope", "mine");
  if (task.consultant?.trim()) params.set("notifConsultant", task.consultant.trim());
  if (task.project?.trim()) params.set("notifProject", task.project.trim());
  if (task.title?.trim()) params.set("notifSearch", task.title.trim());
  if (task.taskId?.trim()) params.set("notifTaskId", task.taskId.trim());

  return `/tarefas?${params.toString()}`;
}

function getStorageKeys(userId?: string) {
  const suffix = userId ? `_${userId}` : "";
  return {
    readKey: `app_notifications_read${suffix}`,
    tsKey: `app_notifications_read_ts${suffix}`,
  };
}

function getCleanReadIds(userId?: string): Set<string> {
  const { readKey, tsKey } = getStorageKeys(userId);
  const lastReset = storage.get<number>(tsKey, 0);
  const now = Date.now();

  if (now - lastReset > DAILY_RESET_MS) {
    storage.set(readKey, []);
    storage.set(tsKey, now);
    return new Set();
  }

  const saved = storage.get<string[]>(readKey, []);
  return new Set(saved);
}

/**
 * Notification hook with role-based filtering:
 * - Admin/gerente/coordenador: see ALL tasks, with own tasks highlighted
 * - Consultor/cliente: see ONLY own tasks
 * userId is used to namespace localStorage per user session.
 */
export function useNotifications(
  tasks: TaskLike[],
  userName?: string,
  userRole?: string,
  userId?: string,
  userBitrixId?: string | null,
) {
  const [readIds, setReadIds] = useState<Set<string>>(() => getCleanReadIds(userId));

  const { readKey } = getStorageKeys(userId);

  const persistRead = useCallback((ids: Set<string>) => {
    storage.set(readKey, [...ids]);
  }, [readKey]);

  const notifications = useMemo<AppNotification[]>(() => {
    const now = Date.now();
    const items: AppNotification[] = [];
    const isPrivileged = ["admin", "gerente", "coordenador"].includes(userRole ?? "");

    const isOwnTask = (task: TaskLike): boolean => {
      const responsibleId = String(task.responsibleId ?? "").trim();
      const bitrixUserId = String(userBitrixId ?? "").trim();
      if (responsibleId && bitrixUserId && responsibleId === bitrixUserId) return true;

      if (!userName) return false;
      const consultant = norm(task.consultant || "");
      const user = norm(userName);
      if (!consultant) return false;
      return consultant === user || consultant.includes(user) || user.includes(consultant);
    };

    // Non-privileged users only see their own tasks
    const visibleTasks = isPrivileged
      ? tasks
      : tasks.filter((t) => isOwnTask(t));

    const formatDate = (d: Date | null | undefined) => {
      if (!d) return "";
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    };

    const getDaysRemaining = (d: Date | null | undefined): number | undefined => {
      if (!d) return undefined;
      return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };

    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    visibleTasks.forEach((task) => {
      const title = task.title || "Tarefa";
      const project = task.project || "";
      const own = isOwnTask(task);

      if (task.statusKey === "done") return;

      const deadlineDate = task.deadlineDate;
      const dateStr = formatDate(deadlineDate);
      const daysRemaining = getDaysRemaining(deadlineDate);
      const isOverdue =
        task.statusKey === "overdue" ||
        (deadlineDate !== null && deadlineDate !== undefined && deadlineDate < new Date());
      const isWithinWeek =
        deadlineDate !== null &&
        deadlineDate !== undefined &&
        deadlineDate.getTime() - now <= ONE_WEEK_MS;

      const taskTimestamp = deadlineDate?.getTime() ?? now;

      if (isOverdue) {
        const id = makeId("overdue", title, project, String(task.consultant ?? ""), String(task.taskId ?? ""));
        items.push({
          taskId: task.taskId,
          id,
          type: "overdue",
          title: own ? "⚠️ Sua tarefa está atrasada" : "Tarefa atrasada",
          message: `"${title}"${dateStr ? ` — prazo era ${dateStr}` : ""}.${!own && task.consultant ? ` (${task.consultant})` : ""}`,
          timestamp: taskTimestamp,
          read: readIds.has(id),
          projectName: project,
          consultantName: task.consultant,
          daysRemaining,
          deadlineDateStr: dateStr || undefined,
          isOwnTask: own,
          link: buildTaskNotificationLink(task, own, "overdue"),
        });
      } else if (deadlineDate && isWithinWeek) {
        const id = makeId("soon", title, project, String(task.consultant ?? ""), String(task.taskId ?? ""));
        items.push({
          taskId: task.taskId,
          id,
          type: "deadline_soon",
          title: own ? "📅 Prazo se aproximando" : "Prazo se aproximando",
          message: `Tarefa "${title}" deve ser concluída até ${dateStr}.${!own && task.consultant ? ` (${task.consultant})` : ""}`,
          timestamp: taskTimestamp,
          read: readIds.has(id),
          projectName: project,
          consultantName: task.consultant,
          daysRemaining,
          deadlineDateStr: dateStr,
          isOwnTask: own,
          link: buildTaskNotificationLink(task, own, "deadline_soon"),
        });
      } else {
        const id = makeId("open", title, project, String(task.consultant ?? ""), String(task.taskId ?? ""));
        items.push({
          taskId: task.taskId,
          id,
          type: "new_assignment",
          title: own ? "📋 Sua tarefa em andamento" : "Tarefa em andamento",
          message: `"${title}"${dateStr ? ` — prazo: ${dateStr}` : " — sem prazo definido"}.${!own && task.consultant ? ` (${task.consultant})` : ""}`,
          timestamp: taskTimestamp,
          read: readIds.has(id),
          projectName: project,
          consultantName: task.consultant,
          daysRemaining,
          deadlineDateStr: dateStr || undefined,
          isOwnTask: own,
          link: buildTaskNotificationLink(task, own, "new_assignment"),
        });
      }
    });

    // Smart project alerts (admin only)
    if (isPrivileged) {
      const overdueByProject: Record<string, number> = {};
      visibleTasks.forEach((task) => {
        if (task.statusKey === "done") return;
        const deadlineDate = task.deadlineDate;
        const isOverdue =
          task.statusKey === "overdue" ||
          (deadlineDate !== null && deadlineDate !== undefined && deadlineDate < new Date());
        if (isOverdue) {
          const project = (task.project || "").trim() || "Sem projeto";
          overdueByProject[project] = (overdueByProject[project] ?? 0) + 1;
        }
      });

      const ALERT_THRESHOLD = 5;
      Object.entries(overdueByProject).forEach(([projectName, count]) => {
        if (count >= ALERT_THRESHOLD) {
          const id = makeId("project_alert", projectName);
          items.push({
            id,
            type: "project_alert",
            title: `🚨 Projeto com ${count} tarefas atrasadas`,
            message: `O projeto "${projectName}" acumulou ${count} tarefas atrasadas. Ação imediata recomendada.`,
            timestamp: now,
            read: readIds.has(id),
            projectName,
            overdueProjectCount: count,
            link: `/tarefas?notifSource=bell&notifPeriod=all&notifStatus=overdue&notifProject=${encodeURIComponent(projectName)}`,
          });
        }
      });
    }

    // Clean up stale readIds
    const currentIds = new Set(items.map((item) => item.id));
    const staleIds = [...readIds].filter((id) => !currentIds.has(id));
    if (staleIds.length > 0) {
      const cleaned = new Set([...readIds].filter((id) => currentIds.has(id)));
      setTimeout(() => {
        setReadIds(cleaned);
        storage.set(readKey, [...cleaned]);
      }, 0);
    }

    // Sort: project alerts first, then own tasks, then unread, then by timestamp desc
    items.sort((a, b) => {
      const aIsAlert = a.type === "project_alert" ? 1 : 0;
      const bIsAlert = b.type === "project_alert" ? 1 : 0;
      if (aIsAlert !== bIsAlert) return bIsAlert - aIsAlert;
      if (a.isOwnTask !== b.isOwnTask) return a.isOwnTask ? -1 : 1;
      if (a.read !== b.read) return a.read ? 1 : -1;
      return b.timestamp - a.timestamp;
    });

    return items.slice(0, 50);
  }, [tasks, readIds, userName, userRole, readKey, userBitrixId]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistRead(next);
      return next;
    });
  }, [persistRead]);

  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      persistRead(next);
      return next;
    });
  }, [notifications, persistRead]);

  const clearAll = useCallback(() => {
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
    persistRead(allIds);
  }, [notifications, persistRead]);

  return { notifications, unreadCount, markAsRead, markAllAsRead, clearAll };
}
