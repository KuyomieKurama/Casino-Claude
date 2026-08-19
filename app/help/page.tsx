import type { Metadata } from "next";
import Link from "next/link";
import { CURRENCY_NOTICE, PRODUCT_NAME, RG_NOTICE } from "@/lib/constants";

export const metadata: Metadata = { title: "Hilfe & FAQ" };

const faq = [
  {
    q: "Ist das ein echtes Casino?",
    a: `Nein. ${PRODUCT_NAME} spielt ausschließlich mit Credits, einer Spielwährung ohne Geldwert. Es gibt kein Echtgeld, keine Einzahlung, keine Auszahlung, keine Zahlungsanbindung und keine Lizenz.`,
  },
  {
    q: "Was sind Credits?",
    a: `${CURRENCY_NOTICE} Dein Konto startet mit 10.000,00 Credits; du kannst das Guthaben jederzeit aufstocken oder zurücksetzen.`,
  },
  {
    q: "Wie entsteht das Ergebnis einer Runde?",
    a: "Über eine dokumentierte Auszahlungstabelle und einen gesäten Zufallsgenerator (mulberry32), serverseitig ausgewertet. Jede Runde ist über ihren Seed reproduzierbar. Es gibt keinen Zustand zwischen Runden und keine Mechanik, die nach Verlusten die Chancen verändert. Die Tabelle ist auf der Spieldetailseite einsehbar.",
  },
  {
    q: "Warum zeigt die Ergebnisanzeige „−0,60 Credits“, obwohl etwas zurückkam?",
    a: "Angezeigt wird die Nettoveränderung: Rückgabe minus Einsatz. Eine Rückgabe unter dem Einsatz ist ein Verlust und wird nicht als Gewinn dargestellt.",
  },
  {
    q: "Warum gibt es kein Autoplay und keinen Turbo-Modus?",
    a: "Beides entkoppelt Entscheidung und Ergebnis. Darauf wird bewusst verzichtet — genauso wie auf betonte Beinahe-Treffer und Gewinnfanfaren bei Verlusten.",
  },
  {
    q: "Warum werden bei der Anmeldung keine Identitätsdaten oder Altersnachweise verlangt?",
    a: "Weil hier ausschließlich mit Spielwährung ohne Geldwert gespielt wird. Ein Echtgeldprodukt bräuchte — je nach Rechtsraum — Identitäts- und Altersprüfung (KYC), Limits, Sperrsysteme und weitere Schutzmaßnahmen. Nichts davon ist hier umgesetzt.",
  },
  {
    q: "Wird mein Passwort gespeichert?",
    a: "Ja, aber nicht im Klartext: better-auth speichert nur einen sicheren Hash in der Datenbank. Bitte trotzdem kein Passwort verwenden, das du auch anderswo einsetzt.",
  },
  {
    q: "Wo werden meine Daten gespeichert?",
    a: "Konto, Guthaben, Spielrunden und Einstellungen liegen serverseitig in einer PostgreSQL-Datenbank. Favoriten und ein paar rein lokale Anzeigeeinstellungen liegen zusätzlich im LocalStorage deines Browsers. Es gibt kein Tracking und keine Analytics.",
  },
];

export default function HelpPage() {
  return (
    <div className="anim-panel-in mx-auto max-w-3xl space-y-8 pt-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Hilfe & FAQ</h1>
        <p className="mt-1 text-sm text-muted">Antworten auf die häufigsten Fragen sowie die Nutzungsbedingungen im Überblick.</p>
      </header>
      <dl className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface">
        {faq.map((item) => (
          <div key={item.q} className="p-5">
            <dt className="text-base font-semibold text-primary">{item.q}</dt>
            <dd className="measure mt-2 text-sm text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
      <section className="rounded-card border border-border-subtle bg-surface p-5">
        <h2 className="text-md font-semibold text-primary">Nutzungsbedingungen</h2>
        <p className="measure mt-2 text-sm text-muted">{CURRENCY_NOTICE}</p>
        <p className="measure mt-2 text-sm text-muted">
          Keine Lizenzangaben, keine Zahlungsanbindung, keine Auszahlungen. Alle Spieltitel, Anbieter und Aktionen sind frei erfunden.
        </p>
      </section>
      <section className="rounded-card border border-teal/40 bg-surface p-5">
        <h2 className="text-md font-semibold text-primary">Responsible Gaming</h2>
        <p className="measure mt-2 text-sm text-muted">{RG_NOTICE}</p>
        <Link href="/responsible-gaming" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-gold-strong">
          Zum Bereich Responsible Gaming
        </Link>
      </section>
    </div>
  );
}
