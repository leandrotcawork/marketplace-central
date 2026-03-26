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
      commissionPercent: 0.15,
      fixedFeeAmount: 8,
      freightFixedAmount: 0,
      sourceType: 'manual_assumption',
      sourceRef: 'Base legada do simulador',
      reviewStatus: 'manual_assumption',
      notes: MANUAL_REVIEW_NOTE,
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
    executionMode: 'planned',
    authStrategy: 'api_key',
    connectionStatus: 'attention',
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
    executionMode: 'planned',
    authStrategy: 'token',
    connectionStatus: 'attention',
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
      sourceType: 'pending_doc',
      sourceRef: 'Documentação oficial pendente',
      reviewStatus: 'missing',
      notes: 'Não preencher até validar a documentação oficial do canal.',
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
