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

function fromSecretOrEnv(
  secrets: Record<string, unknown>,
  key: string,
  envName: string
): string {
  return str(secrets, key) || process.env[envName] || ''
}

export function createMarketplaceClient(
  channelId: string,
  secrets: Record<string, unknown>
): MarketplaceClient {
  switch (channelId) {
    case 'mercado-livre': {
      const s: MeLiSecrets = {
        clientId: fromSecretOrEnv(secrets, 'clientId', 'MELI_CLIENT_ID'),
        clientSecret: fromSecretOrEnv(secrets, 'clientSecret', 'MELI_CLIENT_SECRET'),
        refreshToken: fromSecretOrEnv(secrets, 'refreshToken', 'MELI_REFRESH_TOKEN'),
        accessToken: str(secrets, 'accessToken') || undefined,
        userId: str(secrets, 'userId') || undefined,
      }
      return new MercadoLivreClient(s)
    }

    case 'amazon': {
      const s: AmazonSecrets = {
        clientId: fromSecretOrEnv(secrets, 'clientId', 'AMAZON_CLIENT_ID'),
        clientSecret: fromSecretOrEnv(secrets, 'clientSecret', 'AMAZON_CLIENT_SECRET'),
        refreshToken: fromSecretOrEnv(secrets, 'refreshToken', 'AMAZON_REFRESH_TOKEN'),
        awsAccessKeyId: fromSecretOrEnv(secrets, 'awsAccessKeyId', 'AMAZON_AWS_ACCESS_KEY_ID'),
        awsSecretAccessKey: fromSecretOrEnv(
          secrets,
          'awsSecretAccessKey',
          'AMAZON_AWS_SECRET_ACCESS_KEY'
        ),
        awsSessionToken:
          str(secrets, 'awsSessionToken') || process.env.AMAZON_AWS_SESSION_TOKEN || undefined,
        sellerId: str(secrets, 'sellerId') || process.env.AMAZON_SELLER_ID || undefined,
      }
      return new AmazonClient(s)
    }

    case 'magalu': {
      const s: MagaluSecrets = {
        clientId: fromSecretOrEnv(secrets, 'clientId', 'MAGALU_CLIENT_ID'),
        clientSecret: fromSecretOrEnv(secrets, 'clientSecret', 'MAGALU_CLIENT_SECRET'),
        sellerId: str(secrets, 'sellerId') || process.env.MAGALU_SELLER_ID || undefined,
        accessToken: str(secrets, 'accessToken') || undefined,
        refreshToken: str(secrets, 'refreshToken') || undefined,
      }
      return new MagaluClient(s)
    }

    case 'leroy': {
      const s: LeroySecrets = {
        apiKey: fromSecretOrEnv(secrets, 'apiKey', 'LEROY_API_KEY'),
        shopId: str(secrets, 'shopId') || process.env.LEROY_SHOP_ID || undefined,
      }
      return new LeroyMerlinClient(s)
    }

    case 'madeira': {
      const s: MadeiraSecrets = {
        accessToken: fromSecretOrEnv(secrets, 'accessToken', 'MADEIRA_ACCESS_TOKEN'),
        sellerId: str(secrets, 'sellerId') || process.env.MADEIRA_SELLER_ID || undefined,
      }
      return new MadeiraMadeiraClient(s)
    }

    default:
      return new UnsupportedChannelClient(channelId)
  }
}
