/**
 * Rein dekoratives 3D-Objekt der Hero-Sektion (Startseite): ein Casino-Chip aus Glas, Metall
 * und Licht, gebaut ausschließlich aus verschachtelten CSS-Transforms und einem Inline-SVG —
 * keine neue Abhängigkeit, kein WebGL, kein externes Asset. Trägt keine Information allein
 * (aria-hidden auf dem Wurzelelement genügt, weil Screenreader den gesamten Teilbaum dann
 * überspringen), reine Atmosphäre neben der textlichen Hero-Botschaft (components/home/Hero.tsx).
 *
 * Aufbau in drei Ebenen, damit sich Schweben und Kippen nicht gegenseitig überschreiben (beide
 * animieren `transform`, aber jede Ebene besitzt ihr eigenes `transform` unabhängig von den
 * anderen):
 * 1. `.depth-scene` (äußerste Ebene) — reine Perspektive, keine Bewegung.
 * 2. `.anim-float` — die langsame Auf-Ab-Bewegung (bereits bei prefers-reduced-motion
 *    deaktiviert, siehe app/globals.css).
 * 3. `.tilt-card.hero-chip-tilt` — feste Ruhepose (rotateX/rotateY) plus die vorhandene,
 *    zeigergerätgebundene Hover-Neigung von `.tilt-card` (ebenfalls bereits bei
 *    prefers-reduced-motion deaktiviert). `.hero-chip-tilt` ist eine neue, rein additive
 *    Ergänzung am Ende von app/globals.css.
 */

/** Zwölf Kerben am Chip-Rand, gleichmäßig verteilt — klassisches Poker-Chip-Muster, das aus der
 * Nähe zugleich an die Speichen eines Rads erinnert. */
const NOTCH_ANGLES = Array.from({ length: 12 }, (_, index) => index * 30);

export function HeroObject() {
  return (
    <div data-testid="hero-object" aria-hidden="true" className="depth-scene mx-auto aspect-square w-48 sm:w-64 lg:w-72">
      <div className="anim-float h-full w-full" style={{ transformStyle: "preserve-3d" }}>
        <div className="tilt-card hero-chip-tilt h-full w-full">
          <svg viewBox="0 0 200 200" className="h-full w-full" style={{ filter: "drop-shadow(var(--shadow-raised))" }}>
            <defs>
              {/* Metall-Ring: Aufhellung zu Gold, Übergang zu einem neutralen Umriss-Ton am
                  Rand — dieselbe Leitidee wie --metal-sheen, hier als SVG-Verlauf nachgebaut,
                  weil ein CSS-background-image nicht auf einen SVG-Stroke/Fill wirkt. */}
              <linearGradient id="hero-chip-ring" x1="15%" y1="0%" x2="85%" y2="100%">
                <stop offset="0%" style={{ stopColor: "var(--gold-strong)" }} />
                <stop offset="45%" style={{ stopColor: "var(--gold)" }} />
                <stop offset="100%" style={{ stopColor: "var(--border-control)" }} />
              </linearGradient>
              {/* Glasfläche: violetter Akzent im oberen linken Fokuspunkt, ausklingend über die
                  beiden Oberflächen-Töne — erzeugt die Tiefenwirkung einer gewölbten Fläche. */}
              <radialGradient id="hero-chip-face" cx="36%" cy="30%" r="80%">
                <stop offset="0%" style={{ stopColor: "var(--accent-strong)" }} stopOpacity={0.85} />
                <stop offset="55%" style={{ stopColor: "var(--bg-elevated)" }} />
                <stop offset="100%" style={{ stopColor: "var(--bg-base)" }} />
              </radialGradient>
              {/* Weicher Innenschatten: dunkelt den unteren Rand der Glasfläche leicht ab. */}
              <radialGradient id="hero-chip-shadow" cx="50%" cy="84%" r="55%">
                <stop offset="0%" style={{ stopColor: "var(--bg-base)" }} stopOpacity={0.6} />
                <stop offset="100%" style={{ stopColor: "var(--bg-base)" }} stopOpacity={0} />
              </radialGradient>
              {/* Reflexion: helles, weiches Glanzlicht oben links, wie Licht auf einer
                  gewölbten Glasfläche — zusätzliche SVG-Ebene statt Pseudo-Element. */}
              <radialGradient id="hero-chip-reflection" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style={{ stopColor: "var(--text-primary)" }} stopOpacity={0.38} />
                <stop offset="100%" style={{ stopColor: "var(--text-primary)" }} stopOpacity={0} />
              </radialGradient>
            </defs>

            <circle cx="100" cy="100" r="92" fill="url(#hero-chip-ring)" />
            {NOTCH_ANGLES.map((angle) => (
              <rect
                key={angle}
                x="96"
                y="10"
                width="8"
                height="16"
                rx="2"
                style={{ fill: "var(--bg-base)" }}
                transform={`rotate(${angle} 100 100)`}
              />
            ))}
            <circle cx="100" cy="100" r="74" fill="url(#hero-chip-face)" style={{ stroke: "var(--border-subtle)" }} strokeWidth="1" />
            <circle cx="100" cy="100" r="54" fill="none" style={{ stroke: "var(--gold)" }} strokeOpacity="0.45" strokeWidth="1.5" />
            <circle cx="100" cy="100" r="74" fill="url(#hero-chip-shadow)" />
            <ellipse cx="72" cy="58" rx="44" ry="26" fill="url(#hero-chip-reflection)" transform="rotate(-20 72 58)" />
          </svg>
        </div>
      </div>
    </div>
  );
}
