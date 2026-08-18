/**
 * jsdom (Stand 26.1.0, siehe package.json) implementiert `HTMLDialogElement.showModal()`/
 * `close()` nicht — `components/ui/Modal.tsx` ruft genau diese Methoden auf. Dieser Polyfill
 * bildet nur das für Tests relevante Verhalten nach (`open`-Attribut setzen/entfernen, ein
 * "close"-Event feuern), keine vollständige Spezifikationstreue (kein echter Fokus-Trap, kein
 * `::backdrop`) — ausreichend, um Bestätigungsdialoge (ConfirmDialog, LimitDialog) in
 * Komponententests zu öffnen und zu bedienen.
 *
 * Kein Datei-Suffix `.test.ts`, damit Vitest diese Datei nicht selbst als Testdatei einsammelt
 * (`vitest.config.ts`: `include: ["**​/*.test.{ts,tsx}"]`).
 */
export function installDialogPolyfill(): void {
  if (typeof HTMLDialogElement === "undefined") return;
  if (typeof HTMLDialogElement.prototype.showModal === "function") return;

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
