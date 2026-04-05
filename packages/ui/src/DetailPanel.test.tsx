import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";

describe("DetailPanel", () => {
  it("renders nothing when open is false", () => {
    render(
      <DetailPanel open={false} onClose={vi.fn()} title="Edit Product">
        <p>Panel content</p>
      </DetailPanel>
    );
    expect(screen.queryByText("Edit Product")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
  });

  it("renders title and children when open is true", () => {
    render(
      <DetailPanel open={true} onClose={vi.fn()} title="Edit Product">
        <p>Panel content</p>
      </DetailPanel>
    );
    expect(screen.getByText("Edit Product")).toBeInTheDocument();
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <DetailPanel open={true} onClose={vi.fn()} title="Edit Product" subtitle="SKU-001">
        <p>content</p>
      </DetailPanel>
    );
    expect(screen.getByText("SKU-001")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel open={true} onClose={onClose} title="Edit Product">
        <p>content</p>
      </DetailPanel>
    );
    fireEvent.click(screen.getByLabelText("Close panel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key pressed", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel open={true} onClose={onClose} title="Edit Product">
        <p>content</p>
      </DetailPanel>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose on Escape when panel is closed", () => {
    const onClose = vi.fn();
    render(
      <DetailPanel open={false} onClose={onClose} title="Edit Product">
        <p>content</p>
      </DetailPanel>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders footer when provided", () => {
    render(
      <DetailPanel open={true} onClose={vi.fn()} title="Edit Product" footer={<button>Save</button>}>
        <p>content</p>
      </DetailPanel>
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
