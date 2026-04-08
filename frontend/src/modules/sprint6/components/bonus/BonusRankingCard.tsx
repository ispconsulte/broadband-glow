import { motion, AnimatePresence } from "framer-motion";
import {
  Crown,
  Medal,
  ChevronDown,
  Clock,
  Target,
  Zap,
  Heart,
  Layers,
  PieChart,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Info,
  ClipboardCheck,
  Mail,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

import type { BonusConsultantCard, BonusScoreBreakdown } from "@/modules/sprint6/hooks/useBonusRealData";
import { formatHoursHuman } from "@/modules/tasks/utils";
import { BONUS_EVALUATION_CATEGORIES } from "@/modules/sprint6/bonusEvaluation";
import {
  money,
  scoreColor,
  scoreBg,
  levelLabel,
  levelColor,
} from "./BonusHelpers";

/* ── Unavailable Chip ──────────────────────────────────────────────── */
function NoData({ text = "Sem dado disponível" }: { text?: string }) {
  return <span className="text-[11px] text-muted-foreground/40 italic">{text}</span>;
}

/* ── Score Composition Section ─────────────────────────────────────── */
function iconForFactor(key: string) {
  if (key.includes("hard") || key.includes("on_time")) return Target;
  if (key.includes("soft") || key.includes("util")) return Zap;
  if (key.includes("people") || key.includes("health")) return Heart;
  return AlertCircle;
}

function colorForFactor(key: string) {
  if (key.includes("hard") || key.includes("on_time")) return { color: "bg-emerald-500", text: "text-emerald-400" };
  if (key.includes("soft") || key.includes("util")) return { color: "bg-blue-500", text: "text-blue-400" };
  if (key.includes("people") || key.includes("health")) return { color: "bg-purple-500", text: "text-purple-400" };
  return { color: "bg-amber-500", text: "text-amber-400" };
}

function ScoreComposition({
  breakdown,
  score,
  maxBonus,
  payout,
  hideMonetary = false,
}: {
  breakdown: BonusScoreBreakdown;
  score: number;
  maxBonus: number;
  payout: number;
  hideMonetary?: boolean;
}) {
  const gap = maxBonus - payout;
  const sorted = [...breakdown.factors].sort((a, b) => b.contribution - a.contribution);

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-foreground tracking-wide">Composição do Score</p>
        <div className={`rounded-lg px-2.5 py-1 ${scoreBg(score)}`}>
          <span className={`text-sm font-bold ${scoreColor(score)}`}>{score}%</span>
        </div>
      </div>

      {/* Quick insight: best + worst */}
      {best && worst && best.key !== worst.key && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03] px-2.5 py-2">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-emerald-400/70 font-semibold">Mais contribuiu</p>
              <p className="text-[11px] text-foreground font-medium truncate">{best.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-red-500/10 bg-red-500/[0.03] px-2.5 py-2">
            <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-red-400/70 font-semibold">Menor contribuição</p>
              <p className="text-[11px] text-foreground font-medium truncate">{worst.label}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stacked bar */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-card/30">
        {breakdown.factors.map((factor) => {
          const palette = colorForFactor(factor.key);
          const widthPct = Math.max(factor.contribution * 100, 0.5);
          return (
            <div
              key={factor.key}
              style={{ width: `${Math.max(factor.contribution * 100, 0.5)}%` }}
              className={`h-full ${palette.color}/60 first:rounded-l-full last:rounded-r-full`}
              title={`${factor.label}: ${Math.round(factor.contribution * 100)}%`}
            />
          );
        })}
      </div>

      {/* Factor detail rows */}
      <div className="grid gap-1.5 grid-cols-1 sm:grid-cols-2">
        {breakdown.factors.map((factor) => {
          const CfgIcon = iconForFactor(factor.key);
          const palette = colorForFactor(factor.key);
          const hasData = factor.raw != null || factor.normalized > 0 || factor.contribution > 0;
          const normalizedPct = Math.round(factor.normalized * 100);
          const contributionPct = Math.round(factor.contribution * 100);
          const isGood = factor.normalized >= 0.7;
          const isMid = factor.normalized >= 0.4;

          return (
            <div key={factor.key} className="flex items-center gap-2.5 rounded-xl border border-border/6 bg-card/15 p-2.5 transition-colors hover:bg-card/25">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${palette.color}/10`}>
                <CfgIcon className={`h-3.5 w-3.5 ${palette.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[11px] font-semibold text-foreground truncate">{factor.label}</p>
                  <span className={`shrink-0 text-[11px] font-bold ${isGood ? "text-emerald-400" : isMid ? "text-amber-400" : "text-red-400"}`}>
                    {contributionPct}%
                  </span>
                </div>
                <div className="mt-0.5">
                  {hasData ? (
                    <span className="text-[10px] text-muted-foreground/60">
                      {factor.rawDisplay ?? `${normalizedPct}%`} <span className="text-muted-foreground/30">→</span> peso {Math.round(factor.weight * 100)}% <span className="text-muted-foreground/30">→</span> {normalizedPct}% efic.
                    </span>
                  ) : (
                    <NoData text="Ainda não alimentado" />
                  )}
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-card/25 overflow-hidden">
                  <div
                    style={{ width: `${normalizedPct}%` }}
                    className={`h-full rounded-full ${palette.color}/40`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payout formula */}
      {!hideMonetary && (
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            <span className="text-foreground font-semibold">Score {score}%</span>
            {" × Teto "}
            <span className="text-foreground font-semibold">{money(maxBonus)}</span>
            {" = "}
            <span className="text-primary font-bold">{money(payout)}</span>
          </p>
          {gap > 0 && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Faltam <span className="text-foreground/60 font-medium">{money(gap)}</span> para atingir o teto ({Math.round((gap / maxBonus) * 100)}%)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ManualEvaluationSection({
  consultant,
  hideMonetary = false,
}: {
  consultant: BonusConsultantCard;
  hideMonetary?: boolean;
}) {
  const hasEvaluation = consultant.manualEvaluation.status === "submitted" || consultant.manualEvaluation.status === "draft";

  // Don't render the section at all if there's no evaluation data
  if (!hasEvaluation) return null;

  const summaryRows = [
    { label: "Hard Skill Manual", value: consultant.manualEvaluation.hardManualScore, payout: consultant.manualEvaluation.hardManualPayout },
    { label: "Soft Skills", value: consultant.manualEvaluation.softSkillScore, payout: consultant.manualEvaluation.softSkillPayout },
    { label: "People Skills", value: consultant.manualEvaluation.peopleSkillScore, payout: consultant.manualEvaluation.peopleSkillPayout },
  ].filter((item) => item.value != null);

  const highlights = consultant.manualEvaluation.rows
    .filter((row) => row.justificativa || row.pontos_de_melhoria)
    .slice(0, 4);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wide text-foreground">Avaliação Manual</p>
        <Badge
          variant="outline"
          className={`text-[10px] ${
            consultant.manualEvaluation.status === "submitted"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/20 bg-amber-500/10 text-amber-300"
          }`}
        >
          {consultant.manualEvaluation.status === "submitted"
            ? "Fechada"
            : "Em rascunho"}
        </Badge>
      </div>

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
                <p className="text-sm font-semibold text-foreground">
                  {row.category && BONUS_EVALUATION_CATEGORIES[row.category as keyof typeof BONUS_EVALUATION_CATEGORIES]
                    ? BONUS_EVALUATION_CATEGORIES[row.category as keyof typeof BONUS_EVALUATION_CATEGORIES].label
                    : (row.category ?? "categoria")}
                  {" · "}
                  {row.category && row.subtopic
                    ? BONUS_EVALUATION_CATEGORIES[row.category as keyof typeof BONUS_EVALUATION_CATEGORIES]?.subtopics.find((item) => item.key === row.subtopic)?.label ?? row.subtopic
                    : (row.subtopic ?? "subtópico")}
                </p>
                <span className="text-[11px] font-medium text-muted-foreground/60">
                  {row.score_1_10 != null ? `${Number(row.score_1_10)}/10` : "Não encontrado"}
                </span>
              </div>
              {row.justificativa && (
                <p className="mt-2 text-xs leading-relaxed text-foreground/85">
                  {row.justificativa}
                </p>
              )}
              {row.pontos_de_melhoria && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
                  Melhoria: {row.pontos_de_melhoria}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Ranking Card ─────────────────────────────────────────────── */
export function RankingCard({
  consultant,
  rank,
  expanded,
  onToggle,
  hideMonetary = false,
  canEvaluate = false,
  canSendReport = false,
  periodLabel,
  onEvaluate,
  onSendReport,
}: {
  consultant: BonusConsultantCard;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  hideMonetary?: boolean;
  canEvaluate?: boolean;
  canSendReport?: boolean;
  periodLabel?: string;
  onEvaluate?: (consultant: BonusConsultantCard) => void;
  onSendReport?: (consultant: BonusConsultantCard) => void;
}) {
  const isTopThree = rank <= 3;
  const rankColors =
    rank === 1
      ? "text-amber-300 bg-amber-500/15 border-amber-500/20"
      : rank === 2
      ? "text-slate-300 bg-slate-500/12 border-slate-400/15"
      : rank === 3
      ? "text-orange-300 bg-orange-500/12 border-orange-400/15"
      : "text-muted-foreground bg-card/30 border-border/10";

  

  return (
    <div className={`rounded-2xl border transition-all ${expanded ? "border-primary/20 bg-card/55" : "border-border/12 bg-card/35 hover:bg-card/45"}`}>
      {/* ── Collapsed Header ──────────────────────────────────────── */}
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 sm:gap-3 p-3 sm:p-4 text-left">
        <div className={`flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg sm:rounded-xl border text-xs sm:text-sm font-bold ${rankColors}`}>
          {isTopThree ? (rank === 1 ? <Crown className="h-4 w-4" /> : <Medal className="h-4 w-4" />) : rank}
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
          {!hideMonetary && (
            <div className="rounded-lg sm:rounded-xl border border-primary/15 bg-primary/[0.06] px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-center">
              <p className="text-sm sm:text-base font-bold text-primary">{money(consultant.payout)}</p>
              <p className="text-[10px] sm:text-[11px] text-primary/50">de {money(consultant.maxBonus)}</p>
            </div>
          )}
        </div>
        <div className="sm:hidden shrink-0 text-right ml-1">
          {!hideMonetary && <p className="text-xs font-bold text-primary">{money(consultant.payout)}</p>}
          <p className={`text-[11px] font-semibold ${scoreColor(consultant.score)}`}>{consultant.score}%</p>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-muted-foreground/50 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* ── Expanded Detail ───────────────────────────────────────── */}
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

              {/* ── Context Bar ─────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border/10 bg-white/[0.015] p-3.5 sm:p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-border/20 bg-card/30 text-[10px] text-muted-foreground/80">
                      Papel: {consultant.role === "admin" ? "Admin" : consultant.role === "gestor" ? "Gestor" : "Consultor"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        consultant.manualEvaluation.status === "submitted"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : consultant.manualEvaluation.status === "draft"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                          : "border-border/20 bg-card/30 text-muted-foreground/75"
                      }`}
                    >
                      {consultant.manualEvaluation.status === "submitted"
                        ? `Avaliado${consultant.manualEvaluation.periodKey ? ` · ${consultant.manualEvaluation.periodKey}` : ""}`
                        : consultant.manualEvaluation.status === "draft"
                        ? `Rascunho${consultant.manualEvaluation.periodKey ? ` · ${consultant.manualEvaluation.periodKey}` : ""}`
                        : "Sem avaliação manual"}
                    </Badge>
                    {consultant.coordinatorName && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        <UserRound className="h-3.5 w-3.5" />
                        Coordenação: <span className="text-foreground/80">{consultant.coordinatorName}</span>
                      </span>
                    )}
                  </div>
                </div>
                {(canEvaluate || canSendReport) && (
                  <div className="flex flex-wrap gap-2.5 shrink-0">
                    {canEvaluate && (
                      <button
                        type="button"
                        onClick={() => onEvaluate?.(consultant)}
                        className="group/btn relative inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-4 py-2 text-xs font-semibold text-primary shadow-[0_0_12px_hsl(var(--primary)/0.06)] outline-none transition-all duration-200 hover:border-primary/35 hover:bg-primary/12 hover:shadow-[0_0_20px_hsl(var(--primary)/0.1)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/35 focus-visible:border-primary/40 active:translate-y-0 active:shadow-[0_0_8px_hsl(var(--primary)/0.08)]"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:scale-110" />
                        Avaliar
                      </button>
                    )}
                    {canSendReport && (
                      <button
                        type="button"
                        onClick={() => onSendReport?.(consultant)}
                        className="group/btn relative inline-flex items-center gap-2 rounded-xl border border-border/16 bg-card/35 px-4 py-2 text-xs font-semibold text-foreground/75 shadow-[0_1px_3px_rgba(0,0,0,0.2)] outline-none transition-all duration-200 hover:border-primary/18 hover:bg-card/55 hover:text-foreground/90 hover:shadow-[0_2px_10px_rgba(0,0,0,0.25)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 focus-visible:border-primary/28 active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
                      >
                        <Mail className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:scale-110" />
                        Enviar Relatório
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Score Composition ──────────────────────────────── */}
              <ScoreComposition
                breakdown={consultant.scoreBreakdown}
                score={consultant.score}
                maxBonus={consultant.maxBonus}
                payout={consultant.payout}
                hideMonetary={hideMonetary}
              />

              <ManualEvaluationSection consultant={consultant} hideMonetary={hideMonetary} />

              {/* ── Raw Metrics ────────────────────────────────────── */}
              {(() => {
                const allMetrics = [
                  { icon: Clock, label: "Horas", value: consultant.hoursTracked > 0 ? formatHoursHuman(consultant.hoursTracked) : null },
                  { icon: Target, label: "No Prazo", value: consultant.onTimeRate != null ? `${Math.round(consultant.onTimeRate)}%` : null },
                  { icon: Zap, label: "Utilização", value: consultant.utilization != null ? `${Math.round(consultant.utilization)}%` : null },
                  { icon: Heart, label: "Carteira", value: consultant.healthScore != null ? `${consultant.healthScore} pts` : null },
                  { icon: Layers, label: "Tarefas", value: consultant.totalTasks > 0 ? `${consultant.completedTasks}/${consultant.totalTasks}` : null },
                  { icon: PieChart, label: "Projetos", value: consultant.projectCount > 0 ? String(consultant.projectCount) : null },
                  { icon: AlertCircle, label: "Atraso", value: consultant.overdueRate != null ? `${Math.round(consultant.overdueRate)}%` : null },
                ];
                const visibleMetrics = allMetrics.filter((m) => m.value != null);
                if (visibleMetrics.length === 0) return null;
                const colsClass = visibleMetrics.length <= 3
                  ? `grid-cols-${visibleMetrics.length}`
                  : visibleMetrics.length <= 4
                  ? "grid-cols-2 sm:grid-cols-4"
                  : "grid-cols-2 sm:grid-cols-4 lg:grid-cols-" + Math.min(visibleMetrics.length, 7);
                return (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/40 font-semibold mb-2 px-0.5">
                      Métricas do período{periodLabel ? ` (${periodLabel})` : ""}
                    </p>
                    <div className={`grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-${Math.min(visibleMetrics.length, 7)}`}>
                      {visibleMetrics.map((m) => (
                        <MetricTile key={m.label} icon={m.icon} label={m.label} value={m.value} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Disclaimer ─────────────────────────────────────── */}
              <div className="flex items-start gap-2 rounded-lg border border-border/6 bg-card/10 px-3 py-2">
                <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/25 mt-0.5" />
                <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
                  O valor exibido é o cálculo automático com base nos dados disponíveis. Aprovação final sujeita à validação gerencial.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Metric Tile ───────────────────────────────────────────────────── */
function MetricTile({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string | null }) {
  if (value == null) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/10 bg-card/25 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/[0.06]">
        <Icon className="h-4 w-4 text-primary/60" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}
