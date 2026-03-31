import type { MarketplaceChannel } from '@/types'

const MANUAL_REVIEW_NOTE =
  'Base operacional herdada do simulador atual. Revisar por grupo antes de usar como regra validada.'

export const DEFAULT_MARKETPLACES: MarketplaceChannel[] = [
  {
    id: 'mercado-livre',
    name: 'Mercado Livre',
    active: true,
    rolloutStage: 'v1',
    executionMode: 'live',
    authStrategy: 'oauth2',
    connectionStatus: 'disconnected',
    notes:
      'Publicação, estoque, pedidos, perguntas e mensagens pós-venda. Preço requer revisão operacional por restrições recentes.',
    capabilities: {
      publish: 'supported',
      priceSync: 'partial',
      stockSync: 'supported',
      orders: 'supported',
      messages: 'partial',
      questions: 'supported',
      freightQuotes: 'partial',
      webhooks: 'supported',
      sandbox: 'blocked',
    },
    commercialProfile: {
      commissionPercent: 0.148,
      fixedFeeAmount: 5,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Suporte Magalu (14.8% + R$5 por item)',
      reviewStatus: 'manual_assumption',
      notes: MANUAL_REVIEW_NOTE,
    },
  },
  {
    id: 'amazon',
    name: 'Amazon Brasil',
    active: true,
    rolloutStage: 'v1',
    executionMode: 'live',
    authStrategy: 'lwa',
    connectionStatus: 'disconnected',
    notes:
      'Listings, pedidos e notifications suportados. Mensageria oficial é parcial e depende de roles do SP-API.',
    capabilities: {
      publish: 'supported',
      priceSync: 'supported',
      stockSync: 'supported',
      orders: 'supported',
      messages: 'partial',
      questions: 'blocked',
      freightQuotes: 'blocked',
      webhooks: 'supported',
      sandbox: 'supported',
    },
    commercialProfile: {
      commissionPercent: 0.12,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Taxa base Casa/Cozinha — venda.amazon.com.br/precos (2026)',
      reviewStatus: 'manual_assumption',
      notes: 'Comissão varia por categoria (10–15%). Use o import route para obter taxa precisa por grupo. Taxa mínima por item: R$1,00–R$2,00 (não incluída no fixedFee).',
    },
  },
  {
    id: 'magalu',
    name: 'Magalu',
    active: true,
    rolloutStage: 'v1',
    executionMode: 'live',
    authStrategy: 'oauth2',
    connectionStatus: 'disconnected',
    notes:
      'Catálogo, preço, estoque, pedidos, Q&A, chat e SAC com sandbox oficial.',
    capabilities: {
      publish: 'supported',
      priceSync: 'supported',
      stockSync: 'supported',
      orders: 'supported',
      messages: 'supported',
      questions: 'supported',
      freightQuotes: 'planned',
      webhooks: 'supported',
      sandbox: 'supported',
    },
    commercialProfile: {
      commissionPercent: 0.16,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Base legada do simulador',
      reviewStatus: 'manual_assumption',
      notes: MANUAL_REVIEW_NOTE,
    },
  },
  {
    id: 'leroy',
    name: 'Leroy Merlin',
    active: true,
    rolloutStage: 'wave_2',
    executionMode: 'live',
    authStrategy: 'api_key',
    connectionStatus: 'disconnected',
    notes:
      'Stack Mirakl Seller API. Bom para produto/oferta/pedido; mensageria e webhooks dependem de homologação.',
    capabilities: {
      publish: 'supported',
      priceSync: 'supported',
      stockSync: 'supported',
      orders: 'supported',
      messages: 'partial',
      questions: 'partial',
      freightQuotes: 'planned',
      webhooks: 'blocked',
      sandbox: 'planned',
    },
    commercialProfile: {
      commissionPercent: 0.18,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Base legada do simulador',
      reviewStatus: 'manual_assumption',
      notes: MANUAL_REVIEW_NOTE,
    },
  },
  {
    id: 'madeira',
    name: 'Madeira Madeira',
    active: true,
    rolloutStage: 'wave_2',
    executionMode: 'live',
    authStrategy: 'token',
    connectionStatus: 'disconnected',
    notes:
      'Produto, pedido e frete dependem de sandbox e documentação Postman liberada pelo parceiro.',
    capabilities: {
      publish: 'planned',
      priceSync: 'planned',
      stockSync: 'planned',
      orders: 'planned',
      messages: 'blocked',
      questions: 'blocked',
      freightQuotes: 'supported',
      webhooks: 'partial',
      sandbox: 'planned',
    },
    commercialProfile: {
      commissionPercent: 0.15,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Base legada do simulador',
      reviewStatus: 'manual_assumption',
      notes: MANUAL_REVIEW_NOTE,
    },
  },
  {
    id: 'shopee',
    name: 'Shopee',
    active: false,
    rolloutStage: 'blocked',
    executionMode: 'blocked',
    authStrategy: 'unknown',
    connectionStatus: 'blocked',
    notes:
      'Canal bloqueado até receber a documentação oficial e validar o escopo do Open Platform.',
    capabilities: {
      publish: 'blocked',
      priceSync: 'blocked',
      stockSync: 'blocked',
      orders: 'blocked',
      messages: 'blocked',
      questions: 'blocked',
      freightQuotes: 'blocked',
      webhooks: 'blocked',
      sandbox: 'blocked',
    },
    commercialProfile: {
      commissionPercent: 0,
      fixedFeeAmount: 0,
      freightFixedAmount: 0,
      sourceType: 'contract',
      sourceRef: 'Contrato Shopee CNPJ — tabela por faixa de preço',
      reviewStatus: 'validated',
      notes: 'Comissão tiered por faixa de preço. Use import para regras precisas.',
    },
  },
]

export function getDefaultMarketplaces(): MarketplaceChannel[] {
  return DEFAULT_MARKETPLACES.map((marketplace) => ({
    ...marketplace,
    capabilities: { ...marketplace.capabilities },
    commercialProfile: { ...marketplace.commercialProfile },
  }))
}

export function getMarketplaceSeedById(channelId: string): MarketplaceChannel | undefined {
  return DEFAULT_MARKETPLACES.find((channel) => channel.id === channelId)
}

export function isLiveMarketplace(channelId: string): boolean {
  const channel = getMarketplaceSeedById(channelId)
  return channel?.executionMode === 'live'
}
