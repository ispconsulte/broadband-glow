import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  ChevronDown,
  Clock,
  Heart,
  Layers,
  Target,
  UserRound,
  Zap,
  PieChart,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ClipboardCheck,
  Activity,
} from "lucide-react";

import type { BonusConsultantCard, BonusScoreBreakdown } from "@/modules/sprint6/hooks/useBonusRealData";
import type { TaskRecord } from "@/modules/tasks/types";
import { classifyTask } from "@/modules/analytics/hooks/useAnalyticsData";
import { formatHoursHuman } from "@/modules/tasks/utils";
import { BONUS_EVALUATION_CATEGORIES } from "@/modules/sprint6/bonusEvaluation";
import {
  money,
  scoreColor,
  scoreBg,
  levelLabel,
  levelColor,
} from "./BonusHelpers";
import AnalyticsProductivityPulse from "@/modules/analytics/components/AnalyticsProductivityPulse";
import AnalyticsVelocityChart from "@/modules/analytics/components/AnalyticsVelocityChart";

/* ── helpers ──────────────────────────────────────── */
function norm(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isNameMatch(taskResponsible: string, userName: string): boolean {
  const a = norm(taskResponsible);
  const b = norm(userName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  if (aParts.length >= 2 && bParts.length >= 2 && aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
  return false;
}

function iconForFactor(key: string) {
  if (key.includes("hard") || key.includes("on_time")) return Target;
  if (key.includes("soft") || key.includes("util")) return Zap;
  if (key.includes("people") || key.includes("health")) return Heart;
  return AlertCircle;
}

function colorForFactor(key: string) {
  if (key.includes("on_time")) return { color: "bg-emerald-500", text: "text-emerald-400" };
  if (key.includes("hard")) return { color: "bg-teal-500", text: "text-teal-400" };
  if (key.includes("util")) return { color: "bg-cyan-500", text: "text-cyan-400" };
  if (key.includes("soft")) return { color: "bg-blue-500", text: "text-blue-400" };
  if (key.includes("health")) return { color: "bg-purple-500", text: "text-purple-400" };
  if (key.includes("people")) return { color: "bg-indigo-500", text: "text-indigo-400" };
  return { color: "bg-sky-500", text: "text-sky-400" };
}

/* ── Metrics Grid ─────────────────────────────────── */
const METRIC_COLORS: Record<string, { bg: string; text: string }> = {
  Horas: { bg: "bg-blue-500/[0.08]", text: "text-blue-400" },
  "No Prazo": { bg: "bg-emerald-500/[0.08]", text: "text-emerald-400" },
  Utilização: { bg: "bg-cyan-500/[0.08]", text: "text-cyan-400" },
  Carteira: { bg: "bg-purple-500/[0.08]", text: "text-purple-400" },
  Tarefas: { bg: "bg-indigo-500/[0.08]", text: "text-indigo-400" },
  Projetos: { bg: "bg-sky-500/[0.08]", text: "text-sky-400" },
  Atraso: { bg: "bg-amber-500/[0.08]", text: "text-amber-400" },
};

function MetricTile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string | null }) {
  if (value == null) return null;
  const colors = METRIC_COLORS[label] ?? { bg: "bg-primary/[0.06]", text: "text-primary/60" };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/10 bg-card/25 p-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
        <Icon className={`h-4 w-4 ${colors.text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/* ── Composition Section ──────────────────────────── */
function CompositionView({ breakdown, score, hideMonetary, maxBonus, payout }: {
  breakdown: BonusScoreBreakdown; score: number; hideMonetary: boolean; maxBonus: number; payout: number;
}) {
  const sorted = [...breakdown.factors].sort((a, b) => b.contribution - a.contribution);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const gap = maxBonus - payout;

  return (
    <div className="space-y-3">
      {best && worst && best.key !== worst.key && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-1 text-[11px] font-medium text-emerald-300">
            <TrendingUp className="h-3 w-3" /> {best.label}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/15 bg-red-500/[0.06] px-3 py-1 text-[11px] font-medium text-red-300">
            <TrendingDown className="h-3 w-3" /> {worst.label}
          </span>
        </div>
      )}

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-card/30">
        {breakdown.factors.map((f) => {
          const palette = colorForFactor(f.key);
          return (
            <div
              key={f.key}
              style={{ width: `${Math.max(f.contribution * 100, 0.5)}%` }}
              className={`h-full ${palette.color}/60 first:rounded-l-full last:rounded-r-full`}
              title={`${f.label}: ${Math.round(f.contribution * 100)}%`}
            />
          );
        })}
      </div>

      <div className="grid gap-2 grid-cols-2">
        {breakdown.factors.map((f) => {
          const CfgIcon = iconForFactor(f.key);
          const palette = colorForFactor(f.key);
          const normalizedPct = Math.round(f.normalized * 100);
          const contributionPct = Math.round(f.contribution * 100);
          const isGood = f.normalized >= 0.7;
          const isMid = f.normalized >= 0.4;
          return (
            <div key={f.key} className="rounded-xl border border-border/8 bg-card/20 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${palette.color}/10`}>
                  <CfgIcon className={`h-3 w-3 ${palette.text}`} />
                </div>
                <p className="text-[11px] font-semibold text-foreground truncate flex-1">{f.label}</p>
                <span className={`text-xs font-bold ${isGood ? "text-emerald-400" : isMid ? "text-amber-400" : "text-red-400"}`}>
                  {contributionPct}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-card/30 overflow-hidden">
                <div style={{ width: `${normalizedPct}%` }} className={`h-full rounded-full ${palette.color}/50`} />
              </div>
              <p className="text-[10px] text-muted-foreground/50">peso {Math.round(f.weight * 100)}%</p>
            </div>
          );
        })}
      </div>

      {!hideMonetary && (
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            <span className="text-foreground font-semibold">Score {score}%</span> × Teto{" "}
            <span className="text-foreground font-semibold">{money(maxBonus)}</span> ={" "}
            <span className="text-primary font-bold">{money(payout)}</span>
          </p>
          {gap > 0 && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Faltam <span className="text-foreground/60 font-medium">{money(gap)}</span> para atingir o teto
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Manual Evaluation Section ────────────────────── */
function EvaluationView({ consultant, hideMonetary }: { consultant: BonusConsultantCard; hideMonetary: boolean }) {
  const hasEvaluation = consultant.manualEvaluation.status === "submitted" || consultant.manualEvaluation.status === "draft";
  if (!hasEvaluation) {
    return (
      <div className="rounded-xl border border-border/10 bg-card/20 p-6 text-center">
        <ClipboardCheck className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
        <p className="text-sm text-foreground/70 font-medium">Nenhuma avaliação manual registrada</p>
        <p className="text-xs text-muted-foreground/50 mt-1">A avaliação será exibida aqui quando o coordenador registrá-la.</p>
      </div>
    );
  }

  const summaryRows = [
    { label: "Hard Skill", value: consultant.manualEvaluation.hardManualScore, payout: consultant.manualEvaluation.hardManualPayout },
    { label: "Soft Skills", value: consultant.manualEvaluation.softSkillScore, payout: consultant.manualEvaluation.softSkillPayout },
    { label: "People Skills", value: consultant.manualEvaluation.peopleSkillScore, payout: consultant.manualEvaluation.peopleSkillPayout },
  ].filter((r) => r.value != null);

  const highlights = consultant.manualEvaluation.rows
    .filter((r) => r.justificativa || r.pontos_de_melhoria)
    .slice(0, 4);

  return (
    <div className="space-y-3">
      <Badge
        variant="outline"
        className={`text-[10px] ${
          consultant.manualEvaluation.status === "submitted"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-amber-500/20 bg-amber-500/10 text-amber-300"
        }`}
      >
        {consultant.manualEvaluation.status === "submitted"
          ? `Avaliação fechada${consultant.manualEvaluation.periodKey ? ` · ${consultant.manualEvaluation.periodKey}` : ""}`
          : `Rascunho${consultant.manualEvaluation.periodKey ? ` · ${consultant.manualEvaluation.periodKey}` : ""}`}
      </Badge>

      {summaryRows.length > 0 && (
        <div className={`grid gap-2 ${summaryRows.length === 1 ? "grid-cols-1" : summaryRows.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          {summaryRows.map((item) => (
            <div key={item.label} className="rounded-xl border border-border/8 bg-card/20 p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{item.label}</p>
              <p className="mt-1.5 text-xl font-bold text-foreground">{Math.round(item.value!)}/100</p>
              {!hideMonetary && item.payout != null && (
                <p className="mt-0.5 text-[11px] text-muted-foreground/55">estimativa: {money(item.payout)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {highlights.length > 0 && (
        <div className="space-y-2">
          {highlights.map((row) => (
            <div key={`${row.category}-${row.subtopic}`} className="rounded-xl border border-border/8 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">
                  {row.category && BONUS_EVALUATION_CATEGORIES[row.category as keyof typeof BONUS_EVALUATION_CATEGORIES]
                    ? BONUS_EVALUATION_CATEGORIES[row.category as keyof typeof BONUS_EVALUATION_CATEGORIES].label
                    : (row.category ?? "categoria")}
                  {" · "}
                  {row.category && row.subtopic
                    ? BONUS_EVALUATION_CATEGORIES[row.category as keyof typeof BONUS_EVALUATION_CATEGORIES]?.subtopics.find((s) => s.key === row.subtopic)?.label ?? row.subtopic
                    : (row.subtopic ?? "subtópico")}
                </p>
                <span className="text-[11px] font-medium text-muted-foreground/60">
                  {row.score_1_10 != null ? `${Number(row.score_1_10)}/10` : "—"}
                </span>
              </div>
              {row.justificativa && <p className="mt-1.5 text-xs leading-relaxed text-foreground/85">{row.justificativa}</p>}
              {row.pontos_de_melhoria && <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">Melhoria: {row.pontos_de_melhoria}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ───────────────────────────────── */
interface BonusUserDetailProps {
  consultant: BonusConsultantCard;
  expanded: boolean;
  onToggle: () => void;
  hideMonetary: boolean;
  periodLabel: string;
  allTasks: TaskRecord[];
}

export function BonusUserDetail({
  consultant,
  expanded,
  onToggle,
  hideMonetary,
  periodLabel,
  allTasks,
}: BonusUserDetailProps) {
  const [detailTab, setDetailTab] = useState("metricas");

  const userTasks = useMemo(() => {
    if (!consultant.name) return [];
    return allTasks.filter((t) => {
      const resp = String(t.responsible ?? t.responsavel ?? "");
      return isNameMatch(resp, consultant.name);
    });
  }, [allTasks, consultant.name]);

  const allMetrics = useMemo(() => [
    { icon: Clock, label: "Horas", value: consultant.hoursTracked > 0 ? formatHoursHuman(consultant.hoursTracked) : null },
    { icon: Target, label: "No Prazo", value: consultant.onTimeRate != null ? `${Math.round(consultant.onTimeRate)}%` : null },
    { icon: Zap, label: "Utilização", value: consultant.utilization != null ? `${Math.round(consultant.utilization)}%` : null },
    { icon: Heart, label: "Carteira", value: consultant.healthScore != null ? `${consultant.healthScore} pts` : null },
    { icon: Layers, label: "Tarefas", value: consultant.totalTasks > 0 ? `${consultant.completedTasks}/${consultant.totalTasks}` : null },
    { icon: PieChart, label: "Projetos", value: consultant.projectCount > 0 ? String(consultant.projectCount) : null },
    { icon: AlertCircle, label: "Atraso", value: consultant.overdueRate != null ? `${Math.round(consultant.overdueRate)}%` : null },
  ].filter((m) => m.value != null), [consultant]);

  // Force 5-column grid so all metrics stay side by side
  const metricsGridClass = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";

  return (
    <div className={`rounded-2xl border transition-all ${expanded ? "border-primary/20 bg-card/55" : "border-border/12 bg-card/35 hover:bg-card/45"}`}>
      {/* Card header — click to expand */}
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 sm:gap-3 p-3 sm:p-4 text-left">
        <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg sm:rounded-xl border text-primary bg-primary/10 border-primary/15">
          <UserRound className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <p className="truncate text-xs sm:text-sm font-bold text-foreground">{consultant.name}</p>
            {["senior", "pleno", "junior"].includes(consultant.level) && (
              <Badge variant="outline" className={`text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 ${levelColor(consultant.level)}`}>
                {levelLabel(consultant.level)}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/50 hidden sm:flex">
            {consultant.projectCount > 0 && <span>{consultant.projectCount} projeto{consultant.projectCount > 1 ? "s" : ""}</span>}
            {consultant.hoursTracked > 0 && <><span className="text-muted-foreground/20">·</span><span>{formatHoursHuman(consultant.hoursTracked)}</span></>}
            {consultant.completedTasks > 0 && <><span className="text-muted-foreground/20">·</span><span>{consultant.completedTasks}/{consultant.totalTasks} tarefas</span></>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 md:gap-3 shrink-0">
          <div className={`rounded-lg sm:rounded-xl border px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-center ${scoreBg(consultant.score)}`}>
            <p className={`text-sm sm:text-base font-bold ${scoreColor(consultant.score)}`}>{consultant.score}%</p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground">score</p>
          </div>
        </div>
        <div className="sm:hidden shrink-0 text-right ml-1">
          <p className={`text-[11px] font-semibold ${scoreColor(consultant.score)}`}>{consultant.score}%</p>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground/50 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded content — tabbed */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/10 px-3 sm:px-5 pb-4 sm:pb-5 pt-4 space-y-4">
              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList className="h-auto rounded-xl bg-card/40 border border-border/10 p-1 flex flex-wrap justify-start mb-4">
                  <TabsTrigger value="metricas" className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60">
                    <Layers className="h-3.5 w-3.5 mr-1.5" />
                    Métricas do Período
                  </TabsTrigger>
                  <TabsTrigger value="composicao" className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60">
                    <Target className="h-3.5 w-3.5 mr-1.5" />
                    Composição
                  </TabsTrigger>
                  <TabsTrigger value="notas" className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60">
                    <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
                    Notas
                  </TabsTrigger>
                  <TabsTrigger value="graficos" className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60">
                    <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                    Gráficos
                  </TabsTrigger>
                </TabsList>

                {/* ── Métricas ── */}
                <TabsContent value="metricas" className="mt-0 space-y-3">
                  {allMetrics.length > 0 ? (
                    <>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold px-0.5">
                        Indicadores · {periodLabel}
                      </p>
                      <div className={`grid gap-2.5 ${metricsGridClass}`}>
                        {allMetrics.map((m) => (
                          <MetricTile key={m.label} icon={m.icon} label={m.label} value={m.value} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-border/10 bg-card/20 p-6 text-center">
                      <p className="text-sm text-foreground/70">Sem métricas disponíveis para este período</p>
                    </div>
                  )}
                </TabsContent>

                {/* ── Composição ── */}
                <TabsContent value="composicao" className="mt-0">
                  <CompositionView
                    breakdown={consultant.scoreBreakdown}
                    score={consultant.score}
                    hideMonetary={hideMonetary}
                    maxBonus={consultant.maxBonus}
                    payout={consultant.payout}
                  />
                </TabsContent>

                {/* ── Notas / Avaliação ── */}
                <TabsContent value="notas" className="mt-0">
                  <EvaluationView consultant={consultant} hideMonetary={hideMonetary} />
                </TabsContent>

                {/* ── Gráficos ── */}
                <TabsContent value="graficos" className="mt-0 space-y-4">
                  {userTasks.length > 0 ? (
                    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                      <AnalyticsProductivityPulse tasks={userTasks} classifyTask={classifyTask} />
                      <AnalyticsVelocityChart tasks={userTasks} classifyTask={classifyTask} />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/10 bg-card/20 p-8 text-center">
                      <Activity className="h-7 w-7 mx-auto text-muted-foreground/20 mb-2" />
                      <p className="text-sm font-medium text-foreground/70">Sem tarefas suficientes para gráficos</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">
                        Quando houver tarefas vinculadas ao seu nome, os gráficos aparecerão aqui.
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
