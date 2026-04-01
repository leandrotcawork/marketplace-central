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
});
