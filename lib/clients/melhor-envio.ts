const ME_BASE_URL = 'https://melhorenvio.com.br/api/v2'
const ME_SANDBOX_URL = 'https://sandbox.melhorenvio.com.br/api/v2'
const USER_AGENT = 'MarketplaceCentral (ti@empresa.com.br)'

export interface MelhorEnvioProduct {
  id: string
  widthCm: number
  heightCm: number
  lengthCm: number
  weightG: number
  insuranceValue: number
  quantity: number
}

export interface MelhorEnvioFreightInput {
  fromPostalCode: string
  toPostalCode: string
  products: MelhorEnvioProduct[]
}

export interface MelhorEnvioFreightOption {
  id: number
  name: string
  companyName: string
  /** Preço com descontos negociados — usar este, não `price` */
  customPrice: number
  deliveryDays: number
  deliveryRange: { min: number; max: number }
  error?: string
}

export class MelhorEnvioClient {
  private readonly baseUrl: string
  private readonly accessToken: string

  constructor(secrets: Record<string, string>, sandbox = false) {
    this.baseUrl = sandbox ? ME_SANDBOX_URL : ME_BASE_URL
    this.accessToken = secrets.access_token ?? ''
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    }
  }

  async validateConnection(): Promise<{ valid: boolean; email?: string; name?: string; error?: string }> {
    // O scope shipping-calculate não permite GET /me (perfil).
    // Validamos via GET /me/shipment/services — requer token mas não scope extra.
    try {
      const response = await fetch(`${this.baseUrl}/me/shipment/services`, { headers: this.headers })

      if (response.status === 401) {
        return { valid: false, error: 'Token inválido ou expirado' }
      }

      // 200 ou qualquer status não-401 = token aceito
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async calculateFreight(input: MelhorEnvioFreightInput): Promise<MelhorEnvioFreightOption[]> {
    const body = {
      from: { postal_code: input.fromPostalCode.replace(/\D/g, '') },
      to: { postal_code: input.toPostalCode.replace(/\D/g, '') },
      products: input.products.map((p) => ({
        id: p.id,
        width: p.widthCm,
        height: p.heightCm,
        length: p.lengthCm,
        weight: +(p.weightG / 1000).toFixed(3), // ME espera kg
        insurance_value: p.insuranceValue,
        quantity: p.quantity,
      })),
    }

    const response = await fetch(`${this.baseUrl}/me/shipment/calculate`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Melhor Envios retornou ${response.status}: ${text.slice(0, 300)}`)
    }

    const data = await response.json() as Array<Record<string, unknown>>
    return data.map((item) => {
      const company = item.company as Record<string, unknown> | undefined
      const deliveryRange = item.delivery_range as Record<string, unknown> | undefined
      return {
        id: Number(item.id),
        name: String(item.name ?? ''),
        companyName: String(company?.name ?? ''),
        customPrice: Number(item.custom_price ?? item.price ?? 0),
        deliveryDays: Number(item.delivery_time ?? 0),
        deliveryRange: {
          min: Number(deliveryRange?.min ?? 0),
          max: Number(deliveryRange?.max ?? 0),
        },
        error: typeof item.error === 'string' ? item.error : undefined,
      }
    })
  }
}
