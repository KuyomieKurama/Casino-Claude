---
name: security-review
description: Sicherheitsprüfung von Velora-Änderungen, insb. bei neuen Features, User-Input-Handling, LocalStorage-Zugriff oder Schichtregeln-Verstößen. Kein Backend/Secrets-Review nötig (Velora ist purer Frontend).
---

# Skill: security-review

Defensiver Review für einen clientseitigen Casino-Prototyp ohne Backend, Datenbank oder Secrets.
Kontext aus `CLAUDE.md` und `ENGINE-BRIEF.md`.

## Prüfpunkte (Velora-relevant)
- **Passwort-Handling:** Eingabe validiert, sofort verworfen, nicht gespeichert/gehasht/geloggt.
- **Admin-Gate:** Clientseitiger offener Umschalter (`components/admin/AdminGate.tsx`), kein Passwortschutz (ist Anzeigelogik, kein Schutz).
- **LocalStorage-Zugriff:** nur in `lib/storage.ts`; Schema-Versionierung (`velora.demo.v1`), JSON-Fehlerfall abgefangen, fremde Versionen verworfen.
- **CreditsMinor-Handling:** keine Float-Arithmetik, keine Grenzfälle mit Fließkommafehlern, nur ganzzahlige Hundertstel.
- **Input-Validierung:** User-Eingaben (z. B. Wetten, Spiel-IDs) vor Verwendung prüfen; `RequireUser`-Gating ist reine Anzeigelogik.
- **Dark Patterns:** kein Autoplay, Turbospin, Near Miss, Loss Disguised as Win, vorausgewählte Bonusoptionen, Ton, Druck-Countdowns, künstliche Verknappung, Gewinnversprechen.
- **XSS/Injection:** kein `dangerouslySetInnerHTML`, alle Texte escaped; sichere Paytable-Struktur.
- **Rahmen-UI:** keine Secrets in Logs/Fehlermeldungen, keine Stack-Traces an User.

## Ausgabeformat
```md
## Zusammenfassung
## Kritische Funde
## Hohe Risiken
## Mittlere Risiken
## Positive Beobachtungen
```
Jeder Fund: **Schweregrad · Datei:Stelle · Ursache · realistische Beeinträchtigung · konkrete Behebung**.

## Regeln
- Nur Vermutetes nicht als bestätigt darstellen; Unsicheres als `Zu verifizieren` kennzeichnen.
- Nichts als „sicher" bestätigen, das nur oberflächlich geprüft wurde.
- Defensiver Fokus; keine ausnutzbaren Exploits ausarbeiten.
