import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, ShieldCheck, Sparkles, Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { consumeUpdateContext, saveUpdateContext } from "@/lib/appUpdate";
import { motion } from "framer-motion";

/* ── Config ─────────────────────────────────────────────────────────── */
const VERSION_CHECK_INTERVAL_MS = 60_000;
const UPDATE_SNOOZE_MS = 5 * 60 * 1000; // 5 minutes

type RemoteVersionPayload = {
  version?: string;
  buildId?: string;
  generatedAt?: string;
};

/* ── Component ──────────────────────────────────────────────────────── */
export default function AppUpdateManager() {
  const location = useLocation();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [updating, setUpdating] = useState(false);

  /* Re-check snooze timer */
  const [now, setNow] = useState(Date.now());
  const modalOpen = updateAvailable && now >= snoozedUntil;

  /* Restore context on mount (post-update) */
  useEffect(() => {
    consumeUpdateContext();
  }, []);

  /* Tick to unsnooze */
  useEffect(() => {
    if (!snoozedUntil) return;
    const remaining = Math.max(snoozedUntil - Date.now(), 0);
    const timer = window.setTimeout(() => {
      setSnoozedUntil(0);
      setNow(Date.now());
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [snoozedUntil]);

  /* Polling for version.json */
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RemoteVersionPayload;
        if (cancelled || !data?.buildId) return;

        if (data.buildId !== __APP_BUILD_ID__) {
          setUpdateAvailable(true);
        } else {
          setUpdateAvailable(false);
        }
      } catch {
        /* best-effort */
      }
    };

    void check();
    const interval = window.setInterval(check, VERSION_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /* Actions */
  const handleLater = useCallback(() => {
    setSnoozedUntil(Date.now() + UPDATE_SNOOZE_MS);
    setNow(Date.now());
  }, []);

  const handleUpdateNow = useCallback(() => {
    setUpdating(true);
    saveUpdateContext();
    window.location.assign(`${location.pathname}${location.search}${location.hash}`);
  }, [location]);

  return (
    <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) handleLater(); }}>
      <DialogContent
        className={[
          "w-[92vw] max-w-[460px] p-0 overflow-hidden",
          "border border-white/[0.08]",
          "bg-[linear-gradient(165deg,hsl(228_33%_14%/0.98),hsl(233_36%_8%/0.99))]",
          "shadow-[0_30px_100px_hsl(240_60%_3%/0.75)]",
          "backdrop-blur-xl",
          "rounded-2xl sm:rounded-3xl",
          "max-h-[95vh]",
        ].join(" ")}
      >
        <DialogTitle className="sr-only">Atualização disponível</DialogTitle>
        <DialogDescription className="sr-only">
          Uma nova versão do sistema está disponível. Você pode atualizar agora ou continuar e atualizar depois.
        </DialogDescription>

        {/* ── Decorative glows ── */}
        <motion.div
          className="pointer-events-none absolute -top-20 left-1/2 h-44 w-[75%] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(ellipse at center, hsl(160 80% 50% / 0.2), hsl(var(--primary) / 0.1) 55%, transparent 80%)" }}
          animate={{ opacity: [0.4, 0.75, 0.4], scale: [0.96, 1.04, 0.96] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -right-8 top-4 h-24 w-24 rounded-full"
          style={{ background: "radial-gradient(circle, hsl(160 90% 55% / 0.1), transparent 70%)" }}
          animate={{ y: [0, -8, 0], opacity: [0.2, 0.45, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Top/bottom border shine */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

        {/* ── Content ── */}
        <div className="relative flex flex-col items-center px-5 py-7 text-center sm:px-8 sm:py-9">
          {/* Animated icon */}
          <motion.div
            initial={{ y: 10, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.08, duration: 0.4, ease: "easeOut" }}
            className="flex h-16 w-16 items-center justify-center sm:h-[72px] sm:w-[72px]"
          >
            <div className="relative flex items-center justify-center">
              {/* Pulsing rings */}
              <motion.div
                className="absolute h-12 w-12 rounded-full border border-emerald-400/25 sm:h-14 sm:w-14"
                animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.4, 0.15] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute h-14 w-14 rounded-full border border-primary/15 sm:h-16 sm:w-16"
                animate={{ scale: [0.92, 1.2, 0.92], opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
              />
              {/* Glow */}
              <motion.div
                className="absolute h-8 w-8 rounded-full bg-emerald-400/10 blur-md sm:h-9 sm:w-9"
                animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.25, 0.6, 0.25] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                animate={
                  updating
                    ? { y: [0, -4, 0], scale: [1, 1.06, 1] }
                    : { rotate: [0, 15, -12, 0] }
                }
                transition={
                  updating
                    ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }
              >
                <Rocket className="h-8 w-8 text-emerald-400 drop-shadow-[0_0_14px_hsl(160_80%_50%/0.45)] sm:h-9 sm:w-9" />
              </motion.div>
            </div>
          </motion.div>

          {/* Badge */}
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.14, duration: 0.35 }}
            className="mt-4 flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/90 sm:text-[11px]"
          >
            <Sparkles className="h-3 w-3" />
            Nova atualização
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.35 }}
            className="mt-4 max-w-[300px] text-[1.25rem] font-extrabold leading-tight tracking-tight sm:text-[1.5rem]"
          >
            <span className="bg-gradient-to-br from-white via-white/95 to-white/70 bg-clip-text text-transparent">
              Versão mais recente
            </span>
            <br />
            <span className="bg-gradient-to-r from-emerald-300 via-emerald-200 to-primary bg-clip-text text-transparent drop-shadow-[0_0_14px_hsl(160_80%_50%/0.2)]">
              pronta para você!
            </span>
          </motion.h2>

          {/* Trust banner */}
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.35 }}
            className="mt-4 flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/80" />
            <p className="text-[11px] leading-relaxed text-white/40 sm:text-xs">
              Nenhuma atualização será forçada. Se preferir continuar, voltaremos a avisar em breve.
            </p>
          </motion.div>

          {/* Buttons */}
          <motion.div
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.36, duration: 0.3 }}
            className="mt-6 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:gap-3"
          >
            <Button
              type="button"
              size="lg"
              onClick={handleUpdateNow}
              disabled={updating}
              className="group relative h-11 flex-1 gap-2 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(135deg,hsl(160_70%_38%),hsl(var(--primary)))] px-5 text-[13px] font-bold text-white shadow-[0_10px_30px_hsl(160_70%_38%/0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_hsl(160_70%_38%/0.4)] hover:brightness-110 sm:h-12 sm:text-sm"
            >
              <motion.div
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
              />
              <RefreshCw className={`relative h-4 w-4 shrink-0 ${updating ? "animate-spin" : ""}`} />
              <span className="relative truncate">{updating ? "Aplicando..." : "Atualizar agora"}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={handleLater}
              disabled={updating}
              className="h-11 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-[13px] font-semibold text-white/45 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] hover:text-white/70 sm:h-12 sm:text-sm"
            >
              Atualizar depois
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
