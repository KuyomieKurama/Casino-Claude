import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildStaticSecurityHeaders } from "./security-headers";

/**
 * Tests für die reinen Bausteine der HTTP-Sicherheitsheader. Bewusst ohne process.env: Beide
 * Funktionen nehmen `isProduction` als Parameter entgegen (siehe Kommentar in
 * security-headers.ts), deshalb lassen sich Produktions- und Entwicklungsvariante hier direkt
 * und ohne Umgebungsmanipulation gegenüberstellen.
 */

const SAMPLE_NONCE = "cmFuZG9tLW5vbmNlLXdlcnQ=";

describe("buildContentSecurityPolicy", () => {
  it("enthält alle vorgeschriebenen Direktiven in Produktion", () => {
    const csp = buildContentSecurityPolicy(SAMPLE_NONCE, true);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("setzt den übergebenen Nonce in script-src ein", () => {
    const csp = buildContentSecurityPolicy(SAMPLE_NONCE, true);

    expect(csp).toContain(`script-src 'self' 'nonce-${SAMPLE_NONCE}' 'strict-dynamic'`);
  });

  it("verbietet unsafe-inline und unsafe-eval in script-src in Produktion", () => {
    const csp = buildContentSecurityPolicy(SAMPLE_NONCE, true);
    const scriptSrcDirective = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));

    expect(scriptSrcDirective).toBeDefined();
    expect(scriptSrcDirective).not.toContain("unsafe-inline");
    expect(scriptSrcDirective).not.toContain("unsafe-eval");
  });

  it("erlaubt unsafe-eval in script-src nur in der Entwicklung (Fast Refresh)", () => {
    const devCsp = buildContentSecurityPolicy(SAMPLE_NONCE, false);
    const prodCsp = buildContentSecurityPolicy(SAMPLE_NONCE, true);

    expect(devCsp).toContain("script-src 'self' 'nonce-" + SAMPLE_NONCE + "' 'strict-dynamic' 'unsafe-eval'");
    expect(prodCsp).not.toContain("unsafe-eval");
  });

  it("erzwingt upgrade-insecure-requests nur in Produktion", () => {
    const prodCsp = buildContentSecurityPolicy(SAMPLE_NONCE, true);
    const devCsp = buildContentSecurityPolicy(SAMPLE_NONCE, false);

    expect(prodCsp).toContain("upgrade-insecure-requests");
    // In der Entwicklung liefe der Next-Dev-Server nur über http://localhost — eine erzwungene
    // Umleitung auf https würde jede Anfrage brechen (dieselbe Begründung wie bei HSTS).
    expect(devCsp).not.toContain("upgrade-insecure-requests");
  });

  it("liefert eine einzeilige Zeichenkette ohne Zeilenumbrüche", () => {
    const csp = buildContentSecurityPolicy(SAMPLE_NONCE, true);

    expect(csp).not.toContain("\n");
    expect(csp).not.toContain("\r");
  });

  it("trennt Direktiven mit Semikolon", () => {
    const csp = buildContentSecurityPolicy(SAMPLE_NONCE, true);
    const directives = csp.split(";").map((part) => part.trim());

    expect(directives.length).toBeGreaterThanOrEqual(11);
    expect(directives.every((directive) => directive.length > 0)).toBe(true);
  });

  it("wirft nicht bei leerem Nonce-Wert, baut aber trotzdem eine gültige Zeichenkette", () => {
    expect(() => buildContentSecurityPolicy("", true)).not.toThrow();
    expect(buildContentSecurityPolicy("", true)).toContain("script-src 'self' 'nonce-' 'strict-dynamic'");
  });

  it("übernimmt Sonderzeichen im Nonce unverändert (Base64-Alphabet inkl. + / =)", () => {
    const specialNonce = "ab+CD/12==";
    const csp = buildContentSecurityPolicy(specialNonce, true);

    expect(csp).toContain(`'nonce-${specialNonce}'`);
  });

  it("enthält kein 'unsafe-inline' im script-src, auch nicht in der Entwicklung", () => {
    const devCsp = buildContentSecurityPolicy(SAMPLE_NONCE, false);
    const scriptSrcDirective = devCsp.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));

    expect(scriptSrcDirective).not.toContain("'unsafe-inline'");
  });
});

describe("buildStaticSecurityHeaders", () => {
  it("enthält X-Content-Type-Options: nosniff", () => {
    const headers = buildStaticSecurityHeaders(true);

    expect(headers).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
  });

  it("enthält Referrer-Policy: strict-origin-when-cross-origin", () => {
    const headers = buildStaticSecurityHeaders(true);

    expect(headers).toContainEqual({ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" });
  });

  it("enthält Permissions-Policy mit abgeschalteter Kamera, Mikrofon und Geolokalisierung", () => {
    const headers = buildStaticSecurityHeaders(true);
    const permissionsPolicy = headers.find((header) => header.key === "Permissions-Policy");

    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy?.value).toContain("camera=()");
    expect(permissionsPolicy?.value).toContain("microphone=()");
    expect(permissionsPolicy?.value).toContain("geolocation=()");
  });

  it("enthält Strict-Transport-Security in Produktion mit zwei Jahren max-age und includeSubDomains", () => {
    const headers = buildStaticSecurityHeaders(true);

    expect(headers).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  });

  it("enthält KEIN Strict-Transport-Security in der Entwicklung (würde localhost dauerhaft auf https zwingen)", () => {
    const headers = buildStaticSecurityHeaders(false);

    expect(headers.find((header) => header.key === "Strict-Transport-Security")).toBeUndefined();
  });

  it("liefert in Entwicklung und Produktion dieselben Basis-Header (nur HSTS unterscheidet sich)", () => {
    const devHeaders = buildStaticSecurityHeaders(false);
    const prodHeaders = buildStaticSecurityHeaders(true);
    const prodWithoutHsts = prodHeaders.filter((header) => header.key !== "Strict-Transport-Security");

    expect(devHeaders).toEqual(prodWithoutHsts);
  });

  it("enthält keinen Content-Security-Policy- oder X-Powered-By-Header (die gehören nicht in die statische Liste)", () => {
    const headers = buildStaticSecurityHeaders(true);
    const keys = headers.map((header) => header.key.toLowerCase());

    expect(keys).not.toContain("content-security-policy");
    expect(keys).not.toContain("x-powered-by");
  });
});
