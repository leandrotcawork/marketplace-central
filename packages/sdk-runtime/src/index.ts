export function createMarketplaceCentralClient(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(path: string, init: RequestInit) {
    return fetchImpl(`${options.baseUrl}${path}`, init);
  }

  return {
    listCatalogProducts: () => request("/catalog/products", { method: "GET" }),
    listMarketplaceAccounts: () => request("/marketplaces/accounts", { method: "GET" }),
    listMarketplacePolicies: () => request("/marketplaces/policies", { method: "GET" }),
    listPricingSimulations: () => request("/pricing/simulations", { method: "GET" }),
  };
}
