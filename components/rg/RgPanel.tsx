"use client";

import { useState } from "react";
import { BellRing, Clock, LifeBuoy, Lock, Pause, ShieldAlert, ShieldCheck, TimerReset, Unlock } from "lucide-react";
import { useRg, useRgStatus } from "@/state/RgContext";
import { rgReasonText } from "@/state/rg-reducer";
import { PAUSE_OPTIONS_MINUTES, RG_NOTICE, SESSION_LIMIT_OPTIONS_MINUTES } from "@/lib/constants";
import { formatDateTime, formatDuration } from "@/lib/formatters";
import { Card } from "@/components/ui/Card";
import { Button, LinkButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SessionTimer } from "./SessionTimer";
import { LimitDialog } from "./LimitDialog";

const pauseLabel = (m: number) => (m >= 1440 ? `${m / 1440} Tag` : m >= 60 ? `${m / 60} Std.` : `${m} Min.`);

/** Responsible-Gaming-Bereich (§8.9): Spielzeit, Pause, Demo-Limit, Selbstsperre, Erinnerung, Hilfe. */
export function RgPanel() {
  const rg = useRg();
  const status = useRgStatus(1000);
  const { toast } = useToast();
  const [dialog, setDialog] = useState<null | "pause" | "end-pause" | "exclude" | "lift" | "new-session">(null);
  const [pauseMinutes, setPauseMinutes] = useState<number>(PAUSE_OPTIONS_MINUTES[0] ?? 15);

  const hydrated = status.hydrated;
  const reason = status.blocked && status.reason ? rgReasonText[status.reason] : null;

  return (
    <div className="space-y-6">
      {/* Status: bewusst OHNE Card signature (goldene Haarlinie) — Responsible Gaming ist eine
          Schutzfunktion und bleibt frei von der Verkaufsästhetik des Spiels (Auftrag). */}
      <Card as="section" aria-labelledby="rg-status-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="rg-status-title" className="flex items-center gap-2 text-md font-semibold text-primary">
              {status.blocked ? <ShieldAlert className="size-5 text-warning" aria-hidden="true" /> : <ShieldCheck className="size-5 text-teal" aria-hidden="true" />}
              Aktueller Status
            </h2>
            {hydrated ? (
              <p className="mt-1 text-sm text-muted">{reason ? reason.body : "Keine Pause, kein Limit erreicht, keine Selbstsperre. Spielstarts sind möglich."}</p>
            ) : (
              <Skeleton className="mt-2 h-4 w-64" />
            )}
          </div>
          {hydrated ? (
            <Badge tone={status.blocked ? "warning" : "teal"} size="md">
              {reason ? reason.title : "Spielen möglich"}
            </Badge>
          ) : (
            <Skeleton className="h-7 w-32 rounded-pill" />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SessionTimer />
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted">Sitzung begonnen</span>
            {hydrated ? <span className="text-base text-primary">{formatDateTime(rg.rg.sessionStartedAt)}</span> : <Skeleton className="h-6 w-32" />}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted">Pause bis</span>
            {hydrated ? <span className="text-base text-primary">{status.pausedUntil ? formatDateTime(status.pausedUntil) : "–"}</span> : <Skeleton className="h-6 w-32" />}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pause */}
        <Card as="section" aria-labelledby="pause-title" className="space-y-3">
          <h2 id="pause-title" className="flex items-center gap-2 text-md font-semibold text-primary">
            <Pause className="size-5 text-teal" aria-hidden="true" /> Session-Pause
          </h2>
          <p className="text-sm text-muted">Während einer Pause sind alle Spielstarts blockiert. Sie endet automatisch zur gewählten Zeit oder wenn du sie hier ausdrücklich beendest.</p>
          {status.reason === "paused" ? (
            <Button variant="outline" onClick={() => setDialog("end-pause")} iconLeft={<Unlock className="size-4" aria-hidden="true" />}>
              Pause vorzeitig beenden
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Select
                label="Dauer"
                value={String(pauseMinutes)}
                onChange={(e) => setPauseMinutes(Number(e.target.value))}
                options={PAUSE_OPTIONS_MINUTES.map((m) => ({ value: String(m), label: pauseLabel(m) }))}
                containerClassName="w-40"
                disabled={!hydrated || rg.rg.selfExcluded}
              />
              <Button variant="outline" onClick={() => setDialog("pause")} disabled={!hydrated || rg.rg.selfExcluded} iconLeft={<Pause className="size-4" aria-hidden="true" />}>
                Pause einlegen
              </Button>
            </div>
          )}
        </Card>

        {/* Limit */}
        <Card as="section" aria-labelledby="limit-title" className="space-y-3">
          <h2 id="limit-title" className="flex items-center gap-2 text-md font-semibold text-primary">
            <Clock className="size-5 text-teal" aria-hidden="true" /> Demo-Zeitlimit pro Sitzung
          </h2>
          <p className="text-sm text-muted">Nach Ablauf sind Spielstarts blockiert, bis du hier bewusst eine neue Sitzung beginnst. Gerechnet wird aus Zeitstempeln, auch über Reloads hinweg.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              label="Limit"
              value={String(rg.rg.sessionLimitMinutes ?? "")}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : undefined;
                rg.setSessionLimit(v);
                toast({ tone: "success", title: v ? `Demo-Limit auf ${formatDuration(v * 60_000)} gesetzt.` : "Demo-Limit entfernt." });
              }}
              options={[{ value: "", label: "Kein Limit" }, ...SESSION_LIMIT_OPTIONS_MINUTES.map((m) => ({ value: String(m), label: pauseLabel(m) }))]}
              containerClassName="w-40"
              disabled={!hydrated}
            />
            {status.reason === "limit-reached" ? (
              <Button variant="outline" onClick={() => setDialog("new-session")} iconLeft={<TimerReset className="size-4" aria-hidden="true" />}>
                Neue Sitzung beginnen
              </Button>
            ) : null}
          </div>
        </Card>

        {/* Erinnerung */}
        <Card as="section" aria-labelledby="reminder-title" className="space-y-3">
          <h2 id="reminder-title" className="flex items-center gap-2 text-md font-semibold text-primary">
            <BellRing className="size-5 text-teal" aria-hidden="true" /> Erinnerung nach längerer Nutzung
          </h2>
          <p className="text-sm text-muted">Ein kurzer Hinweis mit der bisherigen Spielzeit — ohne Druck, ohne Countdown.</p>
          <Select
            label="Intervall"
            value={String(rg.rg.reminderIntervalMinutes)}
            onChange={(e) => rg.setReminderInterval(Number(e.target.value))}
            options={[15, 30, 60].map((m) => ({ value: String(m), label: `alle ${m} Min.` }))}
            containerClassName="w-40"
            disabled={!hydrated}
          />
        </Card>

        {/* Selbstsperre */}
        <Card as="section" aria-labelledby="exclude-title" className="space-y-3 border-warning/40">
          <h2 id="exclude-title" className="flex items-center gap-2 text-md font-semibold text-primary">
            <Lock className="size-5 text-warning" aria-hidden="true" /> Selbstsperre
          </h2>
          <p className="text-sm text-muted">Sperrt alle Spielstarts, bis du die Sperre hier in einem Zwei-Schritt-Dialog ausdrücklich aufhebst. Kein Banner, kein Schnellweg.</p>
          {rg.rg.selfExcluded ? (
            <Button variant="outline" onClick={() => setDialog("lift")} iconLeft={<Unlock className="size-4" aria-hidden="true" />}>
              Selbstsperre aufheben
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setDialog("exclude")} disabled={!hydrated} iconLeft={<Lock className="size-4" aria-hidden="true" />}>
              Selbstsperre aktivieren
            </Button>
          )}
        </Card>
      </div>

      {/* Hilfe */}
      <Card as="section" aria-labelledby="help-title" className="space-y-3 border-teal/40">
        <h2 id="help-title" className="flex items-center gap-2 text-md font-semibold text-primary">
          <LifeBuoy className="size-5 text-teal" aria-hidden="true" /> Hilfe
        </h2>
        <p className="measure text-sm text-muted">{RG_NOTICE}</p>
        <p className="measure text-sm text-muted">
          Ein Echtgeldprodukt müsste hier auf Beratungsangebote, Sperrsysteme und gesetzliche Schutzmechanismen des jeweiligen Rechtsraums verweisen. Dieser Prototyp nennt bewusst keine konkreten Stellen, um nichts Falsches zu behaupten.
        </p>
        <LinkButton href="/help" variant="outline" className="self-start">
          Zur Hilfe & FAQ
        </LinkButton>
      </Card>

      {/* Dialoge — alle zweistufig */}
      <LimitDialog
        open={dialog === "pause"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          rg.pause(pauseMinutes);
          setDialog(null);
          toast({ tone: "info", title: `Pause für ${pauseLabel(pauseMinutes)} eingelegt.`, description: "Spielstarts sind bis dahin blockiert." });
        }}
        title="Pause einlegen?"
        description={`Für ${pauseLabel(pauseMinutes)} sind alle Spielstarts blockiert. Das Guthaben bleibt unverändert.`}
        acknowledgement="Ich möchte jetzt eine Pause einlegen."
        confirmLabel="Pause starten"
      />
      <LimitDialog
        open={dialog === "end-pause"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          rg.endPause();
          setDialog(null);
          toast({ tone: "info", title: "Pause beendet." });
        }}
        title="Pause vorzeitig beenden?"
        description="Du hast dir diese Pause selbst gesetzt. Möchtest du sie wirklich jetzt beenden?"
        acknowledgement="Ich habe die Entscheidung überdacht und möchte die Pause beenden."
        confirmLabel="Pause beenden"
        tone="danger"
      />
      <LimitDialog
        open={dialog === "exclude"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          rg.selfExclude();
          setDialog(null);
          toast({ tone: "info", title: "Selbstsperre aktiviert.", description: "Spielstarts sind blockiert, bis du die Sperre hier aufhebst." });
        }}
        title="Selbstsperre aktivieren?"
        description="Alle Spielstarts werden blockiert — auch nach Reload und auf jeder Seite. Aufheben ist nur hier möglich."
        acknowledgement="Ich verstehe, dass die Sperre erst nach ausdrücklicher Aufhebung endet."
        confirmLabel="Sperre aktivieren"
        tone="danger"
      />
      <LimitDialog
        open={dialog === "lift"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          rg.liftSelfExclusion();
          setDialog(null);
          toast({ tone: "info", title: "Selbstsperre aufgehoben." });
        }}
        title="Selbstsperre aufheben?"
        description="Du hast dich selbst gesperrt. Bitte nimm dir einen Moment: Möchtest du wirklich wieder spielen?"
        acknowledgement="Ich habe die Entscheidung überdacht und möchte die Sperre aufheben."
        confirmLabel="Sperre aufheben"
        tone="danger"
      />
      <LimitDialog
        open={dialog === "new-session"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          rg.startNewSession();
          setDialog(null);
          toast({ tone: "info", title: "Neue Sitzung begonnen.", description: "Das Zeitlimit zählt ab jetzt erneut." });
        }}
        title="Neue Sitzung beginnen?"
        description="Dein selbst gesetztes Zeitlimit ist erreicht. Eine neue Sitzung setzt die Spielzeit auf null; das Limit bleibt bestehen."
        acknowledgement="Ich möchte bewusst weiterspielen und eine neue Sitzung beginnen."
        confirmLabel="Neue Sitzung"
        tone="danger"
      />
    </div>
  );
}
