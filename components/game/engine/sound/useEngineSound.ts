"use client";

/**
 * Interner Einstiegspunkt der Engines für Klang. Die vertragliche Schnittstelle kommt aus dem
 * parallelen Auftrag „Klang-Infrastruktur" (lib/sound/types.ts, components/sound/useSound.ts) —
 * diese Datei reicht sie unverändert durch. Engines und die Sound-Helfer in diesem Ordner
 * importieren ausschließlich von hier, nie direkt von "@/lib/sound/types" bzw.
 * "@/components/sound/useSound", damit ein künftiger Wechsel der Infrastruktur an einer
 * einzigen Stelle bleibt.
 *
 * (Hinweis für Nachvollziehbarkeit: Zu Beginn dieser Aufgabe existierten lib/sound/** und
 * components/sound/** noch nicht — diese Datei enthielt bis zu deren Fertigstellung einen
 * klanglosen Platzhalter mit identischer Signatur, damit Engines bereits gegen den Vertrag
 * entwickelt und getestet werden konnten, ohne selbst Klangerzeugung zu implementieren. Beide
 * Dateien liegen inzwischen vor; seither reicht diese Datei sie nur noch durch.)
 */

export type { SoundName } from "@/lib/sound/types";
export type { UseSoundResult } from "@/components/sound/useSound";
export { useSound } from "@/components/sound/useSound";
