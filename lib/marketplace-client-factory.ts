/**
 * Marketplace Client Factory
 * Creates the appropriate API client from stored (decrypted) secrets.
 * All clients share a compatible interface for validate / publish / stock / price / orders.
 */

import { MercadoLivreClient, type MeLiSecrets } from '@/lib/clients/mercado-livre'
import { AmazonClient, type AmazonSecrets } from '@/lib/clients/amazon'
import { MagaluClient, type MagaluSecrets } from '@/lib/clients/magalu'
import { LeroyMerlinClient, type LeroySecrets } from '@/lib/clients/leroy-merlin'
import { MadeiraMadeiraClient, type MadeiraSecrets } from '@/lib/clients/madeira-madeira'

export type ProductPublishInput = {
  sku: string
  name: string
  description?: string
  price: number
  stock: number
  ean?: string
  categoryId?: string
  brand?: string
  ncm?: string
  productType?: string
  images?: string[]
  weight?: number
  dimensions?: { length: number; width: number; height: number }
  attributes?: Record<string, string>
  // Leroy-specific
  productSku?: string
}

export type ExternalOrder = {
  orderId: string
  status: string
  items: { sku: string; quantity: number; price: number }[]
  buyerName?: string
  createdAt: string
}

export interface MarketplaceClient {
  validateConnection(): Promise<{ ok: boolean; accountId?: string; error?: string }>
  publishProduct(input: ProductPublishInput): Promise<{ ok: boolean; externalId?: string; error?: string }>
  updateStock(sku: string, quantity: number, externalId?: string): Promise<{ ok: boolean; error?: string }>
  updatePrice(sku: string, price: number, externalId?: string): Promise<{ ok: boolean; error?: string }>
  fetchOrders(since?: string): Promise<{ ok: boolean; orders?: ExternalOrder[]; error?: string }>
}

export class UnsupportedChannelClient implements MarketplaceClient {
  private channelId: string

  constructor(channelId: string) {
    this.channelId = channelId
  }

  private notSupported() {
    return { ok: false as const, error: `Canal "${this.channelId}" não possui cliente implementado` }
  }

  validateConnection() { return Promise.resolve(this.notSupported()) }
  publishProduct(_input: ProductPublishInput) { return Promise.resolve(this.notSupported()) }
  updateStock(_sku: string, _qty: number) { return Promise.resolve(this.notSupported()) }
  updatePrice(_sku: string, _price: number) { return Promise.resolve(this.notSupported()) }
  fetchOrders() { return Promise.resolve({ ok: false as const, error: this.notSupported().error }) }
}

function str(secrets: Record<string, unknown>, key: string): string {
  const val = secrets[key]
  return typeof val === 'string' ? val : ''
}

export function createMarketplaceClient(
  channelId: string,
  secrets: Record<string, unknown>
): MarketplaceClient {
  switch (channelId) {
    case 'mercado-livre': {
      const s: MeLiSecrets = {
        clientId: str(secrets, 'clientId'),
        clientSecret: str(secrets, 'clientSecret'),
        refreshToken: str(secrets, 'refreshToken'),
        accessToken: str(secrets, 'accessToken') || undefined,
        userId: str(secrets, 'userId') || undefined,
      }
      return new MercadoLivreClient(s)
    }

    case 'amazon': {
      const s: AmazonSecrets = {
        clientId: str(secrets, 'clientId'),
        clientSecret: str(secrets, 'clientSecret'),
        refreshToken: str(secrets, 'refreshToken'),
        awsAccessKeyId: str(secrets, 'awsAccessKeyId'),
        awsSecretAccessKey: str(secrets, 'awsSecretAccessKey'),
        awsSessionToken: str(secrets, 'awsSessionToken') || undefined,
        sellerId: str(secrets, 'sellerId') || undefined,
      }
      return new AmazonClient(s)
    }

    case 'magalu': {
      const s: MagaluSecrets = {
        clientId: str(secrets, 'clientId'),
        clientSecret: str(secrets, 'clientSecret'),
        sellerId: str(secrets, 'sellerId') || undefined,
      }
      return new MagaluClient(s)
    }

    case 'leroy': {
      const s: LeroySecrets = {
        apiKey: str(secrets, 'apiKey'),
        shopId: str(secrets, 'shopId') || undefined,
      }
      return new LeroyMerlinClient(s)
    }

    case 'madeira': {
      const s: MadeiraSecrets = {
        accessToken: str(secrets, 'accessToken'),
        sellerId: str(secrets, 'sellerId') || undefined,
      }
      return new MadeiraMadeiraClient(s)
    }

    default:
      return new UnsupportedChannelClient(channelId)
  }
}
