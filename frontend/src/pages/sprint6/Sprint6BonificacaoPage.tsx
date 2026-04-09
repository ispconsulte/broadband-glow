import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Crown,
  Search,
  Target,
  TrendingUp,
  TrendingDown,
  PieChart,
  AlertCircle,
  Users,
  FileText,
  CalendarIcon,
  Filter,
  X,
  CalendarDays,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePageSEO } from "@/hooks/usePageSEO";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useBonusRealData, type BonusConsultantCard } from "@/modules/sprint6/hooks/useBonusRealData";
import { useSharedTasks } from "@/contexts/SharedTasksContext";
import type { RoiPeriod } from "@/modules/sprint6/types";
import PageSkeleton from "@/components/ui/PageSkeleton";
import DataErrorCard from "@/components/ui/DataErrorCard";

import {
  money,
  normalizeName,
  periodLabel,
} from "@/modules/sprint6/components/bonus/BonusHelpers";
import {
  SectionCard,
  InsightRow,
  EmptyInsight,
  ScoreDistribution,
} from "@/modules/sprint6/components/bonus/BonusSharedCards";
import { RankingCard } from "@/modules/sprint6/components/bonus/BonusRankingCard";
import { BonusEvaluationModal } from "@/modules/sprint6/components/bonus/BonusEvaluationModal";
import { BonusMonthlyReportModal } from "@/modules/sprint6/components/bonus/BonusMonthlyReportModal";
import { BonusTrendsSection } from "@/modules/sprint6/components/bonus/BonusTrendsSection";
import { BonusScoreComposition } from "@/modules/sprint6/components/bonus/BonusScoreComposition";
import { CollapsibleSection } from "@/modules/sprint6/components/bonus/CollapsibleSection";
import { BonusTeamTab } from "@/modules/sprint6/components/bonus/BonusTeamTab";
import { BonusUserDetail } from "@/modules/sprint6/components/bonus/BonusUserDetail";

/* ── Visibility tiers ────────────────────────────────────────────── */
function firstNameLower(name?: string | null): string {
  return (name ?? "").trim().split(" ")[0]?.toLowerCase() ?? "";
}

/** Talia = payment manager = full access to everything */
function isPaymentManager(userName?: string | null): boolean {
  return firstNameLower(userName) === "thalia" || firstNameLower(userName) === "talia";
}

/** Rafael, Tiago, Felipe = privileged coordinators: see scores + limited monetary */
const PRIVILEGED_COORDINATOR_NAMES = new Set(["rafael", "tiago", "felipe"]);
function isPrivilegedCoordinator(userName?: string | null): boolean {
  return PRIVILEGED_COORDINATOR_NAMES.has(firstNameLower(userName));
}

/** Users who should see PDF review reminder */
const PDF_REMINDER_NAMES = new Set(["rafael", "tiago", "thalia", "talia", "felipe"]);
function shouldShowPdfReminder(userName?: string | null): boolean {
  return PDF_REMINDER_NAMES.has(firstNameLower(userName));
}

/** Eligible consultant names for ranking */
const RANKING_ELIGIBLE_NAMES = new Set(["tiago", "thalia", "talia", "felipe", "rafael"]);
function isRankingEligible(consultantName: string): boolean {
  return RANKING_ELIGIBLE_NAMES.has(firstNameLower(consultantName));
}

/* ── Period options ──────────────────────────────────────────────── */
const PERIOD_OPTIONS: { value: RoiPeriod; label: string }[] = [
  { value: "30d", label: "Mensal" },
  { value: "90d", label: "Trimestral" },
  { value: "180d", label: "Semestral" },
  { value: "all", label: "Histórico" },
];


export default function Sprint6BonificacaoPage() {
  usePageSEO("Bonificação | Dashboard ISP");
  const { session, loadingSession } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<RoiPeriod>("180d");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [filterOpen, setFilterOpen] = useState(false);
  const [consultantFilter, setConsultantFilter] = useState("");
  const [activeMainTab, setActiveMainTab] = useState("ranking");
  const [search, setSearch] = useState("");
  const [evaluationFilter, setEvaluationFilter] = useState<"all" | "evaluated" | "pending">("all");
  const [expandedConsultant, setExpandedConsultant] = useState<string | null>(null);
  const [evaluationConsultant, setEvaluationConsultant] = useState<BonusConsultantCard | null>(null);
  const [reportConsultant, setReportConsultant] = useState<BonusConsultantCard | null>(null);
  const bonus = useBonusRealData(period, session?.accessToken, refreshKey);
  const sharedTasks = useSharedTasks();
  const allTasks = sharedTasks?.tasks ?? [];
  const permissionRole = session?.bonusRole ?? "consultor";

  const isTaliaFullAccess = isPaymentManager(session?.name);
  const isPrivileged = isPrivilegedCoordinator(session?.name);
  const canManageTeam = (session?.coordinatorOf ?? []).length > 0;
  const canSeeRanking = isTaliaFullAccess || isPrivileged;
  const canSeeAllEvaluations = isTaliaFullAccess;
  const hideMonetary = !isTaliaFullAccess;
  const showPdfReminder = shouldShowPdfReminder(session?.name);

  useEffect(() => {
    if (session && !loadingSession) {
      console.info("[Bonificação] Permissões:", {
        bonusRole: session.bonusRole,
        permissionRole,
        userName: session.name,
        canSeeRanking,
        canManageTeam,
        canSeeAllEvaluations,
        hideMonetary,
        userId: session.userId,
        coordinatorOf: session.coordinatorOf,
        totalConsultants: bonus.consultants.length,
      });
    }
  }, [session, loadingSession, permissionRole, canSeeRanking, canManageTeam, canSeeAllEvaluations, hideMonetary, bonus.consultants.length]);

  const visibleConsultants = useMemo(() => {
    if (isTaliaFullAccess) return bonus.consultants;
    if (canManageTeam) {
      return bonus.consultants.filter((consultant) =>
        consultant.userId === session?.userId ||
        (consultant.userId ? (session?.coordinatorOf ?? []).includes(consultant.userId) : false),
      );
    }
    return bonus.consultants.filter((consultant) => consultant.userId === session?.userId);
  }, [bonus.consultants, canManageTeam, isTaliaFullAccess, session?.coordinatorOf, session?.userId]);

  const myConsultant = useMemo(
    () => visibleConsultants.find((consultant) => consultant.userId === session?.userId) ?? visibleConsultants[0] ?? null,
    [visibleConsultants, session?.userId],
  );

  const rankingConsultants = useMemo(() => {
    if (!canSeeRanking) return [];
    return bonus.consultants.filter((consultant) => isRankingEligible(consultant.name));
  }, [bonus.consultants, canSeeRanking]);

  const subordinateConsultants = useMemo(() => {
    if (!canManageTeam) return [];
    return bonus.consultants.filter((consultant) =>
      consultant.userId != null && (session?.coordinatorOf ?? []).includes(consultant.userId),
    );
  }, [bonus.consultants, canManageTeam, session?.coordinatorOf]);

  const filteredConsultants = useMemo(() => {
    let result = rankingConsultants;
    const term = normalizeName(search);

    if (term) {
      result = result.filter((consultant) => normalizeName(consultant.name).includes(term));
    }

    if (evaluationFilter === "evaluated") {
      result = result.filter((consultant) => consultant.manualEvaluation.hasManualEvaluation);
    }

    if (evaluationFilter === "pending") {
      result = result.filter((consultant) => !consultant.manualEvaluation.hasManualEvaluation);
    }

    return result;
  }, [rankingConsultants, search, evaluationFilter]);

  const summaryConsultants = canSeeRanking ? rankingConsultants : myConsultant ? [myConsultant] : [];
  const topPerformer = rankingConsultants[0] ?? null;
  const needsAttention = useMemo(
    () => rankingConsultants.filter((consultant) => consultant.score < 60).slice(0, 3),
    [rankingConsultants],
  );
  const trendingUp = useMemo(
    () => rankingConsultants.filter((consultant) => consultant.score >= 75 && (consultant.onTimeRate == null || consultant.onTimeRate >= 60)).slice(0, 3),
    [rankingConsultants],
  );

  const totalHoursTracked = useMemo(
    () => summaryConsultants.reduce((sum, consultant) => sum + consultant.hoursTracked, 0),
    [summaryConsultants],
  );
  const totalCompletedTasks = useMemo(
    () => summaryConsultants.reduce((sum, consultant) => sum + consultant.completedTasks, 0),
    [summaryConsultants],
  );
  const totalTasks = useMemo(
    () => summaryConsultants.reduce((sum, consultant) => sum + consultant.totalTasks, 0),
    [summaryConsultants],
  );
  const completionRate = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;
  const hasActiveRankingFilters = search.trim().length > 0 || evaluationFilter !== "all";

  const availableTabs = useMemo(() => {
    const tabs: string[] = [];
    if (canSeeRanking) tabs.push("ranking");
    if (canManageTeam) tabs.push("team");
    if (canSeeAllEvaluations) tabs.push("all-evaluations");
    return tabs;
  }, [canManageTeam, canSeeAllEvaluations, canSeeRanking]);

  useEffect(() => {
    if (availableTabs.length === 0) return;
    if (!availableTabs.includes(activeMainTab)) {
      setActiveMainTab(availableTabs[0]);
    }
  }, [activeMainTab, availableTabs]);

  const waitingFirstSync =
    !bonus.loading && bonus.consultants.length === 0 && bonus.projects.length === 0 &&
    bonus.persistence.snapshotCount === 0 && bonus.persistence.sourceStatuses.length === 0;

  const noDataForPeriod =
    !bonus.loading && !waitingFirstSync && bonus.consultants.length === 0 &&
    bonus.projects.length === 0 && bonus.persistence.snapshotCount === 0;
  const noVisibleConsultantsForPermission =
    !bonus.loading && bonus.consultants.length > 0 && visibleConsultants.length === 0;
  const noOperationalConsultantsForPeriod =
    !bonus.loading && bonus.consultants.length === 0 && bonus.projects.length > 0;

  const statusBanner = waitingFirstSync
    ? { tone: "blue" as const, title: "Aguardando primeiro sync", message: `Sem carga inicial para ${periodLabel(period)}.` }
    : noDataForPeriod
    ? { tone: "amber" as const, title: "Sem dados no período", message: `Ajuste o período ou aguarde o próximo ciclo.` }
    : null;

  if (loadingSession) return <PageSkeleton variant="analiticas" />;

  if (!session?.accessToken) {
    return (
      <div className="page-gradient w-full">
        <div className="mx-auto w-full max-w-[1900px] p-4 sm:p-5 md:p-8">
          <DataErrorCard title="Sessão ainda não inicializada" message="Bonificação depende da sessão autenticada." />
        </div>
      </div>
    );
  }

  return (
    <div className="page-gradient w-full">
      <div className="mx-auto w-full max-w-[1800px] space-y-5 p-4 sm:p-5 md:p-6 lg:p-8">
        <div className="space-y-5">
          {/* Header */}
          <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.07]"
            style={{
              background: "linear-gradient(135deg, hsl(260 30% 11%) 0%, hsl(262 35% 15%) 40%, hsl(270 25% 12%) 100%)",
            }}
          >
            <div className="relative flex flex-col gap-2 p-4 sm:p-5 md:px-6 md:py-5">
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] shrink-0 backdrop-blur-sm shadow-lg shadow-black/30"
                  style={{
                    background: "linear-gradient(145deg, hsl(45 80% 30% / 0.5), hsl(45 60% 20% / 0.4))",
                  }}
                >
                  <Crown className="h-5 w-5 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground tracking-tight leading-tight">
                    Bonificação
                  </h1>
                  <p className="mt-0.5 text-xs sm:text-sm text-white/35 line-clamp-1">
                    {canSeeRanking ? "Ranking, desempenho e evolução da equipe" : "Seu desempenho e sua avaliação mais recente"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter bar — centered */}
          <div className="flex justify-center">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 rounded-xl border-border/15 bg-card/40 px-5 py-2.5 text-xs font-semibold text-foreground/80 hover:bg-card/60"
                >
                  <Filter className="h-3.5 w-3.5 text-muted-foreground/50" />
                  Filtros
                  {(period !== "180d" || dateFrom || consultantFilter) && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                      {[period !== "180d", !!dateFrom, !!consultantFilter].filter(Boolean).length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" sideOffset={8} className="w-80 rounded-2xl border-border/15 bg-card p-5 shadow-2xl backdrop-blur-xl space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">Filtros</p>
                  <button type="button" onClick={() => setFilterOpen(false)} className="text-muted-foreground/40 hover:text-foreground transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Period */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-semibold">Período</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PERIOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setPeriod(opt.value); setDateFrom(undefined); setDateTo(undefined); }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                          period === opt.value && !dateFrom
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-secondary/50 text-muted-foreground border border-border/10 hover:bg-secondary"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom date range with Calendar popovers */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-semibold flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" /> Período personalizado
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "justify-start text-left text-xs font-normal h-9 rounded-lg border-border/15 bg-secondary/30",
                            !dateFrom && "text-muted-foreground/50"
                          )}
                        >
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                          {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "De"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-xl border-border/15 bg-card shadow-2xl" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          locale={ptBR}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "justify-start text-left text-xs font-normal h-9 rounded-lg border-border/15 bg-secondary/30",
                            !dateTo && "text-muted-foreground/50"
                          )}
                        >
                          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                          {dateTo ? format(dateTo, "dd/MM/yyyy") : "Até"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-xl border-border/15 bg-card shadow-2xl" align="end">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          locale={ptBR}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Consultant filter (for Thalia) */}
                {isTaliaFullAccess && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-semibold">Consultor</p>
                    <select
                      value={consultantFilter}
                      onChange={(e) => setConsultantFilter(e.target.value)}
                      className="w-full rounded-lg border border-border/15 bg-secondary/30 px-3 py-2 text-xs text-foreground outline-none focus:border-primary/40 transition-colors"
                    >
                      <option value="">Todos os consultores</option>
                      {bonus.consultants.map((c) => (
                        <option key={c.userId ?? c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Clear */}
                {(period !== "180d" || dateFrom || consultantFilter) && (
                  <button
                    type="button"
                    onClick={() => { setPeriod("180d"); setDateFrom(undefined); setDateTo(undefined); setConsultantFilter(""); }}
                    className="w-full rounded-lg border border-border/10 bg-secondary/20 py-2 text-xs font-semibold text-muted-foreground/60 hover:text-foreground/80 transition-colors"
                  >
                    Limpar filtros
                  </button>
                )}
              </PopoverContent>
            </Popover>

            {/* Active filter summary */}
            {(period !== "180d" || dateFrom || consultantFilter) && (
              <span className="ml-3 self-center text-xs text-muted-foreground/50">
                {PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? "Semestral"}
                {dateFrom && ` · ${format(dateFrom, "dd/MM/yyyy")}${dateTo ? ` a ${format(dateTo, "dd/MM/yyyy")}` : ""}`}
                {consultantFilter && ` · ${consultantFilter}`}
              </span>
            )}
          </div>

          {showPdfReminder && (
            <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-5 py-4 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/15">
                <FileText className="h-4.5 w-4.5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-200">Lembrete: Revisão de Bonificação</p>
                <p className="mt-1 text-xs text-blue-200/60 leading-relaxed">
                  Não esqueça de revisar o sistema de bonificação e enviar os relatórios em PDF ao final deste mês.
                  Verifique as notas e avaliações de cada membro da equipe antes do fechamento.
                </p>
              </div>
            </div>
          )}

          {bonus.error && (
            <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-5 py-4 text-sm text-amber-200 space-y-1">
              <p className="font-semibold">Parece que encontramos um problema</p>
              <p className="text-xs text-amber-200/70 leading-relaxed">
                Tente recarregar a página ou sair e entrar novamente no sistema. Se o problema persistir, entre em contato com nossa equipe de desenvolvimento e informe a situação.
              </p>
            </div>
          )}

          {!bonus.loading && statusBanner && (
            <div className={`rounded-xl border px-4 py-3 ${statusBanner.tone === "blue" ? "border-blue-500/15 bg-blue-500/[0.04] text-blue-200" : "border-amber-500/15 bg-amber-500/[0.04] text-amber-200"}`}>
              <p className="text-sm font-semibold">{statusBanner.title}</p>
              <p className="mt-0.5 text-xs opacity-70">{statusBanner.message}</p>
            </div>
          )}

          <div className="space-y-3">
            {summaryConsultants.length > 0 && (
              <div className={`grid gap-2.5 ${canSeeRanking ? (isTaliaFullAccess ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3") : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"}`}>
                {[
                  canSeeRanking && {
                    label: "Score médio",
                    value: `${Math.round(summaryConsultants.reduce((sum, consultant) => sum + consultant.score, 0) / summaryConsultants.length)}%`,
                    sub: `${summaryConsultants.length} consultor${summaryConsultants.length > 1 ? "es" : ""} · ${periodLabel(period)}`,
                    color: "border-primary/12 bg-primary/[0.04]",
                    valueColor: "text-primary",
                  },
                  isTaliaFullAccess && {
                    label: "Payout total",
                    value: money(summaryConsultants.reduce((sum, consultant) => sum + consultant.payout, 0)),
                    sub: `estimativa ${periodLabel(period)}`,
                    color: "border-emerald-500/12 bg-emerald-500/[0.04]",
                    valueColor: "text-emerald-400",
                  },
                  {
                    label: "Tarefas concluídas",
                    value: `${totalCompletedTasks}/${totalTasks}`,
                    sub: completionRate > 0 ? `${completionRate}% de conclusão · ${periodLabel(period)}` : `sem tarefas no período ${periodLabel(period)}`,
                    color: "border-blue-500/12 bg-blue-500/[0.04]",
                    valueColor: "text-blue-400",
                  },
                  {
                    label: "Horas registradas",
                    value: `${Math.round(totalHoursTracked)}h`,
                    sub: summaryConsultants.length > 0 ? `média de ${Math.round(totalHoursTracked / summaryConsultants.length || 0)}h/pessoa · ${periodLabel(period)}` : `nenhuma hora · ${periodLabel(period)}`,
                    color: "border-amber-500/12 bg-amber-500/[0.04]",
                    valueColor: "text-amber-400",
                  },
                  !canSeeRanking && {
                    label: "Meu Score",
                    value: myConsultant ? `${myConsultant.score}%` : "—",
                    sub: periodLabel(period),
                    color: "border-primary/12 bg-primary/[0.04]",
                    valueColor: "text-primary",
                  },
                ].filter(Boolean).map((item: any) => (
                  <div key={item.label} className={`rounded-xl border p-3.5 ${item.color}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">{item.label}</p>
                    <p className={`mt-1.5 text-lg font-bold leading-none ${item.valueColor}`}>{item.value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/50">{item.sub}</p>
                  </div>
                ))}
              </div>
            )}

            {availableTabs.length > 0 ? (
              <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-4">
                <TabsList className="h-auto rounded-xl bg-card/40 border border-border/10 p-1 flex flex-wrap justify-start">
                  {canSeeRanking && (
                    <TabsTrigger
                      value="ranking"
                      className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
                    >
                      <Crown className="h-3.5 w-3.5 mr-1.5" />
                      Ranking Geral
                    </TabsTrigger>
                  )}
                  {canManageTeam && (
                    <TabsTrigger
                      value="team"
                      className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
                    >
                      <Users className="h-3.5 w-3.5 mr-1.5" />
                      Minha Equipe
                      {subordinateConsultants.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-bold bg-primary/10 text-primary rounded-md px-1.5 py-0.5">
                          {subordinateConsultants.length}
                        </span>
                      )}
                    </TabsTrigger>
                  )}
                  {canSeeAllEvaluations && (
                    <TabsTrigger
                      value="all-evaluations"
                      className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
                    >
                      <Users className="h-3.5 w-3.5 mr-1.5" />
                      Todas as Avaliações
                    </TabsTrigger>
                  )}
                </TabsList>

                {canSeeRanking && (
                  <TabsContent value="ranking" className="mt-0 space-y-3">
                    {renderRankingContent()}
                  </TabsContent>
                )}

                {canManageTeam && (
                  <TabsContent value="team" className="mt-0">
                    <BonusTeamTab
                      subordinates={subordinateConsultants}
                      session={session}
                      periodLabel={periodLabel(period)}
                      onEvaluate={setEvaluationConsultant}
                      onSendReport={setReportConsultant}
                    />
                  </TabsContent>
                )}

                {canSeeAllEvaluations && (
                  <TabsContent value="all-evaluations" className="mt-0">
                    <BonusTeamTab
                      subordinates={bonus.consultants}
                      session={session}
                      periodLabel={periodLabel(period)}
                      onEvaluate={setEvaluationConsultant}
                      onSendReport={setReportConsultant}
                    />
                  </TabsContent>
                )}
              </Tabs>
            ) : canSeeRanking ? (
              <div className="space-y-3">{renderRankingContent()}</div>
            ) : (
              <div className="space-y-3">{renderOwnContent()}</div>
            )}
          </div>
        </div>
      </div>

      <BonusEvaluationModal
        open={Boolean(evaluationConsultant)}
        consultant={evaluationConsultant}
        session={session}
        onSaved={() => setRefreshKey((current) => current + 1)}
        onOpenChange={(open) => {
          if (!open) setEvaluationConsultant(null);
        }}
      />

      <BonusMonthlyReportModal
        open={Boolean(reportConsultant)}
        consultant={reportConsultant}
        session={session}
        hideMonetary={hideMonetary}
        onSent={() => setRefreshKey((current) => current + 1)}
        onOpenChange={(open) => {
          if (!open) setReportConsultant(null);
        }}
      />
    </div>
  );

  function renderOwnContent() {
    if (!myConsultant) {
      return (
        <div className="rounded-2xl border border-border/15 bg-card/35 p-10 text-center space-y-2.5">
          <p className="text-sm font-semibold text-foreground/70">
            {waitingFirstSync
              ? "Os dados ainda estão sendo carregados"
              : noVisibleConsultantsForPermission
              ? "Nenhum dado visível para este perfil"
              : "Seus dados ainda não estão disponíveis"}
          </p>
          <p className="text-xs text-muted-foreground/50 max-w-md mx-auto leading-relaxed">
            {waitingFirstSync
              ? "A primeira carga de tarefas e horas acontece automaticamente. Assim que estiver pronta, seus dados aparecerão aqui."
              : "Quando houver tarefas e horas vinculadas ao seu usuário no período selecionado, este painel será preenchido automaticamente."}
          </p>
        </div>
      );
    }

    return (
      <BonusUserDetail
        consultant={myConsultant}
        expanded={expandedConsultant === myConsultant.name}
        onToggle={() => setExpandedConsultant(expandedConsultant === myConsultant.name ? null : myConsultant.name)}
        hideMonetary={true}
        periodLabel={periodLabel(period)}
        allTasks={allTasks}
      />
    );
  }

  function renderRankingContent() {
    return (
      <>
        <CollapsibleSection
          title="Sinais rápidos"
          icon={TrendingUp}
          summary={
            rankingConsultants.length > 0
              ? `${trendingUp.length > 0 ? `${trendingUp.length} em destaque` : "Nenhum destaque"} · ${needsAttention.length > 0 ? `${needsAttention.length} precisam de atenção` : "Todos acima de 60%"}`
              : "Aguardando dados de consultores"
          }
        >
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <SectionCard title="Quem está mandando bem" icon={TrendingUp} compact badge={trendingUp.length > 0 ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 rounded-md px-1.5 py-0.5">{trendingUp.length}</span> : undefined}>
              {trendingUp.length > 0 ? (
                <div className="space-y-2">
                  {trendingUp.map((consultant) => (
                    <div key={consultant.name}>
                      <InsightRow name={consultant.name} score={consultant.score} payout={consultant.payout} icon={TrendingUp} color="emerald" hideMonetary={hideMonetary} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyInsight text="Ainda não há consultores com score acima de 75% e entregas em dia." />
              )}
            </SectionCard>

            <SectionCard title="Quem precisa de atenção" icon={AlertCircle} compact badge={needsAttention.length > 0 ? <span className="text-[10px] font-bold text-red-400 bg-red-500/10 rounded-md px-1.5 py-0.5">{needsAttention.length}</span> : undefined}>
              {needsAttention.length > 0 ? (
                <div className="space-y-2">
                  {needsAttention.map((consultant) => (
                    <div key={consultant.name}>
                      <InsightRow name={consultant.name} score={consultant.score} payout={consultant.payout} icon={TrendingDown} color="red" hideMonetary={hideMonetary} />
                    </div>
                  ))}
                </div>
              ) : rankingConsultants.length > 0 ? (
                <EmptyInsight text="Todos acima de 60%." />
              ) : (
                <EmptyInsight text="Sem dados neste período." />
              )}
            </SectionCard>

            <SectionCard title="Distribuição da equipe" icon={PieChart} compact badge={rankingConsultants.length > 0 ? <span className="text-[10px] font-bold text-muted-foreground bg-white/[0.05] rounded-md px-1.5 py-0.5">{rankingConsultants.length} pessoas</span> : undefined}>
              {rankingConsultants.length > 0 ? (
                <ScoreDistribution consultants={rankingConsultants} />
              ) : (
                <EmptyInsight text="Sem dados de scores calculados." />
              )}
            </SectionCard>
          </div>
        </CollapsibleSection>

        {isTaliaFullAccess && (
          <CollapsibleSection
            title="Score do Consultor"
            icon={Target}
            summary={
              topPerformer
                ? `Melhor score: ${topPerformer.score}% (${topPerformer.name})`
                : "Veja como o score é composto e o teto por nível"
            }
          >
            <BonusScoreComposition consultants={rankingConsultants} />
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Evolução ao longo do tempo"
          icon={TrendingUp}
          summary={
            bonus.persistence.consultantSnapshots.length > 0
              ? `${new Set(bonus.persistence.consultantSnapshots.filter((snapshot) => snapshot.period_type === "month").map((snapshot) => snapshot.period_key)).size} meses com dados registrados`
              : "O histórico aparecerá quando houver períodos gravados"
          }
        >
          <BonusTrendsSection
            consultants={rankingConsultants}
            consultantSnapshots={bonus.persistence.consultantSnapshots.filter((snapshot) => !snapshot.user_id || rankingConsultants.some((consultant) => consultant.userId === snapshot.user_id))}
          />
        </CollapsibleSection>

        <div id="bonus-ranking">
          <CollapsibleSection
            title="Ranking de Consultores"
            icon={Crown}
            summary={
              topPerformer
                ? `${rankingConsultants.length} consultores · Líder: ${topPerformer.name} com ${topPerformer.score}%`
                : "Nenhum consultor encontrado neste período"
            }
            badge={rankingConsultants.length > 0 ? <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-md px-1.5 py-0.5">{rankingConsultants.length}</span> : undefined}
          >
            <div className="space-y-4">
              <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
                <div className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar consultor..."
                    className="h-10 rounded-xl border-border/15 bg-card/40 pl-10 text-sm"
                  />
                </div>

                <select
                  value={evaluationFilter}
                  onChange={(event) => setEvaluationFilter(event.target.value as "all" | "evaluated" | "pending")}
                  className="h-10 rounded-xl border border-border/15 bg-card/40 px-3 text-sm text-foreground outline-none transition-colors hover:bg-card/55 focus:border-primary/30"
                >
                  <option value="all">Todas as avaliações</option>
                  <option value="evaluated">Somente avaliados</option>
                  <option value="pending">Somente pendentes</option>
                </select>

                {hasActiveRankingFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setEvaluationFilter("all");
                    }}
                    className="h-10 rounded-xl border border-border/15 bg-card/30 px-4 text-sm font-semibold text-foreground/80 transition-colors hover:bg-card/50"
                  >
                    Limpar filtros
                  </button>
                ) : (
                  <div />
                )}
              </div>

              <div className="space-y-3">
                {filteredConsultants.map((consultant, index) => {
                  const canManageConsultant = consultant.userId != null && (session?.coordinatorOf ?? []).includes(consultant.userId);

                  return (
                    <div key={consultant.userId ?? consultant.name}>
                      <RankingCard
                        consultant={consultant}
                        rank={index + 1}
                        expanded={expandedConsultant === consultant.name}
                        onToggle={() => setExpandedConsultant(expandedConsultant === consultant.name ? null : consultant.name)}
                        hideMonetary={hideMonetary}
                        periodLabel={periodLabel(period)}
                        canEvaluate={isTaliaFullAccess || canManageConsultant}
                        canSendReport={isTaliaFullAccess || canManageConsultant}
                        onEvaluate={setEvaluationConsultant}
                        onSendReport={setReportConsultant}
                      />
                    </div>
                  );
                })}

                {filteredConsultants.length === 0 && (
                  <div className="rounded-2xl border border-border/15 bg-card/35 p-10 text-center space-y-2.5">
                    <p className="text-sm font-semibold text-foreground/70">
                      {waitingFirstSync
                        ? "Os dados ainda estão sendo carregados"
                        : noDataForPeriod
                        ? "Nenhum resultado neste período"
                        : noOperationalConsultantsForPeriod
                        ? "Ainda não há base operacional suficiente"
                        : hasActiveRankingFilters
                        ? "Nenhum consultor encontrado com os filtros atuais"
                        : "Nenhum consultor disponível"}
                    </p>
                    <p className="text-xs text-muted-foreground/50 max-w-md mx-auto leading-relaxed">
                      {waitingFirstSync
                        ? "A primeira carga de tarefas e horas acontece automaticamente. Assim que estiver pronta, os consultores aparecerão aqui."
                        : noDataForPeriod
                        ? "Tente selecionar outro período acima."
                        : noOperationalConsultantsForPeriod
                        ? "Já existem projetos e cadastros, mas ainda faltam tarefas e horas suficientes para compor o ranking deste período."
                        : hasActiveRankingFilters
                        ? "Ajuste a busca ou limpe os filtros para visualizar novamente a lista completa."
                        : "Quando houver consultores elegíveis com tarefas registradas no período selecionado, o ranking será exibido aqui."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </>
    );
  }
}
