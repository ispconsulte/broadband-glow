import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Layers, Activity } from "lucide-react";

import type { BonusConsultantCard } from "@/modules/sprint6/hooks/useBonusRealData";
import type { TaskRecord } from "@/modules/tasks/types";
import { classifyTask } from "@/modules/analytics/hooks/useAnalyticsData";
import { RankingCard } from "./BonusRankingCard";
import AnalyticsProductivityPulse from "@/modules/analytics/components/AnalyticsProductivityPulse";
import AnalyticsVelocityChart from "@/modules/analytics/components/AnalyticsVelocityChart";

function normalize(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isNameMatch(taskResponsible: string, userName: string): boolean {
  const a = normalize(taskResponsible);
  const b = normalize(userName);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aParts = a.split(/\s+/);
  const bParts = b.split(/\s+/);
  if (aParts.length >= 2 && bParts.length >= 2) {
    if (aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
  }
  return false;
}

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

  return (
    <div className="space-y-4">
      <RankingCard
        consultant={consultant}
        rank={1}
        showRank={false}
        expanded={expanded}
        onToggle={onToggle}
        hideMonetary={hideMonetary}
        periodLabel={periodLabel}
      />

      {expanded && (
        <Tabs value={detailTab} onValueChange={setDetailTab} className="space-y-3">
          <TabsList className="h-auto rounded-xl bg-card/40 border border-border/10 p-1 flex flex-wrap justify-start">
            <TabsTrigger
              value="metricas"
              className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
            >
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Métricas
            </TabsTrigger>
            <TabsTrigger
              value="graficos"
              className="rounded-lg text-xs font-semibold px-3 py-1.5 data-[state=active]:bg-primary/12 data-[state=active]:text-primary data-[state=inactive]:text-muted-foreground/60"
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Gráficos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="metricas" className="mt-0">
            <p className="text-xs text-muted-foreground/50 px-1">
              As métricas detalhadas estão no card acima. Expanda para ver composição do score, avaliação manual e indicadores do período.
            </p>
          </TabsContent>

          <TabsContent value="graficos" className="mt-0 space-y-4">
            {userTasks.length > 0 ? (
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <AnalyticsProductivityPulse tasks={userTasks} classifyTask={classifyTask} />
                <AnalyticsVelocityChart tasks={userTasks} classifyTask={classifyTask} />
              </div>
            ) : (
              <div className="rounded-2xl border border-border/15 bg-card/35 p-8 text-center">
                <Activity className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm font-semibold text-foreground/70">Sem tarefas para gerar gráficos</p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Quando houver tarefas vinculadas ao seu nome, os gráficos de produtividade e velocidade aparecerão aqui.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
