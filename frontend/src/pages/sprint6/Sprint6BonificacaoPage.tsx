import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Search,
  Target,
  TrendingUp,
  TrendingDown,
  PieChart,
  AlertCircle,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { usePageSEO } from "@/hooks/usePageSEO";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useBonusRealData, type BonusConsultantCard } from "@/modules/sprint6/hooks/useBonusRealData";
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


export default function Sprint6BonificacaoPage() {
  usePageSEO("Bonificação | Dashboard ISP");
  const { session, loadingSession } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<RoiPeriod>("180d");
  const [activeMainTab, setActiveMainTab] = useState("ranking");
  
  const [search, setSearch] = useState("");
  const [expandedConsultant, setExpandedConsultant] = useState<string | null>(null);
  const [evaluationConsultant, setEvaluationConsultant] = useState<BonusConsultantCard | null>(null);
  const [reportConsultant, setReportConsultant] = useState<BonusConsultantCard | null>(null);
  const bonus = useBonusRealData(period, session?.accessToken, refreshKey);
  const permissionRole = session?.bonusRole ?? "consultor";
  const hideMonetary = permissionRole === "consultor";
  const isCoordinator = permissionRole === "gestor" && (session?.coordinatorOf ?? []).length > 0;
  const isAdmin = permissionRole === "admin";

  // Debug logging for permission issues
  useEffect(() => {
    if (session && !loadingSession) {
      console.info("[Bonificação] Permissões:", {
        bonusRole: session.bonusRole,
        permissionRole,
        userId: session.userId,
        coordinatorOf: session.coordinatorOf,
        isCoordinator,
        totalConsultants: bonus.consultants.length,
      });
    }
  }, [session, loadingSession, permissionRole, isCoordinator, bonus.consultants.length]);

  const visibleConsultants = useMemo(() => {
    if (permissionRole === "admin") return bonus.consultants;
    if (permissionRole === "gestor") {
      return bonus.consultants.filter((consultant) =>
        consultant.userId === session?.userId ||
        (consultant.userId ? (session?.coordinatorOf ?? []).includes(consultant.userId) : false),
      );
    }
    return bonus.consultants.filter((consultant) => consultant.userId === session?.userId);
  }, [bonus.consultants, permissionRole, session?.coordinatorOf, session?.userId]);

  // Subordinates only (for team tab)
  const subordinateConsultants = useMemo(() => {
    if (!isCoordinator) return [];
    return bonus.consultants.filter((c) =>
      c.userId != null && (session?.coordinatorOf ?? []).includes(c.userId),
    );
  }, [bonus.consultants, isCoordinator, session?.coordinatorOf]);

  const filteredConsultants = useMemo(() => {
    const term = normalizeName(search);
    if (!term) return visibleConsultants;
    return visibleConsultants.filter((c) => normalizeName(c.name).includes(term));
  }, [visibleConsultants, search]);

  const topPerformer = visibleConsultants[0] ?? null;
  const needsAttention = useMemo(
    () => visibleConsultants.filter((c) => c.score < 60).slice(0, 3),
    [visibleConsultants],
  );
  const trendingUp = useMemo(
    () => visibleConsultants.filter((c) => c.score >= 75 && (c.onTimeRate == null || c.onTimeRate >= 60)).slice(0, 3),
    [visibleConsultants],
  );

  const totalHoursTracked = useMemo(() => visibleConsultants.reduce((s, c) => s + c.hoursTracked, 0), [visibleConsultants]);
  const totalCompletedTasks = useMemo(() => visibleConsultants.reduce((s, c) => s + c.completedTasks, 0), [visibleConsultants]);
  const totalTasks = useMemo(() => visibleConsultants.reduce((s, c) => s + c.totalTasks, 0), [visibleConsultants]);
  const completionRate = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;

  const sourceStatusMap = useMemo(
    () => new Map(bonus.persistence.sourceStatuses.map((row) => [row.sourceCode, row])),
    [bonus.persistence.sourceStatuses],
  );

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

  /* ── Early returns (after all hooks) ────────────────────────────── */
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

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="page-gradient w-full">
      <div className="mx-auto w-full max-w-[1800px] space-y-5 p-4 sm:p-5 md:p-6 lg:p-8">

        <div className="space-y-5">

        {/* ── Hero Header (consistent with Analytics) ──────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl border border-white/[0.07]"
          style={{
            background: "linear-gradient(135deg, hsl(260 30% 11%) 0%, hsl(262 35% 15%) 40%, hsl(270 25% 12%) 100%)",
          }}
        >
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 md:px-6 md:py-5">
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
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
                  Ranking, payout e impacto financeiro
                </p>
              </div>
            </div>
          </div>
        </div>


        {/* ── Error / Loading / Status ────────────────────────────── */}
        {bonus.error && (
          <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-5 py-4 text-sm text-amber-200 space-y-1">
            <p className="font-semibold">Parece que encontramos um problema</p>
            <p className="text-xs text-amber-200/70 leading-relaxed">
              Tente recarregar a página ou sair e entrar novamente no sistema. Se o problema persistir, entre em contato com nossa equipe de desenvolvimento e informe a situação.
            </p>
          </div>
        )}
        {/* loading silencioso — sem indicador visual */}
        {!bonus.loading && statusBanner && (
          <div className={`rounded-xl border px-4 py-3 ${statusBanner.tone === "blue" ? "border-blue-500/15 bg-blue-500/[0.04] text-blue-200" : "border-amber-500/15 bg-amber-500/[0.04] text-amber-200"}`}>
            <p className="text-sm font-semibold">{statusBanner.title}</p>
            <p className="mt-0.5 text-xs opacity-70">{statusBanner.message}</p>
          </div>
        )}

            <div className="space-y-3">

              {/* ── Period Summary (always visible) ────────────────── */}
              {visibleConsultants.length > 0 && (
                <div className={`grid gap-2.5 ${hideMonetary ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
                  {[
                    !hideMonetary && {
                      label: "Score médio",
                      value: `${Math.round(visibleConsultants.reduce((s, c) => s + c.score, 0) / visibleConsultants.length)}%`,
                      sub: `${visibleConsultants.length} consultor${visibleConsultants.length > 1 ? "es" : ""} · ${periodLabel(period)}`,
                      color: "border-primary/12 bg-primary/[0.04]",
                      valueColor: "text-primary",
                    },
                    !hideMonetary && {
                      label: "Payout total",
                      value: money(visibleConsultants.reduce((sum, consultant) => sum + consultant.payout, 0)),
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
                      sub: visibleConsultants.length > 0 ? `média de ${Math.round(totalHoursTracked / visibleConsultants.length)}h/pessoa · ${periodLabel(period)}` : `nenhuma hora · ${periodLabel(period)}`,
                      color: "border-amber-500/12 bg-amber-500/[0.04]",
                      valueColor: "text-amber-400",
                    },
                    hideMonetary && {
                      label: "Meu Score",
                      value: visibleConsultants[0] ? `${visibleConsultants[0].score}%` : "—",
                      sub: periodLabel(period),
                      color: "border-primary/12 bg-primary/[0.04]",
                      valueColor: "text-primary",
                    },
                  ].filter(Boolean).map((item: any) => (
                    <div
                      key={item.label}
                      className={`rounded-xl border p-3.5 ${item.color}`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">{item.label}</p>
                      <p className={`mt-1.5 text-lg font-bold leading-none ${item.valueColor}`}>{item.value}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/50">{item.sub}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Main tabs (coordinator/admin get team tab) ─────── */}
              {(isCoordinator || isAdmin) ? (
                <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-4">
                  <TabsList className="h-auto rounded-xl bg-card/40 border border-border/10 p-1">
                    <TabsTrigger
                      value="ranking"
                      className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
                    >
                      <Crown className="h-3.5 w-3.5 mr-1.5" />
                      {hideMonetary ? "Meu Ranking" : "Ranking Geral"}
                    </TabsTrigger>
                    {isCoordinator && (
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
                    {isAdmin && (
                      <TabsTrigger
                        value="all-evaluations"
                        className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
                      >
                        <Users className="h-3.5 w-3.5 mr-1.5" />
                        Todas as Avaliações
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Ranking tab content */}
                  <TabsContent value="ranking" className="mt-0 space-y-3">
                    {renderRankingContent()}
                  </TabsContent>

                  {/* Team tab content (coordinators) */}
                  {isCoordinator && (
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

                  {/* All evaluations tab (admin/distributor) */}
                  {isAdmin && (
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
              ) : (
                /* No tabs for regular consultants */
                <div className="space-y-3">
                  {renderRankingContent()}
                </div>
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

  /* ── Extracted ranking content to avoid duplication ──────────────── */
  function renderRankingContent() {
    return (
      <>
        {/* ── Collapsible: Signals (hidden for consultants) ── */}
        {!hideMonetary && (
        <CollapsibleSection
          title="Sinais rápidos"
          icon={TrendingUp}
          summary={
            visibleConsultants.length > 0
              ? `${trendingUp.length > 0 ? `${trendingUp.length} em destaque` : "Nenhum destaque"} · ${needsAttention.length > 0 ? `${needsAttention.length} precisam de atenção` : "Todos acima de 60%"}`
              : "Aguardando dados de consultores"
          }
        >
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <SectionCard title="Quem está mandando bem" icon={TrendingUp} compact badge={trendingUp.length > 0 ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 rounded-md px-1.5 py-0.5">{trendingUp.length}</span> : undefined}>
              {trendingUp.length > 0 ? (
                <div className="space-y-2">
                  {trendingUp.map((c) => (
                    <div key={c.name}>
                      <InsightRow name={c.name} score={c.score} payout={c.payout} icon={TrendingUp} color="emerald" hideMonetary={hideMonetary} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyInsight text="Ainda não há consultores com score acima de 75% e entregas em dia. Quando alguém se destacar, vai aparecer aqui." />
              )}
            </SectionCard>

            <SectionCard title="Quem precisa de atenção" icon={AlertCircle} compact badge={needsAttention.length > 0 ? <span className="text-[10px] font-bold text-red-400 bg-red-500/10 rounded-md px-1.5 py-0.5">{needsAttention.length}</span> : undefined}>
              {needsAttention.length > 0 ? (
                <div className="space-y-2">
                  {needsAttention.map((c) => (
                    <div key={c.name}>
                      <InsightRow name={c.name} score={c.score} payout={c.payout} icon={TrendingDown} color="red" hideMonetary={hideMonetary} />
                    </div>
                  ))}
                </div>
              ) : visibleConsultants.length > 0 ? (
                <EmptyInsight text="Todos os consultores estão com score acima de 60%. Ninguém precisa de atenção imediata agora." />
              ) : (
                <EmptyInsight text="Sem dados de consultores neste período." />
              )}
            </SectionCard>

            <SectionCard title="Distribuição da equipe" icon={PieChart} compact badge={visibleConsultants.length > 0 ? <span className="text-[10px] font-bold text-muted-foreground bg-white/[0.05] rounded-md px-1.5 py-0.5">{visibleConsultants.length} pessoas</span> : undefined}>
              {visibleConsultants.length > 0 ? (
                <ScoreDistribution consultants={visibleConsultants} />
              ) : (
                <EmptyInsight text="Quando existirem consultores com scores calculados, você verá como a equipe se distribui por faixa de desempenho." />
              )}
            </SectionCard>
          </div>
        </CollapsibleSection>
        )}

        {/* ── Collapsible: Score Composition (hidden for consultants) ── */}
        {!hideMonetary && (
        <CollapsibleSection
          title="Score do Consultor"
          icon={Target}
          summary={
              visibleConsultants.length > 0
              ? `Melhor score: ${visibleConsultants[0]?.score ?? 0}% (${visibleConsultants[0]?.name ?? "—"})`
              : "Veja como o score é composto e o teto por nível"
          }
        >
          <BonusScoreComposition consultants={visibleConsultants} />
        </CollapsibleSection>
        )}

        {/* ── Collapsible: Trends (hidden for consultants) ── */}
        {!hideMonetary && (
        <CollapsibleSection
          title="Evolução ao longo do tempo"
          icon={TrendingUp}
          summary={
            bonus.persistence.consultantSnapshots.length > 0
              ? `${new Set(bonus.persistence.consultantSnapshots.filter(s => s.period_type === "month").map(s => s.period_key)).size} meses com dados registrados`
              : "O histórico aparecerá quando houver períodos gravados"
          }
        >
          <BonusTrendsSection consultants={visibleConsultants} consultantSnapshots={bonus.persistence.consultantSnapshots.filter((snapshot) => !snapshot.user_id || visibleConsultants.some((consultant) => consultant.userId === snapshot.user_id))} />
        </CollapsibleSection>
        )}

        {/* ── Collapsible: Ranking ────────────────────────────── */}
        <div id="bonus-ranking">
        <CollapsibleSection
          title={hideMonetary ? "Seu Ranking" : "Ranking de Consultores"}
          icon={Crown}
          
          summary={
            visibleConsultants.length > 0
              ? `${visibleConsultants.length} consultores · Líder: ${visibleConsultants[0]?.name ?? "—"} com ${visibleConsultants[0]?.score ?? 0}%`
              : "Nenhum consultor encontrado neste período"
          }
          badge={visibleConsultants.length > 0 ? <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-md px-1.5 py-0.5">{visibleConsultants.length}</span> : undefined}
        >
          <div className="space-y-4">
            {!hideMonetary && (
              <div className="flex items-center justify-end">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar consultor..."
                    className="h-10 rounded-xl border-border/15 bg-card/40 pl-10 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              {filteredConsultants.map((consultant, index) => (
                <div key={consultant.name}>
                  <RankingCard
                    consultant={consultant}
                    rank={index + 1}
                    expanded={expandedConsultant === consultant.name}
                    onToggle={() => setExpandedConsultant(expandedConsultant === consultant.name ? null : consultant.name)}
                    hideMonetary={hideMonetary}
                    periodLabel={periodLabel(period)}
                    canEvaluate={permissionRole === "admin" || (permissionRole === "gestor" && consultant.userId != null && (session?.coordinatorOf ?? []).includes(consultant.userId))}
                    canSendReport={permissionRole === "admin" || (permissionRole === "gestor" && consultant.userId != null && (session?.coordinatorOf ?? []).includes(consultant.userId))}
                    onEvaluate={setEvaluationConsultant}
                    onSendReport={setReportConsultant}
                  />
                </div>
              ))}
              {filteredConsultants.length === 0 && (
                <div className="rounded-2xl border border-border/15 bg-card/35 p-10 text-center space-y-2.5">
                  <p className="text-sm font-semibold text-foreground/70">
                    {waitingFirstSync
                      ? "Os dados ainda estão sendo carregados"
                      : noDataForPeriod
                      ? "Nenhum resultado neste período"
                      : noVisibleConsultantsForPermission
                      ? "Nenhum consultor visível para este perfil"
                      : noOperationalConsultantsForPeriod
                      ? "Ainda não há base operacional suficiente"
                      : search
                      ? `Nenhum consultor encontrado para "${search}"`
                      : "Nenhum consultor disponível"}
                  </p>
                  <p className="text-xs text-muted-foreground/50 max-w-md mx-auto leading-relaxed">
                    {waitingFirstSync
                      ? "A primeira carga de tarefas e horas acontece automaticamente. Assim que estiver pronta, os consultores aparecerão aqui."
                      : noDataForPeriod
                      ? "Tente selecionar outro período acima."
                      : noVisibleConsultantsForPermission
                      ? "Existem consultores carregados no sistema, mas este usuário não possui permissão para visualizar nenhum deles nesta tela."
                      : noOperationalConsultantsForPeriod
                      ? "Já existem projetos e cadastros, mas ainda faltam tarefas e horas suficientes para compor o ranking deste período."
                      : search
                      ? "Tente buscar por outro nome ou limpe o campo de busca."
                      : "Quando houver consultores com tarefas registradas no período selecionado, o ranking será exibido aqui."}
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
