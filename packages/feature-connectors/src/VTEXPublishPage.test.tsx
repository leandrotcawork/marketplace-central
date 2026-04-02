import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VTEXPublishPage } from "./VTEXPublishPage";
import type { PublishBatchResponse } from "@marketplace-central/sdk-runtime";

const mockPublish = vi.fn();
const mockClient = { publishToVTEX: mockPublish } as any;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/connectors/vtex"]}>
      <Routes>
        <Route path="/connectors/vtex" element={<VTEXPublishPage client={mockClient} />} />
        <Route path="/connectors/vtex/batch/:id" element={<div>Batch Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const successResponse: PublishBatchResponse = {
  batch_id: "batch-001",
  total_products: 1,
  validated: 1,
  rejected: 0,
  rejections: [],
};

describe("VTEXPublishPage", () => {
  beforeEach(() => mockPublish.mockReset());

  it("renders all required form fields", () => {
    renderPage();
    expect(screen.getByLabelText(/vtex account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/product id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("shows validation error when vtex_account is empty", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    expect(await screen.findByText(/vtex account is required/i)).toBeInTheDocument();
  });

  it("calls publishToVTEX with correct products array on submit", async () => {
    mockPublish.mockResolvedValueOnce(successResponse);
    renderPage();

    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.change(screen.getByLabelText(/product id/i), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: "Test Product" } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: "A product" } });
    fireEvent.change(screen.getByLabelText(/sku name/i), { target: { value: "Test SKU" } });
    fireEvent.change(screen.getByLabelText(/ean/i), { target: { value: "7890000000001" } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "Electronics" } });
    fireEvent.change(screen.getByLabelText(/brand/i), { target: { value: "BrandX" } });
    fireEvent.change(screen.getByLabelText(/cost/i), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/base price/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/image url/i), { target: { value: "https://example.com/img.png" } });
    fireEvent.change(screen.getByLabelText(/stock quantity/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/warehouse id/i), { target: { value: "1_1" } });
    fireEvent.change(screen.getByLabelText(/trade policy id/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(mockPublish).toHaveBeenCalledWith({
        vtex_account: "mystore",
        products: [
          expect.objectContaining({
            product_id: "prod-1",
            name: "Test Product",
            base_price: 100,
            cost: 60,
          }),
        ],
      })
    );
  });

  it("shows batch result after successful submit", async () => {
    mockPublish.mockResolvedValueOnce(successResponse);
    renderPage();

    fireEvent.change(screen.getByLabelText(/vtex account/i), { target: { value: "mystore" } });
    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: "Test Product" } });
    fireEvent.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() => expect(screen.getByText(/batch created/i)).toBeInTheDocument());
    expect(screen.getByText("batch-001")).toBeInTheDocument();
  });
});
