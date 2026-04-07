import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Save, AlertCircle, TrendingUp, Zap } from "lucide-react";
import type { ProjectAnalytics } from "../types";
import { useScrollLock } from "@/hooks/useScrollLock";

type Props = {
  project: ProjectAnalytics | null;
  /** For client-level mode, pass multiple projects */
  clientProjects?: ProjectAnalytics[];
  currentHours: number;
  onClose: () => void;
  onSave: (projectId: number, hours: number, notes: string) => Promise<boolean>;
  /** Save for ALL projects of a client at once */
  onSaveAll?: (projectIds: number[], hours: number, notes: string) => Promise<boolean>;
};

export default function ContractedHoursModal({
  project,
  clientProjects,
  currentHours,
  onClose,
  onSave,
  onSaveAll,
}: Props) {
  const [hours, setHours] = useState(currentHours > 0 ? String(currentHours) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useScrollLock(true);

  // Determine if we're in client-level mode
  const isClientMode = !!(clientProjects && clientProjects.length > 1 && onSaveAll);
  const displayName = isClientMode
    ? clientProjects![0].clientName || "Cliente"
    : project?.projectName ?? "";

  const targetProject = project ?? (clientProjects?.[0] ?? null);
  if (!targetProject) return null;

  useEffect(() => {
    setHours(currentHours > 0 ? String(currentHours) : "");
    setNotes("");
    setError("");
  }, [currentHours, targetProject.projectId, clientProjects?.length]);

  const totalUsed = isClientMode
    ? clientProjects!.reduce((s, p) => s + p.hoursUsed, 0)
    : targetProject.hoursUsed;

  const totalContracted = isClientMode
    ? clientProjects!.reduce((s, p) => s + p.hoursContracted, 0)
    : targetProject.hoursContracted;

  const handleSave = async () => {
    const val = parseFloat(hours);
    if (isNaN(val) || val < 0) {
      setError("Informe um número válido de horas.");
      return;
    }
    setSaving(true);
    setError("");

    let ok = false;
    if (isClientMode && onSaveAll) {
      ok = await onSaveAll(clientProjects!.map((p) => p.projectId), val, notes);
    } else {
      ok = await onSave(targetProject.projectId, val, notes);
    }

    setSaving(false);
    if (ok) onClose();
    else setError("Erro ao salvar. Tente novamente.");
  };

  const numHours = parseFloat(hours) || 0;
  const previewRemaining = numHours > 0 ? numHours - totalUsed : null;
  const usagePct = numHours > 0 ? Math.min(100, Math.round((totalUsed / numHours) * 100)) : 0;
  const barColor =
    usagePct >= 90 ? "hsl(0 84% 60%)" :
    usagePct >= 70 ? "hsl(43 97% 52%)" :
    "hsl(160 84% 39%)";

  const PRESETS = [20, 40, 80, 120, 200];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl"
          style={{
            background: "linear-gradient(145deg, hsl(270 50% 13%), hsl(234 45% 8%))",
            boxShadow: "0 32px 64px -16px hsl(262 83% 20% / 0.6), 0 0 0 1px hsl(262 83% 58% / 0.08)",
          }}
        >
          {/* Top accent gradient */}
          <div className="h-[2px] w-full bg-gradient-to-r from-[hsl(262_83%_58%)] via-[hsl(234_89%_64%)] to-transparent opacity-60" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(262_83%_58%/0.12)] border border-[hsl(262_83%_58%/0.2)]">
                <Clock className="h-4.5 w-4.5 text-[hsl(262_83%_58%)]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white/90">Horas Contratadas</p>
                <p className="text-[11px] text-white/40 truncate max-w-[240px]">
                  {isClientMode ? `${displayName} · ${clientProjects!.length} projetos` : displayName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/25 transition hover:bg-white/[0.05] hover:text-white/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Current status cards */}
          <div className="mx-6 mb-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-3 text-center">
              <p className="text-xl font-bold text-white/80">{Math.round(totalUsed)}h</p>
              <p className="mt-0.5 text-[10px] text-white/30">Utilizadas</p>
            </div>
            <div className="rounded-xl border border-[hsl(262_83%_58%/0.25)] bg-[hsl(262_83%_58%/0.08)] px-3 py-3 text-center">
              <p className="text-xl font-bold text-[hsl(262_83%_58%)]">
                {totalContracted > 0 ? `${Math.round(totalContracted)}h` : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-white/30">Contratadas</p>
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-3 text-center">
              {totalContracted > 0 ? (
                <>
                  <p className={`text-xl font-bold ${(totalContracted - totalUsed) < 0 ? "text-[hsl(0_84%_60%)]" : "text-emerald-400"}`}>
                    {Math.round(Math.abs(totalContracted - totalUsed))}h
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/30">
                    {(totalContracted - totalUsed) < 0 ? "Excedidas" : "Restantes"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-white/20">—</p>
                  <p className="mt-0.5 text-[10px] text-white/30">Restantes</p>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <div
            className="space-y-4 px-6 pb-6 overflow-y-auto"
            style={{
              maxHeight: "calc(80vh - 180px)",
              scrollbarWidth: "thin",
              scrollbarColor: "hsl(262 83% 58% / 0.35) hsl(270 50% 10% / 0.4)",
            }}
          >
            {/* Hours input */}
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white/40">
                {isClientMode ? "Horas por projeto" : "Total de Horas Contratadas"}
              </label>

              {/* Preset quick-select */}
              <div className="mb-2.5 flex gap-1.5 flex-wrap">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setHours(String(preset))}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                      String(preset) === hours
                        ? "bg-[hsl(262_83%_58%)] text-white shadow-lg shadow-[hsl(262_83%_58%/0.25)]"
                        : "border border-white/[0.07] bg-white/[0.04] text-white/40 hover:border-[hsl(262_83%_58%/0.3)] hover:text-[hsl(262_83%_58%)]"
                    }`}
                  >
                    {preset}h
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 transition focus-within:border-[hsl(262_83%_58%/0.4)] focus-within:bg-white/[0.05]">
                <Clock className="h-3.5 w-3.5 text-white/25 shrink-0" />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="Ex: 80"
                  className="w-full bg-transparent text-base font-bold text-white/90 placeholder-white/20 outline-none"
                  autoFocus
                />
                <span className="text-sm font-semibold text-white/25 shrink-0">horas</span>
              </div>
            </div>

            {/* Live preview bar */}
            {numHours > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 text-white/30" />
                    <span className="text-white/40">Previsão de uso</span>
                  </div>
                  <span className={`font-bold ${usagePct >= 90 ? "text-[hsl(0_84%_60%)]" : usagePct >= 70 ? "text-amber-400" : "text-emerald-400"}`}>
                    {usagePct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${usagePct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{ background: barColor }}
                  />
                </div>
                {previewRemaining !== null && (
                  <p className={`text-[10px] font-semibold text-right ${previewRemaining < 0 ? "text-[hsl(0_84%_60%)]" : "text-white/35"}`}>
                    {previewRemaining >= 0
                      ? `${Math.round(previewRemaining)}h disponíveis`
                      : `${Math.abs(Math.round(previewRemaining))}h excedidas`}
                  </p>
                )}
              </motion.div>
            )}

            {/* Notes */}
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-white/40">
                Observações <span className="font-normal normal-case text-white/25">(opcional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Contrato renovado em jan/2025"
                rows={2}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-xs text-white/80 placeholder-white/20 outline-none transition focus:border-[hsl(262_83%_58%/0.35)] resize-none"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-[hsl(0_84%_60%/0.25)] bg-[hsl(0_84%_60%/0.08)] px-4 py-2.5 text-xs text-[hsl(0_84%_60%)]"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Client-level info */}
            {isClientMode && clientProjects && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <Zap className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="text-[11px] font-bold text-amber-400">Aplicar a todos os projetos</span>
                </div>
                <p className="text-[10px] text-amber-400/60 leading-relaxed">
                  As horas definidas serão aplicadas individualmente a cada um dos {clientProjects.length} projetos deste cliente.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/[0.07] py-2.5 text-xs font-semibold text-white/35 transition hover:border-white/[0.12] hover:text-white/60"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hours}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[hsl(262_83%_58%)] to-[hsl(234_89%_64%)] py-2.5 text-xs font-bold text-white shadow-lg shadow-[hsl(262_83%_58%/0.25)] transition hover:opacity-90 disabled:opacity-40"
              >
                {saving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "Salvando..." : isClientMode ? `Salvar (${clientProjects?.length} projetos)` : "Salvar"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
