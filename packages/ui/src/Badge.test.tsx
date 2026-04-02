import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders pending status", () => {
    render(<Badge status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders succeeded status", () => {
    render(<Badge status="succeeded" />);
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
  });

  it("renders failed status", () => {
    render(<Badge status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders in_progress status", () => {
    render(<Badge status="in_progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders completed status", () => {
    render(<Badge status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});
