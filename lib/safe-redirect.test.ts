import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-redirect";

describe("safeNext", () => {
  it("lässt einen einfachen relativen Pfad unverändert durch", () => {
    expect(safeNext("/wallet")).toBe("/wallet");
  });

  it("erhält Query-String und Hash eines relativen Ziels", () => {
    expect(safeNext("/history?foo=bar#abschnitt")).toBe("/history?foo=bar#abschnitt");
  });

  it("fällt bei fehlendem next auf den Standardwert zurück", () => {
    expect(safeNext(null)).toBe("/profile");
    expect(safeNext(undefined)).toBe("/profile");
    expect(safeNext("")).toBe("/profile");
  });

  it("nutzt einen übergebenen Fallback statt /profile", () => {
    expect(safeNext(null, "/admin")).toBe("/admin");
    expect(safeNext("https://evil.example.com", "/admin")).toBe("/admin");
  });

  it("weist eine absolute URL mit fremder Origin ab", () => {
    expect(safeNext("https://evil.example.com/phish")).toBe("/profile");
    expect(safeNext("http://evil.example.com")).toBe("/profile");
  });

  it("weist ein protokollrelatives Ziel ab (//evil.example.com)", () => {
    expect(safeNext("//evil.example.com")).toBe("/profile");
    expect(safeNext("///evil.example.com")).toBe("/profile");
  });

  it("weist den Backslash-Trick ab (/\\evil.example.com wird von Browsern zu //evil.example.com normalisiert)", () => {
    expect(safeNext("/\\evil.example.com")).toBe("/profile");
    expect(safeNext("/\\/evil.example.com")).toBe("/profile");
  });

  it("weist ein Ziel mit eigenem Schema ab, auch ohne führenden Schrägstrich", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/profile");
    expect(safeNext("data:text/html,<script>alert(1)</script>")).toBe("/profile");
  });

  it("weist Pfad-Traversal ab", () => {
    expect(safeNext("/profile/../../etc/passwd")).toBe("/profile");
    expect(safeNext("/..")).toBe("/profile");
  });

  it("weist eingebettete Steuerzeichen ab, die Browser beim Navigieren entfernen würden", () => {
    // Ein echtes Tab-Zeichen zwischen den Schrägstrichen würde von Browsern beim Parsen entfernt
    // ("/\t/evil.example.com" → "//evil.example.com") und wäre dann protokollrelativ.
    expect(safeNext("/\t/evil.example.com")).toBe("/profile");
    expect(safeNext("/\n/evil.example.com")).toBe("/profile");
  });

  it("lässt einen Pfad mit ungewöhnlichen, aber harmlosen Zeichen durch", () => {
    expect(safeNext("/game/neon-nights")).toBe("/game/neon-nights");
  });
});
