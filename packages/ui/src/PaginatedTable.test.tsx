import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaginatedTable } from "./PaginatedTable";

const items = Array.from({ length: 60 }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}` }));

describe("PaginatedTable", () => {
  it("renders only first pageSize items by default", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 24")).toBeInTheDocument();
    expect(screen.queryByText("Item 25")).not.toBeInTheDocument();
  });

  it("shows correct page count", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText(/page 1 of 3/i)).toBeInTheDocument();
  });

  it("navigates to next page on Next click", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
    expect(screen.getByText("Item 25")).toBeInTheDocument();
    expect(screen.getByText("Item 49")).toBeInTheDocument();
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();
  });

  it("disables Prev button on first page", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
  });

  it("disables Next button on last page", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("shows total count", () => {
    render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText(/showing 1–25 of 60/i)).toBeInTheDocument();
  });

  it("renders custom empty state when items is empty", () => {
    render(
      <PaginatedTable
        items={[]}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item: any) => <tr key={item.id}><td>{item.name}</td></tr>}
        emptyState={<p>Nothing here</p>}
      />
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("resets to page 1 when items change", () => {
    const { rerender } = render(
      <PaginatedTable
        items={items}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/page 2 of 3/i)).toBeInTheDocument();

    const newItems = items.slice(0, 10);
    rerender(
      <PaginatedTable
        items={newItems}
        pageSize={25}
        renderHeader={() => <tr><th>Name</th></tr>}
        renderRow={(item) => <tr key={item.id}><td>{item.name}</td></tr>}
      />
    );
    expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument();
  });
});
