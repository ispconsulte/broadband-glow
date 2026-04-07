// ── Sprint 6.0 — Dashboard ROI (redesigned) ────────────────────────
import { useMemo, useState } from "react";
import { TrendingUp, AlertTriangle, DollarSign, Clock, BarChart3, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useRoiData } from "@/modules/sprint6/hooks/useRoiData";
import { useTasks } from "@/modules/tasks/api/useTasks";
import {
  Sprint6Filters,
  DEFAULT_SPRINT6_FILTERS,
  type Sprint6FilterState,
} from "@/modules/sprint6/components/Sprint6Filters";
import { RoiHoursChart } from "@/modules/sprint6/components/RoiHoursChart";
import { RoiVarianceTable } from "@/modules/sprint6/components/RoiVarianceTable";
import { RoiTrendChart } from "@/modules/sprint6/components/RoiTrendChart";

import { Badge } from "@/components/ui/badge";
import PageSkeleton from "@/components/ui/PageSkeleton";
import DataErrorCard from "@/components/ui/DataErrorCard";

/* ── Animations ──────────────────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

/* ── Section Card ────────────────────────────────────────────────── */
function SectionCard({
  title,
  icon: Icon,
  children,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/12 bg-card/40 backdrop-blur-sm overflow-hidden h-full">
      <div className="flex items-center justify-between gap-2 border-b border-border/8 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {badge}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/* ── KPI Card ────────────────────────────────────────────────────── */
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  delay = 0,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" as const }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] p-4 sm:p-5 transition-all duration-500 hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-xl"
      style={{
        background: "linear-gradient(145deg, hsl(270 50% 14% / 0.7), hsl(234 45% 10% / 0.5))",
      }}
    >
      <div
        className="absolute top-3 right-3 h-2 w-2 rounded-full opacity-50 group-hover:opacity-100 transition-opacity"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-center mb-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
          style={{ background: `${accent.replace(")", " / 0.15)")}` }}
        >
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
      </div>
      <p className="text-[11px] font-semibold text-white/40 text-center mb-1 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-2xl font-bold text-white/90 text-center">{value}</p>
      <p className="text-[10px] text-white/25 mt-0.5 text-center">{sub}</p>
    </motion.div>
  );
}

/* ── Empty State (compact) ───────────────────────────────────────── */
function CompactEmptyState() {
  return (
    <motion.div {...fadeUp(0.1)}>
      <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Base operacional pendente</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              O módulo precisa de apontamentos em <strong className="text-foreground">elapsed_times</strong> vinculados
              a projetos reconhecidos. Para ROI, cadastre receita e custo em <strong className="text-foreground">Governança de Dados</strong>.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline" className="text-[9px] bg-white/[0.03] text-white/40 border-white/10">
                1. Verificar apontamentos
              </Badge>
              <Badge variant="outline" className="text-[9px] bg-white/[0.03] text-white/40 border-white/10">
                2. Mapear projetos
              </Badge>
              <Badge variant="outline" className="text-[9px] bg-white/[0.03] text-white/40 border-white/10">
                3. Preencher financeiro
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */
export default function TesteRoiPage() {
  usePageSEO("Performance e ROI");
  const { session, loadingSession } = useAuth();
  const [filters, setFilters] = useState<Sprint6FilterState>(DEFAULT_SPRINT6_FILTERS);

  const { tasks } = useTasks({ accessToken: session?.accessToken, period: "180d" });
  const consultantOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      const name = String(t.responsible_name ?? t.consultant ?? t.responsavel ?? "").trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [tasks]);

  const roi = useRoiData({ accessToken: session?.accessToken, period: filters.period, projectId: filters.projectId });
  const hasProjectChartData = roi.filteredProjects.some((p) => p.hoursContracted > 0 || p.hoursUsed > 0);
  const visibleSummary = useMemo(() => {
    if (!roi.summary) return null;

    const totalContracted = roi.filteredProjects.reduce((sum, project) => sum + project.hoursContracted, 0);
    const totalUsed = roi.filteredProjects.reduce((sum, project) => sum + project.hoursUsed, 0);
    const overallVariance = totalContracted > 0
      ? Math.round(((totalUsed - totalContracted) / totalContracted) * 1000) / 10
      : 0;

    return {
      totalContracted,
      totalUsed,
      overallVariance,
      projects: roi.filteredProjects,
    };
  }, [roi.filteredProjects, roi.summary]);
  const roiCount = visibleSummary?.projects.filter((p) => p.roiPercent != null).length ?? 0;
  const visibleAvgRoi = useMemo(() => {
    const roiProjects = visibleSummary?.projects.filter((project) => project.roiPercent != null) ?? [];
    if (!roiProjects.length) return null;
    return Math.round(
      (roiProjects.reduce((sum, project) => sum + (project.roiPercent ?? 0), 0) / roiProjects.length) * 10,
    ) / 10;
  }, [visibleSummary]);
  const selectedProjectLabel = filters.projectId && roi.filteredProjects.length === 1
    ? roi.filteredProjects[0].projectName
    : null;

  if (loadingSession) return <PageSkeleton variant="analiticas" />;

  if (!session?.accessToken) {
    return (
      <div className="page-gradient w-full">
        <div className="mx-auto w-full max-w-[1900px] p-4 sm:p-5 md:p-8">
          <DataErrorCard
            title="Sessão não inicializada"
            message="Faça login novamente se o problema persistir."
          />
        </div>
      </div>
    );
  }

  const s = visibleSummary;
  const varianceColor = s
    ? s.overallVariance > 10
      ? "hsl(0 84% 60%)"
      : s.overallVariance < -10
      ? "hsl(160 84% 39%)"
      : "hsl(45 93% 58%)"
    : "hsl(0 0% 50%)";

  return (
    <div className="page-gradient w-full">
      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-4 sm:p-5 md:p-8">

        {/* ── Hero Header (Bonificação style) ─────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-2xl border border-white/[0.07] p-5 sm:p-6 lg:p-7"
          style={{
            background: "linear-gradient(145deg, hsl(222 40% 9% / 0.92), hsl(228 36% 8% / 0.72))",
          }}
        >
          <motion.div
            className="pointer-events-none absolute inset-y-0 right-0 w-[40%]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.3 }}
            style={{ background: "radial-gradient(circle at center, hsl(38 92% 50% / 0.10), transparent 65%)" }}
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <motion.div
                className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 shrink-0"
                animate={{
                  boxShadow: [
                    "0 0 10px hsl(38 92% 50% / 0.08)",
                    "0 0 24px hsl(38 92% 50% / 0.25)",
                    "0 0 10px hsl(38 92% 50% / 0.08)",
                  ],
                  scale: [1, 1.06, 1],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <motion.div
                  animate={{ y: [0, -3, 0], rotate: [0, 8, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <TrendingUp className="h-5 w-5 text-amber-400" />
                </motion.div>
              </motion.div>
              <motion.div
                className="min-w-0"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.2 }}
              >
                <h1 className="text-xl font-bold text-foreground tracking-tight sm:text-2xl">
                  Performance & ROI
                </h1>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                  Consumo, variância e retorno financeiro dos projetos
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ── Filters ─────────────────────────────────────────── */}
        <motion.div {...fadeUp(0.05)}>
          <Sprint6Filters
            filters={filters}
            onChange={setFilters}
            options={{ projects: roi.projectOptions, consultants: consultantOptions }}
          />
        </motion.div>

        {/* ── Status Banner (single line) ─────────────────────── */}
        {!roi.loading && (
          <motion.div {...fadeUp(0.08)}>
            <div
              className={`rounded-xl border px-4 py-2.5 text-xs flex items-center gap-2 ${
                roi.hasFinancials
                  ? "border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-300/80"
                  : "border-amber-500/15 bg-amber-500/[0.04] text-amber-200/70"
              }`}
            >
              <DollarSign className="h-3.5 w-3.5 shrink-0" />
              {roi.hasFinancials ? (
                <span>
                  ROI ativo em <strong>{roiCount}</strong> projeto{roiCount !== 1 ? "s" : ""}
                </span>
              ) : (
                <span>Cadastre receita e custo em Governança de Dados para calcular ROI</span>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {roi.error && !roi.loading && (
          <motion.div {...fadeUp(0.1)}>
            <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-2.5 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {roi.error}
            </div>
          </motion.div>
        )}

        {/* ── Loading ─────────────────────────────────────────── */}
        {roi.loading && !roi.summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/[0.06] p-5 animate-pulse"
                style={{ background: "linear-gradient(145deg, hsl(270 50% 14% / 0.7), hsl(234 45% 10% / 0.5))" }}
              >
                <div className="flex justify-center mb-3">
                  <div className="h-9 w-9 rounded-xl bg-white/[0.06]" />
                </div>
                <div className="h-3 w-16 mx-auto rounded bg-white/[0.06] mb-2" />
                <div className="h-6 w-12 mx-auto rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────── */}
        {!roi.loading && !roi.error && !roi.summary && <CompactEmptyState />}

        {/* ── Dashboard Content ───────────────────────────────── */}
        {s && !roi.loading && (
          <>
            {/* KPI Strip */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                label="Horas Orçadas"
                value={s.totalContracted > 0 ? `${Math.round(s.totalContracted)}h` : "Não encontrado"}
                sub={
                  selectedProjectLabel
                    ? selectedProjectLabel
                    : s.projects.length > 0
                    ? `${s.projects.length} projetos`
                    : "Sem projetos"
                }
                icon={Clock}
                accent="hsl(262 83% 58%)"
                delay={0.1}
              />
              <KpiCard
                label="Horas Realizadas"
                value={s.totalUsed > 0 ? `${Math.round(s.totalUsed)}h` : "Não encontrado"}
                sub={s.totalContracted > 0 ? `${Math.round((s.totalUsed / s.totalContracted) * 100)}% do orçado` : "Sem referência"}
                icon={BarChart3}
                accent="hsl(200 80% 55%)"
                delay={0.13}
              />
              <KpiCard
                label="Variância"
                value={`${s.overallVariance > 0 ? "+" : ""}${s.overallVariance}%`}
                sub={
                  s.overallVariance > 10
                    ? "Acima do orçado"
                    : s.overallVariance < -10
                    ? "Abaixo do orçado"
                    : "Dentro da faixa"
                }
                icon={s.overallVariance > 0 ? TrendingUp : TrendingUp}
                accent={varianceColor}
                delay={0.16}
              />
              <KpiCard
                label="ROI Médio"
                value={roi.hasFinancials && visibleAvgRoi != null ? `${visibleAvgRoi > 0 ? "+" : ""}${visibleAvgRoi}%` : "Não encontrado"}
                sub={
                  roi.hasFinancials
                    ? selectedProjectLabel
                      ? `${roiCount > 0 ? "ROI encontrado" : "Sem ROI neste projeto"}`
                      : `${roiCount} com dados`
                    : "Sem base financeira"
                }
                icon={DollarSign}
                accent={
                  visibleAvgRoi != null && visibleAvgRoi > 0
                    ? "hsl(160 84% 39%)"
                    : visibleAvgRoi != null && visibleAvgRoi < 0
                    ? "hsl(0 84% 60%)"
                    : "hsl(0 0% 50%)"
                }
                delay={0.19}
              />
              <KpiCard
                label="Alertas"
                value={String(s.projects.filter((project) => project.variancePercent > 10).length)}
                sub={`${s.projects.filter((project) => project.hoursContracted <= 0).length} sem orçamento`}
                icon={ShieldAlert}
                accent={s.projects.some((project) => project.variancePercent > 10) ? "hsl(0 84% 60%)" : "hsl(160 84% 39%)"}
                delay={0.22}
              />
            </div>

            {/* Main Grid: Chart + Trend */}
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
              {/* Hours Chart (3/5) */}
              <motion.div {...fadeUp(0.25)} className="lg:col-span-3">
                <SectionCard
                  title="Orçado vs Realizado"
                  icon={BarChart3}
                  badge={
                    hasProjectChartData ? (
                      <span className="text-[10px] text-muted-foreground">
                        {roi.filteredProjects.filter((p) => p.hoursContracted > 0 || p.hoursUsed > 0).length} projetos
                      </span>
                    ) : undefined
                  }
                >
                  {hasProjectChartData ? (
                    <RoiHoursChart projects={roi.filteredProjects} />
                  ) : roi.monthlyTrend.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">
                        Comparação por projeto indisponível — exibindo consumo mensal agregado.
                      </p>
                      <RoiTrendChart data={roi.monthlyTrend} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      Informação não encontrada
                    </div>
                  )}
                </SectionCard>
              </motion.div>

              {/* Trend Chart (2/5) */}
              <motion.div {...fadeUp(0.28)} className="lg:col-span-2">
                <SectionCard title="Tendência Mensal" icon={TrendingUp}>
                  {roi.monthlyTrend.length > 0 ? (
                    <RoiTrendChart data={roi.monthlyTrend} />
                  ) : (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                      Não encontrado
                    </div>
                  )}
                </SectionCard>
              </motion.div>
            </div>

            {/* Variance Table */}
            <motion.div {...fadeUp(0.3)}>
              <SectionCard
                title="Variância por Projeto"
                icon={DollarSign}
                badge={
                  roi.hasFinancials ? (
                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      ROI ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] bg-white/[0.04] text-muted-foreground border-border/20">
                      sem ROI
                    </Badge>
                  )
                }
              >
                <RoiVarianceTable projects={roi.filteredProjects} />
              </SectionCard>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
