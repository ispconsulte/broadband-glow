import { useEffect, useMemo, useState } from "react";
import { supabaseExt as supabase } from "@/lib/supabase";
import { useTasks } from "@/modules/tasks/api/useTasks";
import { useElapsedTimes } from "@/modules/tasks/api/useElapsedTimes";
import { useCapacityData } from "@/modules/sprint6/hooks/useCapacityData";
import { useClientHealthData } from "@/modules/sprint6/hooks/useClientHealthData";
import { useProjectFinancials } from "@/modules/sprint6/hooks/useProjectFinancials";
import {
  useBonusPersistenceData,
  type BonusInternalEvaluationRow,
  type BonusMetricBreakdownRow,
  type BonusScoreSnapshotRow,
  type BonusSourceStatusRow,
} from "@/modules/sprint6/hooks/useBonusPersistenceData";
import { parseDateValue, type TaskStatusKey } from "@/modules/tasks/utils";
import type { RoiPeriod } from "@/modules/sprint6/types";
import {
  averageNumbers,
  BONUS_EVALUATION_CATEGORIES,
  BONUS_MANUAL_WEIGHTS,
  getBonusCeiling,
  isBonusEligibleConsultant,
  normalizeBonusRole,
  normalizeBonusSeniority,
} from "@/modules/sprint6/bonusEvaluation";

type BonusCoverageStatus = "connected" | "partial" | "pending";

export interface BonusCoverageItem {
  id: string;
  label: string;
  status: BonusCoverageStatus;
  helper: string;
}

export interface BonusScoreFactorBreakdown {
  key: string;
  label: string;
  raw: number | null;
  normalized: number;
  weight: number;
  contribution: number;
  rawDisplay: string;
  dataSource: string;
  explanation: string;
}

export interface BonusScoreBreakdown {
  mode: "legacy" | "manual";
  formulaLabel: string;
  factors: BonusScoreFactorBreakdown[];
  total: number;
}

export interface BonusManualEvaluationSummary {
  hasManualEvaluation: boolean;
  status: "none" | "draft" | "submitted";
  periodKey: string | null;
  hardManualScore: number | null;
  softSkillScore: number | null;
  peopleSkillScore: number | null;
  hardManualPayout: number | null;
  softSkillPayout: number | null;
  peopleSkillPayout: number | null;
  lastSubmittedAt: string | null;
  rows: BonusInternalEvaluationRow[];
}

export interface BonusConsultantCard {
  userId: string | null;
  email?: string | null;
  name: string;
  level: string;
  role: "admin" | "gestor" | "consultor";
  department: string | null;
  coordinatorUserId: string | null;
  coordinatorName: string | null;
  score: number;
  payout: number;
  maxBonus: number;
  hoursTracked: number;
  totalTasks: number;
  completedTasks: number;
  onTimeRate: number | null;
  overdueRate: number | null;
  utilization: number | null;
  healthScore: number | null;
  projectCount: number;
  scoreBreakdown: BonusScoreBreakdown;
  manualEvaluation: BonusManualEvaluationSummary;
}

export interface BonusProjectSpotlight {
  projectId: number;
  projectName: string;
  receita: number;
  roi: number | null;
  margin: number | null;
  hoursUsed: number;
}

export interface BonusRevenueSummary {
  revenueTracked: number;
  estimatedCost: number;
  estimatedMargin: number | null;
  averageRoi: number | null;
  healthyClientsRatio: number | null;
  croMonthlyEstimate: number;
  croQuarterlyEstimate: number;
  annualStrategicEstimate: number;
  /** true when at least one project_financials row exists */
  hasFinancialSource: boolean;
  /** true when tracked hours exist for any project */
  hasTrackedHours: boolean;
  /** number of projects with financial data */
  financialProjectCount: number;
}

export interface BonusOverview {
  monthlyEstimatedPayout: number;
  connectedConsultants: number;
  avgConsultantScore: number | null;
  avgOnTimeRate: number | null;
  avgUtilization: number | null;
  dataConfidence: number;
}

export interface BonusPersistenceSummary {
  loading: boolean;
  error: string | null;
  snapshotCount: number;
  evaluationCount: number;
  snapshots: BonusScoreSnapshotRow[];
  consultantSnapshots: BonusScoreSnapshotRow[];
  commercialSnapshots: BonusScoreSnapshotRow[];
  revenueSnapshots: BonusScoreSnapshotRow[];
  breakdowns: BonusMetricBreakdownRow[];
  evaluations: BonusInternalEvaluationRow[];
  sourceStatusRows: BonusSourceStatusRow[];
  sourceStatuses: {
    sourceCode: string;
    sourceName: string;
    sourceKind: string;
    syncStatus: string;
    lastSyncAt: string | null;
  }[];
}

export interface UseBonusRealDataResult {
  loading: boolean;
  error: string | null;
  overview: BonusOverview;
  consultants: BonusConsultantCard[];
  revenue: BonusRevenueSummary;
  projects: BonusProjectSpotlight[];
  coverage: BonusCoverageItem[];
  persistence: BonusPersistenceSummary;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(date: Date) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function resolveStatus(statusRaw: string | number | undefined, deadline: Date | null): TaskStatusKey {
  if (typeof statusRaw === "number") {
    if (statusRaw === 5) return "done";
    if (deadline && deadline < new Date()) return "overdue";
    return "pending";
  }

  const normalized = String(statusRaw ?? "").trim().toLowerCase();
  if (["5", "done", "concluido", "concluído", "completed", "finalizado"].includes(normalized)) {
    return "done";
  }
  if (deadline && deadline < new Date()) return "overdue";
  if (normalized) return "pending";
  return "unknown";
}

function normalizeLevel(level: string | null) {
  return normalizeBonusSeniority(level) ?? "nao definido";
}

function consultantScoreFromMetrics(metrics: {
  onTimeRate: number | null;
  overdueRate: number | null;
  utilization: number | null;
  healthScore: number | null;
  manualEvaluation?: BonusManualEvaluationSummary | null;
}): { score: number; breakdown: BonusScoreBreakdown } {
  const onTimeNorm = metrics.onTimeRate != null ? clamp(metrics.onTimeRate / 95) : 0.55;
  const overdueNorm = metrics.overdueRate != null ? clamp(1 - metrics.overdueRate / 30) : 0.6;

  let utilizationNorm = 0.6;
  if (metrics.utilization != null) {
    const u = metrics.utilization;
    if (u >= 70 && u <= 95) utilizationNorm = 1;
    else if (u < 70) utilizationNorm = clamp(u / 70);
    else utilizationNorm = clamp(1 - (u - 95) / 45);
  }

  const healthNorm = metrics.healthScore != null ? clamp(metrics.healthScore / 80) : 0.65;

  if (metrics.manualEvaluation?.hasManualEvaluation) {
    const hardManualNorm = metrics.manualEvaluation.hardManualScore != null ? clamp(metrics.manualEvaluation.hardManualScore / 100) : 0;
    const softNorm = metrics.manualEvaluation.softSkillScore != null ? clamp(metrics.manualEvaluation.softSkillScore / 100) : 0;
    const peopleNorm = metrics.manualEvaluation.peopleSkillScore != null ? clamp(metrics.manualEvaluation.peopleSkillScore / 100) : 0;
    const total = clamp(
      onTimeNorm * BONUS_MANUAL_WEIGHTS.hardAuto +
      hardManualNorm * BONUS_MANUAL_WEIGHTS.hardManual +
      softNorm * BONUS_MANUAL_WEIGHTS.softSkill +
      peopleNorm * BONUS_MANUAL_WEIGHTS.peopleSkill,
    );

    const factors: BonusScoreFactorBreakdown[] = [
      {
        key: "hard_auto",
        label: "Hard Skill Automático",
        raw: metrics.onTimeRate,
        normalized: onTimeNorm,
        weight: BONUS_MANUAL_WEIGHTS.hardAuto,
        contribution: onTimeNorm * BONUS_MANUAL_WEIGHTS.hardAuto,
        rawDisplay: metrics.onTimeRate != null ? `${Math.round(metrics.onTimeRate)}% no prazo` : "Sem histórico suficiente",
        dataSource: "Bitrix / tarefas concluídas dentro do prazo",
        explanation: "Entrega no prazo apurada automaticamente a partir das tarefas fechadas no período.",
      },
      {
        key: "hard_manual",
        label: "Hard Skill Manual",
        raw: metrics.manualEvaluation.hardManualScore,
        normalized: hardManualNorm,
        weight: BONUS_MANUAL_WEIGHTS.hardManual,
        contribution: hardManualNorm * BONUS_MANUAL_WEIGHTS.hardManual,
        rawDisplay: metrics.manualEvaluation.hardManualScore != null ? `${Math.round(metrics.manualEvaluation.hardManualScore)} pts` : "Sem avaliação manual",
        dataSource: "Avaliação manual do coordenador",
        explanation: "Média dos subtópicos de qualidade técnica, conformidade documental e organização de evidências.",
      },
      {
        key: "soft_skill",
        label: "Soft Skills",
        raw: metrics.manualEvaluation.softSkillScore,
        normalized: softNorm,
        weight: BONUS_MANUAL_WEIGHTS.softSkill,
        contribution: softNorm * BONUS_MANUAL_WEIGHTS.softSkill,
        rawDisplay: metrics.manualEvaluation.softSkillScore != null ? `${Math.round(metrics.manualEvaluation.softSkillScore)} pts` : "Sem avaliação manual",
        dataSource: "Avaliação manual do coordenador",
        explanation: "Média dos subtópicos de organização, proatividade, comunicação e responsabilidade.",
      },
      {
        key: "people_skill",
        label: "People Skills",
        raw: metrics.manualEvaluation.peopleSkillScore,
        normalized: peopleNorm,
        weight: BONUS_MANUAL_WEIGHTS.peopleSkill,
        contribution: peopleNorm * BONUS_MANUAL_WEIGHTS.peopleSkill,
        rawDisplay: metrics.manualEvaluation.peopleSkillScore != null ? `${Math.round(metrics.manualEvaluation.peopleSkillScore)} pts` : "Sem avaliação manual",
        dataSource: "Avaliação manual do coordenador",
        explanation: "Média dos subtópicos de trabalho em equipe, relacionamento com cliente e receptividade a feedback.",
      },
    ];

    return {
      score: total,
      breakdown: {
        mode: "manual",
        formulaLabel: "Score manual ativo: hard auto 25%, hard manual 25%, soft 30%, people 20%",
        factors,
        total,
      },
    };
  }

  const W = { onTime: 0.38, overdue: 0.22, utilization: 0.20, health: 0.20 };
  const total = clamp(
    onTimeNorm * W.onTime +
    overdueNorm * W.overdue +
    utilizationNorm * W.utilization +
    healthNorm * W.health,
  );

  const factors: BonusScoreFactorBreakdown[] = [
    {
      key: "on_time",
      label: "Entregas no prazo",
      raw: metrics.onTimeRate,
      normalized: onTimeNorm,
      weight: W.onTime,
      contribution: onTimeNorm * W.onTime,
      rawDisplay: metrics.onTimeRate != null ? `${Math.round(metrics.onTimeRate)}%` : "Sem dado",
      dataSource: "Tarefas concluídas no período",
      explanation: "Mede a porcentagem de tarefas concluídas dentro do prazo.",
    },
    {
      key: "overdue",
      label: "Risco de atraso",
      raw: metrics.overdueRate,
      normalized: overdueNorm,
      weight: W.overdue,
      contribution: overdueNorm * W.overdue,
      rawDisplay: metrics.overdueRate != null ? `${Math.round(metrics.overdueRate)}%` : "Sem dado",
      dataSource: "Tarefas vencidas / em atraso",
      explanation: "Quanto menor o percentual de tarefas atrasadas, maior a contribuição para o score.",
    },
    {
      key: "utilization",
      label: "Aproveitamento",
      raw: metrics.utilization,
      normalized: utilizationNorm,
      weight: W.utilization,
      contribution: utilizationNorm * W.utilization,
      rawDisplay: metrics.utilization != null ? `${Math.round(metrics.utilization)}%` : "Sem dado",
      dataSource: "Horas registradas vs capacidade",
      explanation: "Compara as horas efetivamente registradas com a capacidade disponível do consultor.",
    },
    {
      key: "health",
      label: "Saúde da carteira",
      raw: metrics.healthScore,
      normalized: healthNorm,
      weight: W.health,
      contribution: healthNorm * W.health,
      rawDisplay: metrics.healthScore != null ? `${Math.round(metrics.healthScore)} pts` : "Sem dado",
      dataSource: "Health score dos clientes atendidos",
      explanation: "Avalia a saúde dos clientes associados ao consultor.",
    },
  ];

  return {
    score: total,
    breakdown: {
      mode: "legacy",
      formulaLabel: "Score legado: prazo 38%, atraso 22%, utilização 20%, saúde 20%",
      factors,
      total,
    },
  };
}

export function useBonusRealData(period: RoiPeriod = "180d", accessToken?: string | null, refreshKey = 0): UseBonusRealDataResult {
  const tasks = useTasks({ accessToken, period });
  const elapsed = useElapsedTimes({ accessToken, period });
  const capacity = useCapacityData({ accessToken, period });
  const health = useClientHealthData({ accessToken });
  const financials = useProjectFinancials(accessToken);
  const persistence = useBonusPersistenceData(period, refreshKey);
  const [clientNameById, setClientNameById] = useState<Map<number, string>>(new Map());
  const [activeUsers, setActiveUsers] = useState<
    {
      id: string;
      name: string;
      department: string | null;
      seniority: string | null;
      role: "admin" | "gestor" | "consultor";
      email?: string | null;
      bitrixUserId?: string | null;
    }[]
  >([]);
  const [coordinatorBySubordinateId, setCoordinatorBySubordinateId] = useState<Map<string, string>>(new Map());

  const normalizeName = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  useEffect(() => {
    let cancelled = false;

    const loadClients = async () => {
      if (!accessToken) {
        setClientNameById(new Map());
        setActiveUsers([]);
        return;
      }
      try {
        const [clientesRes, usersRes, legacyUsersRes, coordinatorLinksRes] = await Promise.all([
          supabase.from("clientes").select("cliente_id, nome") as any,
          supabase.from("users").select("id, name, department, seniority, role, email, bitrix_user_id").eq("active", true) as any,
          supabase.from("users").select("id, name, department, seniority_level, user_profile, email, bitrix_user_id").eq("active", true) as any,
          supabase.from("user_coordinator_links").select("coordinator_user_id, subordinate_user_id") as any,
        ]);
        if (cancelled) return;

        if (!clientesRes.error) {
          const next = new Map<number, string>();
          (clientesRes.data ?? []).forEach((row: { cliente_id: number; nome: string }) => {
            next.set(Number(row.cliente_id), String(row.nome ?? "").trim());
          });
          setClientNameById(next);
        }

        const userRows = !usersRes.error
          ? (usersRes.data ?? []).map((row: { id: string | number; name: string; department: string | null; seniority: string | null; role: string | null; email?: string | null; bitrix_user_id?: string | null }) => ({
              id: String(row.id ?? "").trim(),
              name: String(row.name ?? "").trim(),
              department: row.department ?? null,
              seniority: normalizeBonusSeniority(row.seniority ?? null),
              role: normalizeBonusRole(row.role ?? null),
              email: row.email ?? null,
              bitrixUserId: row.bitrix_user_id ? String(row.bitrix_user_id) : null,
            }))
          : !legacyUsersRes.error
          ? (legacyUsersRes.data ?? []).map((row: { id: string | number; name: string; department: string | null; seniority_level: string | null; user_profile: string | null; email?: string | null; bitrix_user_id?: string | null }) => ({
              id: String(row.id ?? "").trim(),
              name: String(row.name ?? "").trim(),
              department: row.department ?? null,
              seniority: normalizeBonusSeniority(row.seniority_level ?? null),
              role: normalizeBonusRole(row.user_profile ?? null),
              email: row.email ?? null,
              bitrixUserId: row.bitrix_user_id ? String(row.bitrix_user_id) : null,
            }))
          : null;

        if (userRows) {
          setActiveUsers(
            userRows.filter((row: { id: string; name: string }) => row.id && row.name),
          );
        }

        if (!coordinatorLinksRes.error) {
          const next = new Map<string, string>();
          (coordinatorLinksRes.data ?? []).forEach((row: { coordinator_user_id: string | number | null; subordinate_user_id: string | number | null }) => {
            if (!row.coordinator_user_id || !row.subordinate_user_id) return;
            next.set(String(row.subordinate_user_id), String(row.coordinator_user_id));
          });
          setCoordinatorBySubordinateId(next);
        }
      } catch {
        if (!cancelled) {
          setClientNameById(new Map());
          setActiveUsers([]);
          setCoordinatorBySubordinateId(new Map());
        }
      }
    };

    void loadClients();
    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshKey]);

  const manualEvaluationsByUserId = useMemo(() => {
    const map = new Map<string, BonusManualEvaluationSummary>();
    const consultantRows = persistence.evaluations.filter((row) =>
      row.evaluation_scope === "consultant" &&
      row.user_id &&
      typeof row.period_key === "string" &&
      row.period_key.length > 0,
    );

    const grouped = new Map<string, BonusInternalEvaluationRow[]>();
    consultantRows.forEach((row) => {
      const key = String(row.user_id);
      const rows = grouped.get(key) ?? [];
      rows.push(row);
      grouped.set(key, rows);
    });

    grouped.forEach((rowsForUser, userId) => {
      const latestPeriodKey = [...new Set(rowsForUser.map((row) => row.period_key))]
        .sort((a, b) => b.localeCompare(a))[0] ?? null;
      const rows = latestPeriodKey ? rowsForUser.filter((row) => row.period_key === latestPeriodKey) : rowsForUser;
      const submittedRows = rows.filter((row) => row.status === "submitted");
      const rowsToUse = submittedRows.length > 0 ? submittedRows : rows;
      const byCategory = {
        hard_skill_manual: rowsToUse.filter((row) => row.category === "hard_skill_manual"),
        soft_skill: rowsToUse.filter((row) => row.category === "soft_skill"),
        people_skill: rowsToUse.filter((row) => row.category === "people_skill"),
      };

      const hardManualScore = averageNumbers(byCategory.hard_skill_manual.map((row) => (row.score_1_10 ?? null) != null ? Number(row.score_1_10) * 10 : null));
      const softSkillScore = averageNumbers(byCategory.soft_skill.map((row) => (row.score_1_10 ?? null) != null ? Number(row.score_1_10) * 10 : null));
      const peopleSkillScore = averageNumbers(byCategory.people_skill.map((row) => (row.score_1_10 ?? null) != null ? Number(row.score_1_10) * 10 : null));

      map.set(userId, {
        hasManualEvaluation: rowsToUse.length > 0,
        status: submittedRows.length > 0 ? "submitted" : rowsToUse.length > 0 ? "draft" : "none",
        periodKey: latestPeriodKey,
        hardManualScore,
        softSkillScore,
        peopleSkillScore,
        hardManualPayout: hardManualScore != null ? Math.round(hardManualScore * BONUS_EVALUATION_CATEGORIES.hard_skill_manual.payoutPerPoint) : null,
        softSkillPayout: softSkillScore != null ? Math.round(softSkillScore * BONUS_EVALUATION_CATEGORIES.soft_skill.payoutPerPoint) : null,
        peopleSkillPayout: peopleSkillScore != null ? Math.round(peopleSkillScore * BONUS_EVALUATION_CATEGORIES.people_skill.payoutPerPoint) : null,
        lastSubmittedAt: rowsToUse.map((row) => row.submitted_at).sort((a, b) => b.localeCompare(a))[0] ?? null,
        rows: rowsToUse,
      });
    });

    return map;
  }, [persistence.evaluations]);

  const consultantCards = useMemo<BonusConsultantCard[]>(() => {
    const taskMap = new Map<string, {
      consultantKey: string;
      consultantName: string;
      responsibleId: string | null;
      projectId: number;
      clientName: string | null;
      status: TaskStatusKey;
      deadline: Date | null;
      closedDate: Date | null;
    }>();

    const consultantAcc = new Map<string, {
      consultantName: string;
      responsibleId: string | null;
      totalTasks: number;
      completedTasks: number;
      onTimeCompleted: number;
      tasksWithDeadlineDone: number;
      overdueTasks: number;
      hoursTracked: number;
      projectIds: Set<number>;
      clientNames: Set<string>;
    }>();

    for (const task of tasks.tasks) {
      const id = String(task.task_id ?? task.id ?? "");
      if (!id) continue;
      const consultantName = String(task.responsible_name ?? task.consultant ?? task.responsavel ?? "").trim() || "Sem responsável";
      const responsibleId = task.responsible_id != null ? String(task.responsible_id).trim() : null;
      const consultantKey = responsibleId ? `bitrix:${responsibleId}` : `name:${normalizeName(consultantName)}`;
      const deadline = parseDateValue(task.deadline ?? task.due_date ?? task.dueDate);
      const closedDate = parseDateValue((task as any).closed_date);
      const status = resolveStatus(task.status, deadline);
      const projectId = Number(task.project_id) || 0;
      const clientId = Number(task.projects?.cliente_id ?? 0) || 0;
      const clientName = clientId > 0 ? clientNameById.get(clientId) ?? null : null;

      taskMap.set(id, { consultantKey, consultantName, responsibleId, projectId, clientName, status, deadline, closedDate });

      const current = consultantAcc.get(consultantKey) ?? {
        consultantName,
        responsibleId,
        totalTasks: 0,
        completedTasks: 0,
        onTimeCompleted: 0,
        tasksWithDeadlineDone: 0,
        overdueTasks: 0,
        hoursTracked: 0,
        projectIds: new Set<number>(),
        clientNames: new Set<string>(),
      };

      current.totalTasks += 1;
      if (status === "done") current.completedTasks += 1;
      if (status === "overdue") current.overdueTasks += 1;
      if (status === "done" && deadline) {
        current.tasksWithDeadlineDone += 1;
        if (closedDate && closedDate <= deadline) current.onTimeCompleted += 1;
      }
      if (projectId > 0) current.projectIds.add(projectId);
      if (clientName) current.clientNames.add(clientName);

      consultantAcc.set(consultantKey, current);
    }

    for (const entry of elapsed.times) {
      const hours = (Number(entry.seconds) || 0) / 3600;
      if (hours <= 0) continue;
      const taskMeta = taskMap.get(String(entry.task_id ?? ""));
      if (!taskMeta?.consultantKey) continue;
      const current = consultantAcc.get(taskMeta.consultantKey);
      if (!current) continue;
      current.hoursTracked += hours;
    }

    const healthByName = new Map(
      (health.summary?.clients ?? []).map((client) => [client.clienteName.trim().toLowerCase(), client.healthScore]),
    );
    const capacityByName = new Map(
      capacity.topConsultants.map((consultant) => [consultant.name.trim().toLowerCase(), consultant]),
    );
    const activeUsersByBitrixId = new Map(
      activeUsers
        .filter((user) => user.bitrixUserId)
        .map((user) => [String(user.bitrixUserId), user] as const),
    );
    const activeUsersByName = new Map(
      activeUsers.map((user) => [normalizeName(user.name), user]),
    );
    const activeUsersById = new Map(
      activeUsers.map((user) => [user.id, user] as const),
    );

    return Array.from(consultantAcc.entries())
      .map(([, acc]) => {
        const normalizedConsultant = normalizeName(acc.consultantName);
        const matchedUser =
          (acc.responsibleId ? activeUsersByBitrixId.get(acc.responsibleId) : null) ??
          activeUsersByName.get(normalizedConsultant) ??
          activeUsers.find((user) => {
            const normalizedUser = normalizeName(user.name);
            return normalizedUser.includes(normalizedConsultant) || normalizedConsultant.includes(normalizedUser);
          }) ??
          null;

        if (!matchedUser) return null;
        if (!isBonusEligibleConsultant(matchedUser.name)) return null;

        const linkedHealth = Array.from(acc.clientNames)
          .map((clientName) => healthByName.get(clientName.trim().toLowerCase()))
          .filter((value): value is number => value != null);
        const healthScore = average(linkedHealth);
        const onTimeRate = acc.tasksWithDeadlineDone > 0 ? (acc.onTimeCompleted / acc.tasksWithDeadlineDone) * 100 : null;
        const overdueRate = acc.totalTasks > 0 ? (acc.overdueTasks / acc.totalTasks) * 100 : null;
        const capacityMeta =
          capacityByName.get(acc.consultantName.trim().toLowerCase()) ??
          capacity.topConsultants.find((consultant) => {
            const normalizedCapacity = normalizeName(consultant.name);
            const normalizedUser = normalizeName(matchedUser.name);
            return normalizedCapacity === normalizedUser;
          }) ??
          null;
        const score = consultantScoreFromMetrics({
          onTimeRate,
          overdueRate,
          utilization: capacityMeta?.utilizationPercent ?? null,
          healthScore,
          manualEvaluation: matchedUser ? manualEvaluationsByUserId.get(matchedUser.id) ?? null : null,
        });
        const maxBonus = getBonusCeiling(capacityMeta?.seniority ?? matchedUser.seniority ?? null);
        const coordinatorUserId = coordinatorBySubordinateId.get(matchedUser.id) ?? null;
        const coordinatorName = coordinatorUserId ? activeUsersById.get(coordinatorUserId)?.name ?? null : null;
        const manualEvaluation = manualEvaluationsByUserId.get(matchedUser.id) ?? {
          hasManualEvaluation: false,
          status: "none",
          periodKey: null,
          hardManualScore: null,
          softSkillScore: null,
          peopleSkillScore: null,
          hardManualPayout: null,
          softSkillPayout: null,
          peopleSkillPayout: null,
          lastSubmittedAt: null,
          rows: [],
        };

        const card: BonusConsultantCard = {
          userId: matchedUser.id,
          name: matchedUser.name,
          level: normalizeLevel(capacityMeta?.seniority ?? matchedUser.seniority ?? null),
          role: matchedUser.role,
          department: capacityMeta?.department ?? matchedUser.department ?? null,
          coordinatorUserId,
          coordinatorName,
          score: Math.round(score.score * 100),
          payout: Math.round(score.score * maxBonus),
          maxBonus,
          hoursTracked: Math.round(acc.hoursTracked * 10) / 10,
          totalTasks: acc.totalTasks,
          completedTasks: acc.completedTasks,
          onTimeRate: onTimeRate != null ? Math.round(onTimeRate) : null,
          overdueRate: overdueRate != null ? Math.round(overdueRate) : null,
          utilization: capacityMeta?.utilizationPercent ?? null,
          healthScore: healthScore != null ? Math.round(healthScore * 10) / 10 : null,
          projectCount: acc.projectIds.size,
          scoreBreakdown: score.breakdown,
          manualEvaluation,
        };
        if (matchedUser.email) card.email = matchedUser.email;
        return card;
      })
      .filter((value): value is NonNullable<typeof value> => value != null)
      .sort((a, b) => b.payout - a.payout || b.hoursTracked - a.hoursTracked);
  }, [tasks.tasks, elapsed.times, health.summary?.clients, capacity.topConsultants, clientNameById, activeUsers, manualEvaluationsByUserId, coordinatorBySubordinateId]);

  const projectSpotlights = useMemo<BonusProjectSpotlight[]>(() => {
    const roiProjects = new Map<number, { hoursUsed: number; roi: number | null; name: string }>();
    const { data: financialMap } = financials;

    for (const [projectId, fin] of financialMap.entries()) {
      roiProjects.set(projectId, {
        hoursUsed: 0,
        roi: null,
        name: `Projeto ${projectId}`,
      });
    }

    const taskProjectNames = new Map<number, string>();
    tasks.tasks.forEach((task) => {
      const projectId = Number(task.project_id) || 0;
      if (projectId > 0) {
        taskProjectNames.set(
          projectId,
          String(task.projects?.name ?? task.project_name ?? task.project ?? task.group_name ?? `Projeto ${projectId}`),
        );
      }
    });

    const hoursByProject = new Map<number, number>();
    const taskToProject = new Map<string, number>();
    tasks.tasks.forEach((task) => {
      const taskId = String(task.task_id ?? task.id ?? "");
      const projectId = Number(task.project_id) || 0;
      if (taskId && projectId > 0) taskToProject.set(taskId, projectId);
    });
    elapsed.times.forEach((row) => {
      const projectId = taskToProject.get(String(row.task_id ?? ""));
      if (!projectId) return;
      hoursByProject.set(projectId, (hoursByProject.get(projectId) ?? 0) + (Number(row.seconds) || 0) / 3600);
    });

    return Array.from(financialMap.entries())
      .map(([projectId, fin]) => {
        const hoursUsed = hoursByProject.get(projectId) ?? 0;
        const estimatedCost = fin.custo_hora > 0 ? fin.custo_hora * hoursUsed : fin.custo_total_estimado;
        const margin = fin.receita_projeto > 0 ? ((fin.receita_projeto - estimatedCost) / fin.receita_projeto) * 100 : null;
        const roi = estimatedCost > 0 ? ((fin.receita_projeto - estimatedCost) / estimatedCost) * 100 : null;
        return {
          projectId,
          projectName: taskProjectNames.get(projectId) ?? `Projeto ${projectId}`,
          receita: fin.receita_projeto,
          roi: roi != null ? Math.round(roi * 10) / 10 : null,
          margin: margin != null ? Math.round(margin * 10) / 10 : null,
          hoursUsed: Math.round(hoursUsed * 10) / 10,
        };
      })
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6);
  }, [financials, tasks.tasks, elapsed.times]);

  const revenueSummary = useMemo<BonusRevenueSummary>(() => {
    let revenueTracked = 0;
    let estimatedCost = 0;

    const hoursByProject = new Map<number, number>();
    const taskToProject = new Map<string, number>();
    tasks.tasks.forEach((task) => {
      const taskId = String(task.task_id ?? task.id ?? "");
      const projectId = Number(task.project_id) || 0;
      if (taskId && projectId > 0) taskToProject.set(taskId, projectId);
    });
    elapsed.times.forEach((row) => {
      const projectId = taskToProject.get(String(row.task_id ?? ""));
      if (!projectId) return;
      hoursByProject.set(projectId, (hoursByProject.get(projectId) ?? 0) + (Number(row.seconds) || 0) / 3600);
    });

    for (const [projectId, fin] of financials.data.entries()) {
      revenueTracked += fin.receita_projeto;
      const hoursUsed = hoursByProject.get(projectId) ?? 0;
      estimatedCost += fin.custo_hora > 0 ? fin.custo_hora * hoursUsed : fin.custo_total_estimado;
    }

    const estimatedMargin = revenueTracked > 0 ? ((revenueTracked - estimatedCost) / revenueTracked) * 100 : null;
    const healthyClients = (health.summary?.clients ?? []).filter((client) => (client.healthScore ?? 0) >= 70).length;
    const clientCount = health.summary?.clients.length ?? 0;
    const healthyClientsRatio = clientCount > 0 ? (healthyClients / clientCount) * 100 : null;

    const marginScore = estimatedMargin != null ? clamp(estimatedMargin / 30) : 0.5;
    const roiProjects = projectSpotlights.filter((project) => project.roi != null);
    const roiPositiveRatio = roiProjects.length
      ? roiProjects.filter((project) => (project.roi ?? 0) > 0).length / roiProjects.length
      : 0.4;
    const healthScore = healthyClientsRatio != null ? clamp(healthyClientsRatio / 80) : 0.5;
    const revopsScore = (marginScore * 0.4) + (roiPositiveRatio * 0.35) + (healthScore * 0.25);

    const hasFinancialSource = financials.data.size > 0;
    const totalHours = Array.from(hoursByProject.values()).reduce((s, v) => s + v, 0);
    const hasTrackedHours = totalHours > 0;

    return {
      revenueTracked: Math.round(revenueTracked),
      estimatedCost: Math.round(estimatedCost),
      estimatedMargin: estimatedMargin != null ? Math.round(estimatedMargin * 10) / 10 : null,
      averageRoi: average(roiProjects.map((project) => project.roi ?? 0)),
      healthyClientsRatio: healthyClientsRatio != null ? Math.round(healthyClientsRatio) : null,
      croMonthlyEstimate: Math.round(revopsScore * 1500),
      croQuarterlyEstimate: (healthyClientsRatio ?? 0) >= 80 && (estimatedMargin ?? 0) >= 30 ? 1000 : (healthyClientsRatio ?? 0) >= 70 ? 500 : 0,
      annualStrategicEstimate: revenueTracked >= 300000 && (estimatedMargin ?? 0) >= 30 ? 10000 : 0,
      hasFinancialSource,
      hasTrackedHours,
      financialProjectCount: financials.data.size,
    };
  }, [financials.data, tasks.tasks, elapsed.times, health.summary?.clients, projectSpotlights]);

  const derivedPersistence = useMemo(() => {
    const nowIso = new Date().toISOString();
    const currentMonthKey = monthKey(new Date());
    const currentQuarterKey = quarterKey(new Date());
    const persistedSnapshotKeys = new Set(
      persistence.snapshots.map((row) => `${row.snapshot_kind}:${row.period_key}:${row.subject_key}`),
    );

    const derivedSnapshots: BonusScoreSnapshotRow[] = [];
    const derivedBreakdowns: BonusMetricBreakdownRow[] = [];

    const pushBreakdown = (
      snapshotId: string,
      code: string,
      label: string,
      group: string,
      value: number | null,
      target: number | null,
      unit: string | null,
      details: Record<string, unknown>,
    ) => {
      derivedBreakdowns.push({
        id: `derived-breakdown-${snapshotId}-${code}`,
        snapshot_id: snapshotId,
        metric_code: code,
        metric_label: label,
        metric_group: group,
        metric_value: value,
        metric_target: target,
        metric_unit: unit,
        meets_target: value != null && target != null ? value >= target : null,
        details,
        source_entity: "dashboard_bonus_calculation",
        source_provenance: "calculated",
        source_record_key: code,
        source_updated_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });
    };

    consultantCards.forEach((consultant) => {
      const userId = consultant.userId;
      if (!userId) return;

      const subjectKey = `consultant:${userId}`;
      const snapshotKey = `consultant_monthly:${currentMonthKey}:${subjectKey}`;
      if (persistedSnapshotKeys.has(snapshotKey)) return;

      const snapshotId = `derived-consultant-${currentMonthKey}-${userId}`;
      derivedSnapshots.push({
        id: snapshotId,
        snapshot_kind: "consultant_monthly",
        period_type: "month",
        period_key: currentMonthKey,
        subject_key: subjectKey,
        user_id: userId,
        subject_role: consultant.level,
        score: consultant.score,
        payout_amount: consultant.payout,
        max_payout_amount: consultant.maxBonus,
        sync_status: "calculated",
        source_provenance: "calculated",
        source_updated_at: nowIso,
        calculated_at: nowIso,
        calculation_version: "dashboard-live-v1",
        explanation: {
          consultant_name: consultant.name,
          provenance: "calculated_from_live_operational_data",
          based_on: ["tasks", "elapsed_times", "capacity", "client_health"],
        },
        notes: "Snapshot derivado em tempo real a partir das fontes operacionais disponíveis.",
        created_at: nowIso,
        updated_at: nowIso,
      });

      pushBreakdown(snapshotId, "on_time_rate", "Entrega no prazo", "operacional", consultant.onTimeRate, 95, "%", {
        consultant_name: consultant.name,
      });
      pushBreakdown(snapshotId, "utilization", "Utilização", "capacidade", consultant.utilization, 70, "%", {
        consultant_name: consultant.name,
      });
      pushBreakdown(snapshotId, "health_score", "Saúde da carteira", "carteira", consultant.healthScore, 70, "pts", {
        consultant_name: consultant.name,
      });
      pushBreakdown(snapshotId, "tracked_hours", "Horas apontadas", "operacional", consultant.hoursTracked, null, "h", {
        consultant_name: consultant.name,
      });
    });

    const canDeriveManagementSnapshots =
      financials.data.size > 0 || (health.summary?.clients.length ?? 0) > 0 || consultantCards.length > 0;

    if (canDeriveManagementSnapshots) {
      const commercialSubjectKey = "cro:revops_monthly";
      const commercialSnapshotKey = `commercial_monthly:${currentMonthKey}:${commercialSubjectKey}`;
      if (!persistedSnapshotKeys.has(commercialSnapshotKey)) {
        const snapshotId = `derived-commercial-${currentMonthKey}`;
        const revopsScore = Math.round(clamp(revenueSummary.croMonthlyEstimate / 1500) * 100);
        derivedSnapshots.push({
          id: snapshotId,
          snapshot_kind: "commercial_monthly",
          period_type: "month",
          period_key: currentMonthKey,
          subject_key: commercialSubjectKey,
          user_id: null,
          subject_role: "cro",
          score: revopsScore,
          payout_amount: revenueSummary.croMonthlyEstimate,
          max_payout_amount: 1500,
          sync_status: "calculated",
          source_provenance: "calculated",
          source_updated_at: nowIso,
          calculated_at: nowIso,
          calculation_version: "dashboard-live-v1",
          explanation: {
            provenance: "calculated_from_project_financials_and_client_health",
            based_on: ["project_financials", "elapsed_times", "client_health"],
          },
          notes: "Snapshot derivado em tempo real para leitura gerencial; não substitui ingestão CRM.",
          created_at: nowIso,
          updated_at: nowIso,
        });

        pushBreakdown(snapshotId, "estimated_margin", "Margem estimada", "financeiro", revenueSummary.estimatedMargin, 30, "%", {});
        pushBreakdown(snapshotId, "healthy_clients_ratio", "Carteira saudável", "carteira", revenueSummary.healthyClientsRatio, 80, "%", {});
        pushBreakdown(snapshotId, "average_roi", "ROI médio", "financeiro", revenueSummary.averageRoi, null, "%", {});
      }

      const revenueSubjectKey = "cro:revenue_quarterly";
      const revenueSnapshotKey = `revenue_quarterly:${currentQuarterKey}:${revenueSubjectKey}`;
      if (!persistedSnapshotKeys.has(revenueSnapshotKey)) {
        const snapshotId = `derived-revenue-${currentQuarterKey}`;
        const quarterlyScore = Math.round(
          clamp(
            ((revenueSummary.healthyClientsRatio ?? 0) / 80) * 0.5 +
            ((revenueSummary.estimatedMargin ?? 0) / 30) * 0.5,
          ) * 100,
        );
        derivedSnapshots.push({
          id: snapshotId,
          snapshot_kind: "revenue_quarterly",
          period_type: "quarter",
          period_key: currentQuarterKey,
          subject_key: revenueSubjectKey,
          user_id: null,
          subject_role: "cro",
          score: quarterlyScore,
          payout_amount: revenueSummary.croQuarterlyEstimate,
          max_payout_amount: 1000,
          sync_status: "calculated",
          source_provenance: "calculated",
          source_updated_at: nowIso,
          calculated_at: nowIso,
          calculation_version: "dashboard-live-v1",
          explanation: {
            provenance: "calculated_from_financial_margin_and_health_mix",
            based_on: ["project_financials", "client_health"],
          },
          notes: revenueSummary.annualStrategicEstimate > 0
            ? "Snapshot trimestral calculado com gatilho estratégico anual já atingido no proxy financeiro."
            : "Snapshot trimestral calculado com base no proxy de margem e saúde da carteira; NRR real continua dependente de MRR histórico.",
          created_at: nowIso,
          updated_at: nowIso,
        });

        pushBreakdown(snapshotId, "quarterly_bonus_estimate", "Bônus trimestral estimado", "financeiro", revenueSummary.croQuarterlyEstimate, 1000, "BRL", {});
        pushBreakdown(snapshotId, "estimated_margin", "Margem estimada", "financeiro", revenueSummary.estimatedMargin, 30, "%", {});
        pushBreakdown(snapshotId, "healthy_clients_ratio", "Carteira saudável", "carteira", revenueSummary.healthyClientsRatio, 80, "%", {});
      }
    }

    return {
      snapshots: derivedSnapshots,
      consultantSnapshots: derivedSnapshots.filter((row) => row.snapshot_kind === "consultant_monthly"),
      commercialSnapshots: derivedSnapshots.filter((row) => row.snapshot_kind === "commercial_monthly"),
      revenueSnapshots: derivedSnapshots.filter((row) => row.snapshot_kind === "revenue_quarterly"),
      breakdowns: derivedBreakdowns,
    };
  }, [consultantCards, financials.data.size, health.summary?.clients.length, persistence.snapshots, revenueSummary]);

  const combinedSnapshots = useMemo(
    () => [...persistence.snapshots, ...derivedPersistence.snapshots],
    [persistence.snapshots, derivedPersistence.snapshots],
  );
  const combinedConsultantSnapshots = useMemo(
    () => [...persistence.consultantSnapshots, ...derivedPersistence.consultantSnapshots],
    [persistence.consultantSnapshots, derivedPersistence.consultantSnapshots],
  );
  const combinedCommercialSnapshots = useMemo(
    () => [...persistence.commercialSnapshots, ...derivedPersistence.commercialSnapshots],
    [persistence.commercialSnapshots, derivedPersistence.commercialSnapshots],
  );
  const combinedRevenueSnapshots = useMemo(
    () => [...persistence.revenueSnapshots, ...derivedPersistence.revenueSnapshots],
    [persistence.revenueSnapshots, derivedPersistence.revenueSnapshots],
  );
  const combinedBreakdowns = useMemo(
    () => [...persistence.breakdowns, ...derivedPersistence.breakdowns],
    [persistence.breakdowns, derivedPersistence.breakdowns],
  );

  const overview = useMemo<BonusOverview>(() => {
    const avgConsultantScore = average(consultantCards.map((consultant) => consultant.score));
    const avgOnTimeRate = average(
      consultantCards.map((consultant) => consultant.onTimeRate).filter((value): value is number => value != null),
    );
    const avgUtilization = average(
      consultantCards.map((consultant) => consultant.utilization).filter((value): value is number => value != null),
    );

    return {
      monthlyEstimatedPayout:
        consultantCards.reduce((sum, consultant) => sum + consultant.payout, 0) +
        revenueSummary.croMonthlyEstimate,
      connectedConsultants: consultantCards.length,
      avgConsultantScore: avgConsultantScore != null ? Math.round(avgConsultantScore) : null,
      avgOnTimeRate: avgOnTimeRate != null ? Math.round(avgOnTimeRate) : null,
      avgUtilization: avgUtilization != null ? Math.round(avgUtilization * 10) / 10 : null,
      dataConfidence: Math.round(
        clamp(
          (
            (tasks.tasks.length > 0 ? 0.3 : 0) +
            (elapsed.times.length > 0 ? 0.25 : 0) +
            (financials.data.size > 0 ? 0.25 : 0) +
            ((health.summary?.clients.length ?? 0) > 0 ? 0.2 : 0)
          ),
        ) * 100,
      ),
    };
  }, [consultantCards, revenueSummary, tasks.tasks.length, elapsed.times.length, financials.data.size, health.summary?.clients.length]);

  const coverage = useMemo<BonusCoverageItem[]>(() => [
    {
      id: "tasks",
      label: "Bitrix tarefas e horas",
      status: tasks.tasks.length > 0 && elapsed.times.length > 0 ? "connected" : tasks.error || elapsed.error ? "partial" : "pending",
      helper: "Entrega no prazo, backlog, volume e esforço por consultor.",
    },
    {
      id: "financials",
      label: "Financeiro dos projetos",
      status: financials.data.size > 0 ? "connected" : financials.error ? "partial" : "pending",
      helper: "Receita, custo estimado, margem e proxy de ROI para CRO.",
    },
    {
      id: "client-health",
      label: "Saúde da carteira",
      status: (health.summary?.clients.length ?? 0) > 0 ? "connected" : health.error ? "partial" : "pending",
      helper: "NPS, churn e health score vinculados à carteira atendida.",
    },
    {
      id: "crm",
      label: "CRM comercial",
      status: (() => {
        const crmSources = persistence.sourceStatuses.filter((row) =>
          row.entity_name === "crm_leads" || row.entity_name === "crm_deals" || row.entity_name === "crm_activities",
        );
        if (!crmSources.length) return "pending";
        if (crmSources.every((row) => row.sync_status === "success" || row.sync_status === "manual")) return "connected";
        if (crmSources.some((row) => row.sync_status === "partial" || row.sync_status === "error" || row.sync_status === "running")) return "partial";
        return "pending";
      })(),
      helper: "MQL, SQL, reuniões e comparecimento dependem dos snapshots e status de sync do bloco comercial.",
    },
    {
      id: "bonus-snapshots",
      label: "Snapshots de bonificação",
      status: persistence.snapshots.length > 0 ? "connected" : derivedPersistence.snapshots.length > 0 ? "partial" : persistence.error ? "partial" : "pending",
      helper:
        persistence.snapshots.length > 0
          ? "Snapshots persistidos por período já disponíveis no banco."
          : derivedPersistence.snapshots.length > 0
          ? "Snapshots calculados em tempo real já aparecem no dashboard, mas ainda não foram persistidos no banco."
          : "Snapshots mensais/trimestrais ainda não foram gerados a partir das fontes disponíveis.",
    },
    {
      id: "manual-evaluations",
      label: "Avaliações internas",
      status: persistence.evaluations.length > 0 ? "connected" : persistence.error ? "partial" : "pending",
      helper: "Soft skills, people skills e NPS manual quando o dado não vem nativamente do Bitrix.",
    },
  ], [tasks.tasks.length, elapsed.times.length, tasks.error, elapsed.error, financials.data.size, financials.error, health.summary?.clients.length, health.error, persistence.sourceStatuses, persistence.snapshots.length, persistence.evaluations.length, persistence.error, derivedPersistence.snapshots.length]);

  return {
    loading: tasks.loading || elapsed.loading || capacity.loading || health.loading || financials.loading || persistence.loading,
    error: tasks.error || elapsed.error || capacity.error || health.error || financials.error || persistence.error || null,
    overview,
    consultants: consultantCards,
    revenue: revenueSummary,
    projects: projectSpotlights,
    coverage,
    persistence: {
      loading: persistence.loading,
      error: persistence.error,
      snapshotCount: combinedSnapshots.length,
      evaluationCount: persistence.evaluations.length,
      snapshots: combinedSnapshots,
      consultantSnapshots: combinedConsultantSnapshots,
      commercialSnapshots: combinedCommercialSnapshots,
      revenueSnapshots: combinedRevenueSnapshots,
      breakdowns: combinedBreakdowns,
      evaluations: persistence.evaluations,
      sourceStatusRows: persistence.sourceStatuses,
      sourceStatuses: persistence.sourceStatuses.map((row) => ({
        sourceCode: row.source_code,
        sourceName: row.source_name,
        sourceKind: row.source_kind,
        syncStatus: row.sync_status,
        lastSyncAt: row.last_sync_at,
      })),
    },
  };
}
