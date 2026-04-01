import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarketplaceSettingsPage } from "./MarketplaceSettingsPage";

describe("MarketplaceSettingsPage", () => {
  it("renders the foundation settings heading", () => {
    render(<MarketplaceSettingsPage />);
    expect(screen.getByRole("heading", { name: /marketplace settings/i })).toBeInTheDocument();
  });
});
