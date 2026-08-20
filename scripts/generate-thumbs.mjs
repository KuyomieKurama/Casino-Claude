// Erzeugt abstrakte SVG-Vorschaubilder für alle Spiele in public/thumbs/.
// Keine realen Marken, keine Personen — nur geometrische Motive in der Farbwelt des Designsystems.
// Aufruf: node scripts/generate-thumbs.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "thumbs");
mkdirSync(outDir, { recursive: true });

// Synchronisiert mit den Tokenwerten aus app/globals.css (Redesign-Etappe „System-Fundament").
const PALETTE = {
  base: "#07080D",
  surface: "#0D0F17",
  elevated: "#131622",
  gold: "#D6B36A",
  goldStrong: "#F0D89A",
  accent: "#A78BFA",
  muted: "#A6A8B3",
  border: "#1E2029",
};

// slug → [Motiv, Akzentfarbe, Nebenfarbe]
const games = [
  ["classic-fruit", "circles", "#C2694F", PALETTE.gold],
  ["neon-nights", "skyline", PALETTE.accent, PALETTE.gold],
  ["kupferschacht", "stack", "#B87333", "#6E4A2A"],
  ["codex-aurelia", "frame", PALETTE.gold, "#3A2E1A"],
  ["salzwind", "compass", "#7FB3D5", "#D8C9A3"],
  ["sandkoenigin", "obelisk", "#C9A063", PALETTE.gold],
  ["mystic-jungle", "leaves", "#4F9D69", PALETTE.accent],
  ["luxury-7s", "sevens", PALETTE.gold, PALETTE.muted],
  ["staubpfad", "windmill", "#C08457", "#8C5A3C"],
  ["zunderschuppe", "scales", "#B5433A", PALETTE.gold],
  ["lunara-drift", "moons", "#8FA6C9", "#D8DEE9"],
  ["european-roulette", "wheel1", "#8B2E3A", "#2E6B4A"],
  ["american-roulette", "wheel2", "#8B2E3A", "#2E6B4A"],
  ["classic-blackjack", "cards2", "#2E6B4A", PALETTE.gold],
  ["vip-blackjack", "cards2", PALETTE.gold, "#2A2F38"],
  ["baccarat", "cards3", "#5B4A7A", PALETTE.gold],
  ["plinko-demo", "dots", PALETTE.accent, PALETTE.muted],
  ["mines-demo", "grid", PALETTE.muted, PALETTE.accent],
  ["dice-demo", "dice", "#3E5A8A", "#F2F4F7"],
  ["wheel-demo", "segments", PALETTE.gold, PALETTE.accent],
  ["live-roulette-demo", "table-wheel", "#8B2E3A", PALETTE.accent],
  ["live-blackjack-demo", "table-arc", "#2E6B4A", PALETTE.accent],
  ["live-baccarat-demo", "table-grid", "#5B4A7A", PALETTE.accent],
];

const W = 400;
const H = 300;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function motif(kind, a, b, rnd) {
  const cx = W / 2;
  const cy = H / 2;
  switch (kind) {
    case "circles":
      return [0, 1, 2].map((i) => `<circle cx="${100 + i * 100}" cy="${cy}" r="42" fill="${i === 1 ? b : a}" opacity="0.9"/>`).join("");
    case "skyline": {
      let s = "";
      for (let x = 20; x < W; x += 34) {
        const h = 60 + rnd() * 140;
        s += `<rect x="${x}" y="${H - 30 - h}" width="22" height="${h}" fill="${PALETTE.elevated}" stroke="${rnd() < 0.5 ? a : b}" stroke-width="2"/>`;
      }
      return s + `<line x1="0" y1="${H - 30}" x2="${W}" y2="${H - 30}" stroke="${a}" stroke-width="2"/>`;
    }
    case "stack":
      return [0, 1, 2, 3, 4].map((i) => `<rect x="${60 + i * 12}" y="${230 - i * 38}" width="${280 - i * 24}" height="28" rx="4" fill="${i % 2 ? b : a}" opacity="0.9"/>`).join("");
    case "frame":
      return `<rect x="70" y="40" width="260" height="220" rx="6" fill="none" stroke="${a}" stroke-width="3"/><rect x="90" y="60" width="220" height="180" rx="4" fill="${b}" opacity="0.7"/><line x1="200" y1="70" x2="200" y2="230" stroke="${a}" stroke-width="2"/>`;
    case "compass": {
      let s = `<circle cx="${cx}" cy="${cy}" r="90" fill="none" stroke="${a}" stroke-width="3"/>`;
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const r = i % 2 ? 50 : 85;
        s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(ang) * r}" y2="${cy + Math.sin(ang) * r}" stroke="${i % 2 ? b : a}" stroke-width="${i % 2 ? 2 : 4}"/>`;
      }
      return s;
    }
    case "obelisk":
      return `<polygon points="200,40 230,250 170,250" fill="${a}"/><polygon points="200,40 215,120 185,120" fill="${b}"/><rect x="120" y="250" width="160" height="14" fill="${b}"/>`;
    case "leaves": {
      let s = "";
      for (let i = 0; i < 9; i++) {
        const x = 40 + rnd() * 320;
        const y = 40 + rnd() * 220;
        const r = 20 + rnd() * 40;
        s += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r / 2.5}" transform="rotate(${rnd() * 180} ${x} ${y})" fill="${rnd() < 0.5 ? a : b}" opacity="0.75"/>`;
      }
      return s;
    }
    case "sevens":
      return [0, 1, 2]
        .map((i) => `<text x="${95 + i * 105}" y="200" font-family="Georgia, serif" font-size="140" font-weight="700" fill="${i === 1 ? b : a}" text-anchor="middle">7</text>`)
        .join("");
    case "windmill":
      return `<line x1="200" y1="150" x2="200" y2="270" stroke="${b}" stroke-width="10"/>${[0, 1, 2, 3].map((i) => `<rect x="196" y="60" width="8" height="90" rx="4" fill="${a}" transform="rotate(${i * 90} 200 150)"/>`).join("")}<circle cx="200" cy="150" r="10" fill="${b}"/>`;
    case "scales": {
      let s = "";
      for (let row = 0; row < 6; row++) for (let col = 0; col < 8; col++) {
        const x = 30 + col * 50 + (row % 2 ? 25 : 0);
        const y = 40 + row * 44;
        s += `<path d="M${x} ${y} a25 25 0 0 0 50 0 a25 25 0 0 1 -50 0z" fill="${(row + col) % 3 ? a : b}" opacity="0.85"/>`;
      }
      return s;
    }
    case "moons":
      return [0, 1, 2, 3, 4]
        .map((i) => `<circle cx="${60 + i * 70}" cy="${cy}" r="26" fill="${a}"/><circle cx="${60 + i * 70 + (i - 2) * 12}" cy="${cy}" r="26" fill="${i === 2 ? "transparent" : PALETTE.surface}"/>`)
        .join("");
    case "wheel1":
    case "wheel2": {
      const n = kind === "wheel1" ? 37 : 38;
      let s = "";
      for (let i = 0; i < n; i++) {
        const a1 = (i / n) * Math.PI * 2;
        const a2 = ((i + 1) / n) * Math.PI * 2;
        const col = i === 0 || (kind === "wheel2" && i === 19) ? b : i % 2 ? a : PALETTE.elevated;
        s += `<path d="M${cx} ${cy} L${cx + Math.cos(a1) * 120} ${cy + Math.sin(a1) * 120} A120 120 0 0 1 ${cx + Math.cos(a2) * 120} ${cy + Math.sin(a2) * 120}Z" fill="${col}"/>`;
      }
      return s + `<circle cx="${cx}" cy="${cy}" r="60" fill="${PALETTE.surface}" stroke="${PALETTE.gold}" stroke-width="2"/>`;
    }
    case "cards2":
      return `<rect x="110" y="70" width="110" height="160" rx="10" fill="${PALETTE.elevated}" stroke="${a}" stroke-width="3" transform="rotate(-8 165 150)"/><rect x="180" y="70" width="110" height="160" rx="10" fill="${PALETTE.elevated}" stroke="${b}" stroke-width="3" transform="rotate(8 235 150)"/>`;
    case "cards3":
      return [0, 1, 2].map((i) => `<rect x="${70 + i * 95}" y="80" width="90" height="140" rx="10" fill="${PALETTE.elevated}" stroke="${i === 1 ? b : a}" stroke-width="3"/>`).join("");
    case "dots": {
      let s = "";
      for (let row = 0; row < 7; row++) for (let col = 0; col <= row; col++) {
        s += `<circle cx="${200 + (col - row / 2) * 40}" cy="${40 + row * 36}" r="6" fill="${row === 6 ? b : a}"/>`;
      }
      return s;
    }
    case "grid": {
      let s = "";
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        s += `<rect x="${90 + c * 46}" y="${40 + r * 46}" width="38" height="38" rx="6" fill="${PALETTE.elevated}" stroke="${rnd() < 0.15 ? b : a}" stroke-width="2"/>`;
      }
      return s;
    }
    case "dice":
      return `<rect x="120" y="70" width="160" height="160" rx="24" fill="${a}"/>${[[160, 110], [240, 110], [200, 150], [160, 190], [240, 190]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${b}"/>`).join("")}`;
    case "segments": {
      let s = "";
      for (let i = 0; i < 12; i++) {
        const a1 = (i / 12) * Math.PI * 2;
        const a2 = ((i + 1) / 12) * Math.PI * 2;
        s += `<path d="M${cx} ${cy} L${cx + Math.cos(a1) * 125} ${cy + Math.sin(a1) * 125} A125 125 0 0 1 ${cx + Math.cos(a2) * 125} ${cy + Math.sin(a2) * 125}Z" fill="${i % 3 === 0 ? a : i % 3 === 1 ? b : PALETTE.elevated}"/>`;
      }
      return s + `<polygon points="200,10 190,35 210,35" fill="${PALETTE.goldStrong}"/>`;
    }
    case "table-wheel":
      return `<path d="M20 280 Q200 60 380 280Z" fill="${a}" opacity="0.6"/><circle cx="200" cy="200" r="50" fill="${PALETTE.elevated}" stroke="${b}" stroke-width="3"/><rect x="150" y="30" width="100" height="14" rx="7" fill="${b}"/>`;
    case "table-arc":
      return `<path d="M20 280 Q200 40 380 280Z" fill="${a}" opacity="0.6"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${60 + i * 47}" cy="${230 - Math.sin((i / 6) * Math.PI) * 60}" r="14" fill="none" stroke="${b}" stroke-width="2"/>`).join("")}<rect x="150" y="30" width="100" height="14" rx="7" fill="${b}"/>`;
    case "table-grid": {
      let s = `<path d="M20 280 Q200 60 380 280Z" fill="${a}" opacity="0.6"/>`;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) s += `<rect x="${60 + c * 36}" y="${40 + r * 30}" width="26" height="22" rx="3" fill="none" stroke="${b}" stroke-width="1.5"/>`;
      return s;
    }
    default:
      return "";
  }
}

for (const [slug, kind, a, b] of games) {
  const rnd = mulberry32(hash(slug));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-hidden="true">
<rect width="${W}" height="${H}" fill="${PALETTE.surface}"/>
<rect x="0" y="0" width="${W}" height="1" fill="${PALETTE.gold}"/>
${motif(kind, a, b, rnd)}
</svg>`;
  writeFileSync(join(outDir, `${slug}.svg`), svg, "utf8");
}
console.log(`${games.length} Vorschaubilder nach ${outDir} geschrieben.`);
