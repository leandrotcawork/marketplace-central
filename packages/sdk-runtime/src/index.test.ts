import { describe, expect, it } from "vitest";
import { createMarketplaceCentralClient } from "./index";

describe("sdk runtime", () => {
  it("builds canonical pricing simulation requests", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createMarketplaceCentralClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    });

    await client.listPricingSimulations();

    expect(String(requests[0].input)).toBe("http://localhost:8080/pricing/simulations");
    expect(requests[0].init?.method).toBe("GET");
  });

  it("posts marketplace account payload as json", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createMarketplaceCentralClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            tenant_id: "tenant_default",
            account_id: "acct-1",
            channel_code: "vtex",
            display_name: "VTEX",
            status: "active",
            connection_mode: "api",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await client.createMarketplaceAccount({
      account_id: "acct-1",
      channel_code: "vtex",
      display_name: "VTEX",
      connection_mode: "api",
    });

    expect(String(requests[0].input)).toBe("http://localhost:8080/marketplaces/accounts");
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(requests[0].init?.body).toBe(
      JSON.stringify({
        account_id: "acct-1",
        channel_code: "vtex",
        display_name: "VTEX",
        connection_mode: "api",
      }),
    );
  });

  it("posts run pricing simulation payload as json", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const client = createMarketplaceCentralClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            simulation_id: "sim-1",
            tenant_id: "tenant_default",
            product_id: "prod-1",
            account_id: "acct-1",
            margin_amount: 10.5,
            margin_percent: 15.0,
            status: "healthy",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    await client.runPricingSimulation({
      simulation_id: "sim-1",
      product_id: "prod-1",
      account_id: "acct-1",
      base_price_amount: 100.0,
      cost_amount: 60.0,
      commission_percent: 0.16,
      fixed_fee_amount: 5.0,
      shipping_amount: 10.0,
      min_margin_percent: 0.10,
    });

    expect(String(requests[0].input)).toBe("http://localhost:8080/pricing/simulations");
    expect(requests[0].init?.method).toBe("POST");
    expect(requests[0].init?.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("throws parsed error payload on non-ok response", async () => {
    const client = createMarketplaceCentralClient({
      baseUrl: "http://localhost:8080",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: { code: "invalid_request", message: "invalid account" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    });

    await expect(
      client.createMarketplaceAccount({
        account_id: "",
        channel_code: "vtex",
        display_name: "VTEX",
        connection_mode: "api",
      }),
    ).rejects.toMatchObject({
      status: 400,
      error: { code: "invalid_request", message: "invalid account" },
    });
  });
});
