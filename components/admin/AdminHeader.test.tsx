import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => usePathnameMock() }));

import { AdminHeader } from "./AdminHeader";

describe("AdminHeader", () => {
  test("markiert den aktuellen Bereich über aria-current, nicht nur über Farbe", () => {
    usePathnameMock.mockReturnValue("/admin/users");
    render(<AdminHeader />);

    const activeLink = screen.getByRole("link", { name: "Nutzer" });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    const inactiveLink = screen.getByRole("link", { name: "Systemstatus" });
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  test("enthält keine Klasse mit Gold-Bezug (Admin-Bereich verzichtet bewusst auf Gold)", () => {
    usePathnameMock.mockReturnValue("/admin");
    const { container } = render(<AdminHeader />);
    expect(container.innerHTML).not.toMatch(/gold/i);
  });

  test("die Navigation ist ausgezeichnet und über ihren Namen auffindbar", () => {
    usePathnameMock.mockReturnValue("/admin");
    render(<AdminHeader />);
    expect(screen.getByRole("navigation", { name: "Admin-Navigation" })).toBeInTheDocument();
  });
});
