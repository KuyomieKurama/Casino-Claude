import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME, RG_NOTICE } from "@/lib/constants";

export const metadata: Metadata = { title: "Hilfe & FAQ" };

const faq = [
  {
    q: "Ist das ein echtes Casino?",
    a: `Nein. ${PRODUCT_NAME} ist ein klickbarer Prototyp zur Demonstration von Oberfläche, Bedienung und Informationsarchitektur. Es gibt kein Echtgeld, keine Einzahlung, keine Auszahlung, keine Zahlungsanbindung und keine Lizenz.`,
  },
  {
    q: "Was sind Demo-Credits?",
    a: "Ein simuliertes Guthaben, das nur in diesem Browser gespeichert wird. Du kannst es jederzeit erhöhen oder auf 1.000,00 zurücksetzen. Es hat keinen Gegenwert.",
  },
  {
    q: "Wie entsteht das Ergebnis einer Runde?",
    a: "Über eine dokumentierte Auszahlungstabelle und einen gesäten Zufallsgenerator (mulberry32). Jede Runde ist über ihren Seed reproduzierbar. Es gibt keinen Zustand zwischen Runden und keine Mechanik, die nach Verlusten die Chancen verändert. Die Tabelle ist auf der Spieldetailseite einsehbar.",
  },
  {
    q: "Warum zeigt die Ergebnisanzeige „−0,60 Credits“, obwohl etwas zurückkam?",
    a: "Angezeigt wird die Nettoveränderung: Rückgabe minus Einsatz. Eine Rückgabe unter dem Einsatz ist ein Verlust und wird nicht als Gewinn dargestellt.",
  },
  {
    q: "Warum gibt es kein Autoplay und keinen Turbo-Modus?",
    a: "Beides entkoppelt Entscheidung und Ergebnis. Der Prototyp verzichtet bewusst darauf — genauso wie auf betonte Beinahe-Treffer und Gewinnfanfaren bei Verlusten.",
  },
  {
    q: "Was bedeutet der DEMO-Streifen oben?",
    a: "Er kennzeichnet auf jeder Seite, dass es sich um einen Prototyp ohne Echtgeld handelt. Er lässt sich absichtlich nicht schließen.",
  },
  {
    q: "Warum werden bei der Anmeldung keine Identitätsdaten oder Altersnachweise verlangt?",
    a: "Weil dies eine Demo ist. Ein Echtgeldprodukt bräuchte — je nach Rechtsraum — Identitäts- und Altersprüfung (KYC), Limits, Sperrsysteme und weitere Schutzmaßnahmen. Nichts davon ist hier umgesetzt oder simuliert.",
  },
  {
    q: "Wird mein Passwort gespeichert?",
    a: "Nein. Es wird nur geprüft und sofort verworfen — nicht gespeichert, nicht gehasht, nicht protokolliert. Bitte trotzdem kein echtes Passwort verwenden.",
  },
  {
    q: "Wo werden meine Daten gespeichert?",
    a: "Ausschließlich im LocalStorage deines Browsers unter einem einzigen Schlüssel. Es gibt keinen Server, keine Datenbank, kein Tracking und keine Analytics.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-6">
      <header>
        <h1 className="font-display text-2xl text-primary sm:text-3xl">Hilfe & FAQ</h1>
        <p className="mt-1 text-sm text-muted">Antworten auf die häufigsten Fragen zum Prototyp.</p>
      </header>
      <dl className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface">
        {faq.map((item) => (
          <div key={item.q} className="p-5">
            <dt className="text-base font-semibold text-primary">{item.q}</dt>
            <dd className="measure mt-2 text-sm text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
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
