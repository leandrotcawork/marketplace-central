import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { BatchDetailPage } from "./BatchDetailPage";
import type { BatchStatus, VTEXProduct } from "@marketplace-central/sdk-runtime";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockGetStatus = vi.fn();
const mockRetry = vi.fn();
const mockClient = { getBatchStatus: mockGetStatus, retryBatch: mockRetry } as any;

const completedBatch: BatchStatus = {
  batch_id: "b1",
  vtex_account: "mystore",
  status: "completed",
  total: 2,
  succeeded: 2,
  failed: 0,
  in_progress: 0,
  operations: [
    { product_id: "p1", status: "succeeded", current_step: "activate", error_code: null },
    { product_id: "p2", status: "succeeded", current_step: "activate", error_code: null },
  ],
};

const failedBatch: BatchStatus = {
  batch_id: "b1",
  vtex_account: "mystore",
  status: "failed",
  total: 2,
  succeeded: 1,
  failed: 1,
  in_progress: 0,
  operations: [
    { product_id: "p1", status: "succeeded", current_step: "activate", error_code: null },
    { product_id: "p2", status: "failed", current_step: "product", error_code: "CONNECTORS_PUBLISH_VTEX_VALIDATION" },
  ],
};

const sampleProduct: VTEXProduct = {
  product_id: "p2", name: "Prod2", description: "", sku_name: "SKU2",
  ean: "", category: "Cat", brand: "Brand", cost: 50, base_price: 90,
  image_urls: [], specs: {}, stock_qty: 5, warehouse_id: "1_1", trade_policy_id: "1",
};

function renderPage(routeState?: { products: VTEXProduct[] }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/connectors/vtex/batch/b1", state: routeState }]}>
      <Routes>
        <Route path="/connectors/vtex/batch/:id" element={<BatchDetailPage client={mockClient} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("BatchDetailPage", () => {
  beforeEach(() => {
    mockGetStatus.mockReset();
    mockRetry.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => vi.useRealTimers());

  it("shows operations table for completed batch", async () => {
    mockGetStatus.mockResolvedValue(completedBatch);
    renderPage();
    await waitFor(() => expect(screen.getByText("p1")).toBeInTheDocument());
    expect(screen.getByText("p2")).toBeInTheDocument();
    expect(screen.getAllByText("Succeeded")).toHaveLength(2);
  });

  it("shows Retry button when batch has failed operations", async () => {
    mockGetStatus.mockResolvedValue(failedBatch);
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
  });

  it("calls retryBatch with products from route state on retry click", async () => {
    mockGetStatus.mockResolvedValue(failedBatch);
    mockRetry.mockResolvedValue({ batch_id: "b1", total_products: 1, validated: 1, rejected: 0, rejections: [] });
    renderPage({ products: [sampleProduct] });
    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(mockRetry).toHaveBeenCalledWith("b1", [sampleProduct])
    );
  });

  it("does not show Retry button when all operations succeeded", async () => {
    mockGetStatus.mockResolvedValue(completedBatch);
    renderPage();
    await waitFor(() => expect(screen.getByText("p1")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows error state when getBatchStatus rejects", async () => {
    mockGetStatus.mockRejectedValue({ error: { message: "Backend unavailable" } });
    renderPage();
    await waitFor(() => expect(screen.getByText(/backend unavailable/i)).toBeInTheDocument());
  });
});
