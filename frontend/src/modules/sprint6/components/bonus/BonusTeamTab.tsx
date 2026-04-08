import { useMemo, useState } from "react";
import { ClipboardCheck, Users, Search, ChevronDown, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { BonusConsultantCard } from "@/modules/sprint6/hooks/useBonusRealData";
import type { AuthSession } from "@/modules/auth/hooks/useAuth";
import { normalizeName, scoreColor, scoreBg, levelLabel, levelColor } from "./BonusHelpers";
import { formatHoursHuman } from "@/modules/tasks/utils";
import { AnimatePresence, motion } from "framer-motion";

interface BonusTeamTabProps {
  subordinates: BonusConsultantCard[];
  session: AuthSession | null;
  periodLabel: string;
  onEvaluate: (consultant: BonusConsultantCard) => void;
  onSendReport: (consultant: BonusConsultantCard) => void;
}

export function BonusTeamTab({ subordinates, session, periodLabel, onEvaluate, onSendReport }: BonusTeamTabProps) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = normalizeName(search);
    if (!term) return subordinates;
    return subordinates.filter((c) => normalizeName(c.name).includes(term));
  }, [subordinates, search]);

  if (subordinates.length === 0) {
    return (
      <div className="rounded-2xl border border-border/15 bg-card/35 p-8 text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/15">
            <AlertCircle className="h-6 w-6 text-amber-400" />
          </div>
        </div>
        <p className="text-sm font-semibold text-foreground/70">Nenhum subordinado encontrado</p>
        <p className="text-xs text-muted-foreground/50 max-w-md mx-auto leading-relaxed">
          Para que seus subordinados apareçam aqui, é necessário que os vínculos de coordenação estejam cadastrados no sistema.
          Entre em contato com o administrador para configurar os links de coordenação.
        </p>
        {session?.userId && (
          <p className="text-[10px] text-muted-foreground/30 font-mono mt-2">
            Seu ID de usuário: {session.userId}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      {subordinates.length > 3 && (
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na equipe..."
            className="h-10 rounded-xl border-border/15 bg-card/40 pl-10 text-sm"
          />
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/12 bg-primary/[0.04] p-3.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Membros da equipe</p>
          <p className="mt-1.5 text-lg font-bold leading-none text-primary">{subordinates.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/50">subordinados diretos</p>
        </div>
        <div className="rounded-xl border border-emerald-500/12 bg-emerald-500/[0.04] p-3.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Avaliados</p>
          <p className="mt-1.5 text-lg font-bold leading-none text-emerald-400">
            {subordinates.filter((c) => c.manualEvaluation.status === "submitted").length}/{subordinates.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/50">{periodLabel}</p>
        </div>
        <div className="rounded-xl border border-amber-500/12 bg-amber-500/[0.04] p-3.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Score médio</p>
          <p className="mt-1.5 text-lg font-bold leading-none text-amber-400">
            {subordinates.length > 0 ? `${Math.round(subordinates.reduce((s, c) => s + c.score, 0) / subordinates.length)}%` : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/50">da equipe</p>
        </div>
      </div>

      {/* Subordinate cards */}
      <div className="space-y-3">
        {filtered.map((consultant) => {
          const isExpanded = expandedId === consultant.userId;
          const evalStatus = consultant.manualEvaluation.status;

          return (
            <div
              key={consultant.userId ?? consultant.name}
              className={`rounded-2xl border transition-all ${isExpanded ? "border-primary/20 bg-card/55" : "border-border/12 bg-card/35 hover:bg-card/45"}`}
            >
              {/* Header */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : consultant.userId)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/15 text-sm font-bold text-primary">
                  {consultant.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="truncate text-sm font-bold text-foreground">{consultant.name}</p>
                    {["senior", "pleno", "junior"].includes(consultant.level) && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${levelColor(consultant.level)}`}>
                        {levelLabel(consultant.level)}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        evalStatus === "submitted"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : evalStatus === "draft"
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                          : "border-border/20 bg-card/30 text-muted-foreground/60"
                      }`}
                    >
                      {evalStatus === "submitted" ? "Avaliado" : evalStatus === "draft" ? "Rascunho" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/50">
                    {consultant.completedTasks > 0 && <span>{consultant.completedTasks}/{consultant.totalTasks} tarefas</span>}
                    {consultant.hoursTracked > 0 && <><span className="text-muted-foreground/20">·</span><span>{formatHoursHuman(consultant.hoursTracked)}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className={`rounded-xl border px-3 py-1.5 text-center ${scoreBg(consultant.score)}`}>
                    <p className={`text-sm font-bold ${scoreColor(consultant.score)}`}>{consultant.score}%</p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground/50 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Expanded */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border/10 px-4 pb-4 pt-4 space-y-4">
                      {/* Metrics */}
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
                        {[
                          { label: "Score", value: `${consultant.score}%` },
                          { label: "No Prazo", value: consultant.onTimeRate != null ? `${Math.round(consultant.onTimeRate)}%` : "—" },
                          { label: "Utilização", value: consultant.utilization != null ? `${Math.round(consultant.utilization)}%` : "—" },
                          { label: "Projetos", value: consultant.projectCount > 0 ? String(consultant.projectCount) : "—" },
                        ].map((m) => (
                          <div key={m.label} className="rounded-xl border border-border/8 bg-card/20 p-3 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">{m.label}</p>
                            <p className="mt-1 text-base font-bold text-foreground">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Manual eval summary */}
                      {consultant.manualEvaluation.hasManualEvaluation && (
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                          {[
                            { label: "Hard Skill Manual", value: consultant.manualEvaluation.hardManualScore },
                            { label: "Soft Skills", value: consultant.manualEvaluation.softSkillScore },
                            { label: "People Skills", value: consultant.manualEvaluation.peopleSkillScore },
                          ].filter((i) => i.value != null).map((i) => (
                            <div key={i.label} className="rounded-xl border border-border/8 bg-card/20 p-3">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50">{i.label}</p>
                              <p className="mt-1 text-lg font-bold text-foreground">{Math.round(i.value!)}/100</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => onEvaluate(consultant)}
                          className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/8 px-5 py-2.5 text-sm font-semibold text-primary transition-all hover:border-primary/35 hover:bg-primary/12"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                          {evalStatus === "submitted" ? "Revisar Avaliação" : evalStatus === "draft" ? "Continuar Avaliação" : "Avaliar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onSendReport(consultant)}
                          className="inline-flex items-center gap-2 rounded-xl border border-border/16 bg-card/35 px-5 py-2.5 text-sm font-semibold text-foreground/75 transition-all hover:border-primary/18 hover:bg-card/55"
                        >
                          Enviar Relatório
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        {filtered.length === 0 && search && (
          <div className="rounded-xl border border-border/15 bg-card/35 p-6 text-center">
            <p className="text-sm text-muted-foreground/60">Nenhum membro encontrado para "{search}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
