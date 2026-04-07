export type TaskStatusKey = "done" | "pending" | "overdue" | "unknown";

export const DEFAULT_DEADLINE_SOON_DAYS = 3;

/**
 * Returns today's date as "YYYY-MM-DD" in the user's local timezone.
 * Avoids the UTC offset bug from `new Date().toISOString().slice(0,10)`.
 */
export const todayLocalIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * Converts a Date object to "YYYY-MM-DD" using local timezone.
 * Avoids the UTC offset bug from `.toISOString().slice(0,10)`.
 */
export const dateToLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Formats an ISO date string "YYYY-MM-DD" to "DD/MM" or "DD/MM/YYYY"
 * by parsing the string directly (no Date constructor = no timezone shift).
 */
export const formatIsoToPtBr = (iso: string, includeYear = false): string => {
  const parts = String(iso).split("-");
  if (parts.length < 3) return iso;
  return includeYear ? `${parts[2]}/${parts[1]}/${parts[0]}` : `${parts[2]}/${parts[1]}`;
};

/**
 * Safely formats a date-only ISO string or timestamp for display.
 * Uses toLocaleDateString only on full timestamps (with time), avoiding
 * the off-by-one bug that occurs with date-only strings like "2026-02-16".
 */
export const formatTimestampPtBr = (
  raw: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string => {
  if (!raw) return "—";
  // If it's a date-only string (YYYY-MM-DD), parse directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    const defaults = options ?? { day: "2-digit", month: "short" };
    // Create at noon local to avoid any shift
    return new Date(Number(y), Number(m) - 1, Number(d), 12).toLocaleDateString("pt-BR", defaults);
  }
  // Full timestamp — safe to use directly
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", options ?? { day: "2-digit", month: "short" });
};

export const parseDateValue = (value?: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const collectTaskRelevantDates = (task: Record<string, unknown>): Date[] => {
  const candidates = [
    task["deadline"],
    task["due_date"],
    task["dueDate"],
    task["closed_date"],
    task["updated_at"],
    task["created_at"],
    task["createdAt"],
    task["inserted_at"],
  ];

  return candidates
    .map((value) => parseDateValue(value))
    .filter((value): value is Date => value instanceof Date);
};

export const getElapsedEffectiveDate = (value: {
  date_start?: unknown;
  created_date?: unknown;
  inserted_at?: unknown;
  updated_at?: unknown;
}) =>
  parseDateValue(value.date_start) ||
  parseDateValue(value.created_date) ||
  parseDateValue(value.inserted_at) ||
  parseDateValue(value.updated_at);

export const formatDatePtBR = (value: Date | null) => {
  if (!value) return "Sem prazo";
  return value.toLocaleDateString("pt-BR");
};

export const formatDurationHHMM = (seconds?: number) => {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return "";

  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds === 0) return "";

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${String(minutes).padStart(2, "0")}m`);
  if (remainingSeconds > 0) parts.push(`${String(remainingSeconds).padStart(2, "0")}s`);

  return parts.join(" ") || "0s";
};

/**
 * Formats a decimal hours value into a human-readable string.
 * Examples: 0.5 → "30min", 1.33 → "1h 20min", 2 → "2h", 0.016 → "1min"
 * Designed to be unambiguous for non-technical users.
 */
export const formatHoursHuman = (hours: number): string => {
  if (!hours || !Number.isFinite(hours) || hours <= 0) return "0min";
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 1) return "<1min";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
};

/**
 * Formats seconds into a human-readable label for KPI cards and summaries.
 * Examples: 3600 → "1h", 5400 → "1h 30min", 2400 → "40min"
 */
export const formatSecondsHuman = (seconds: number): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "0min";
  return formatHoursHuman(seconds / 3600);
};

/**
 * Returns a color class based on duration range.
 * Green: < 1h, Yellow: 1-4h, Red: > 4h
 */
export const durationColorClass = (seconds?: number): { text: string; bg: string; border: string; accent: string } => {
  if (!seconds || seconds <= 0) return { text: "text-[hsl(var(--task-text-muted))]", bg: "bg-[hsl(var(--task-surface))]", border: "border-[hsl(var(--task-border))]", accent: "hsl(var(--task-text-muted))" };
  const hours = seconds / 3600;
  if (hours < 1) return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", accent: "hsl(160 84% 39%)" };
  if (hours <= 4) return { text: "text-[hsl(var(--task-yellow))]", bg: "bg-[hsl(var(--task-yellow)/0.1)]", border: "border-[hsl(var(--task-yellow)/0.2)]", accent: "hsl(var(--task-yellow))" };
  return { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", accent: "hsl(0 84% 60%)" };
};

export const normalizeTaskTitle = (value?: string) => {
  if (!value) return "";
  const cleaned = value
    .replace(/^[\s\u2500-\u257F\u2502\u2514\u251C\u2510\u2518\u250C\u2570\u2571\u2572\u2573\-–—•·]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || value.trim();
};

export const isDeadlineSoon = (
  deadline: Date | null,
  now: Date,
  daysThreshold = DEFAULT_DEADLINE_SOON_DAYS
) => {
  if (!deadline) return false;
  const diff = deadline.getTime() - now.getTime();
  const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;
  return diff > 0 && diff <= thresholdMs;
};

export const deadlineColor = (status: TaskStatusKey, isOverdue: boolean) => {
  if (status === "done") return "text-emerald-200";
  if (isOverdue) return "text-rose-200";
  return "text-slate-200";
};

const plural = (value: number, singular: string, pluralText: string) =>
  value === 1 ? singular : pluralText;

export const formatDeadlineRelative = (deadline: Date | null, now: Date) => {
  if (!deadline) return "Sem prazo";
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Hoje";
  if (diffDays > 0) {
    if (diffDays === 1) return "Amanha";
    if (diffDays < 7) return `${diffDays} dias`;
    const weeks = Math.round(diffDays / 7);
    if (diffDays < 30) return `${weeks} ${plural(weeks, "semana", "semanas")}`;
    const months = Math.round(diffDays / 30);
    return `${months} ${plural(months, "mes", "meses")}`;
  }

  const absDays = Math.abs(diffDays);
  if (absDays === 1) return "Ontem";
  if (absDays < 7) return `- ${absDays} dias`;
  const weeks = Math.round(absDays / 7);
  if (absDays < 30) return `- ${weeks} ${plural(weeks, "semana", "semanas")}`;
  const months = Math.round(absDays / 30);
  return `- ${months} ${plural(months, "mes", "meses")}`;
};
