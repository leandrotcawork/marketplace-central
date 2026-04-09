import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("has aria-label with status", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByLabelText("Status: active")).toBeInTheDocument();
  });

  it("uses emerald classes for active", () => {
    const { container } = render(<StatusBadge status="active" />);
    expect(container.firstChild).toHaveClass("bg-emerald-100");
    expect(container.firstChild).toHaveClass("text-emerald-700");
  });

  it("uses slate classes for inactive", () => {
    const { container } = render(<StatusBadge status="inactive" />);
    expect(container.firstChild).toHaveClass("bg-slate-100");
    expect(container.firstChild).toHaveClass("text-slate-500");
  });

  it("uses slate classes for unknown status", () => {
    const { container } = render(<StatusBadge status="pending" />);
    expect(container.firstChild).toHaveClass("bg-slate-100");
  });
});
