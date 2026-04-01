import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppRouter } from "./AppRouter";

describe("AppRouter", () => {
  it("renders marketplace and simulator navigation", () => {
    window.history.pushState({}, "", "/marketplaces");
    render(<AppRouter />);

    expect(screen.getByRole("link", { name: /marketplaces/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /simulator/i })).toBeInTheDocument();
  });
});
