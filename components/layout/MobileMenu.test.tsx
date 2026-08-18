import { useRef, useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MobileMenu } from "./MobileMenu";

/**
 * Harnisch mit echtem Auslöser-Button: MobileMenu verlangt ein `triggerRef`-Element, an das der
 * Fokus beim Schließen zurückgeht — dieselbe Rolle wie der Menü-Knopf in Header.tsx.
 */
function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Öffnen
      </button>
      <MobileMenu open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} title="Testmenü">
        <a href="/a">Link A</a>
        <a href="/b">Link B</a>
      </MobileMenu>
    </div>
  );
}

describe("MobileMenu", () => {
  test("rendert nichts, solange geschlossen", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("öffnet über den Auslöser und fokussiert zuerst den Schließen-Button", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    expect(screen.getByRole("dialog", { name: "Testmenü" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menü schließen" })).toHaveFocus();
  });

  test("Escape schließt das Menü und gibt den Fokus an den Auslöser zurück", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("Klick auf den Hintergrund schließt das Menü", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    fireEvent.click(screen.getByTestId("mobile-menu-backdrop"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Tab am letzten Element springt zurück zum ersten (Fokusfalle)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    const closeButton = screen.getByRole("button", { name: "Menü schließen" });
    const lastLink = screen.getByRole("link", { name: "Link B" });
    lastLink.focus();
    expect(lastLink).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(closeButton).toHaveFocus();
  });

  test("Umschalt+Tab am ersten Element springt zum letzten (Fokusfalle)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    const closeButton = screen.getByRole("button", { name: "Menü schließen" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(screen.getByRole("link", { name: "Link B" })).toHaveFocus();
  });

  test("der Schließen-Button beendet das Menü ebenfalls", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    fireEvent.click(screen.getByRole("button", { name: "Menü schließen" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("die Fläche bleibt bei 320 px ohne horizontales Scrollen (jsdom layoutet nicht real, deshalb Klassenprüfung statt Pixelmessung)", () => {
    // Das Panel ist `fixed` positioniert (kein Einfluss auf die Dokumentbreite) und über
    // min(320px, 85vw) begrenzt — bei genau 320 px Viewportbreite entspricht das 85 % = 272 px,
    // also strikt innerhalb des Viewports, nie breiter als der sichtbare Bereich.
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toMatch(/\babsolute\b/);
    expect(dialog.className).toMatch(/w-\[min\(320px,85vw\)\]/);
  });
});
