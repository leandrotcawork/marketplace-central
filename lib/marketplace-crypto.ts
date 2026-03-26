import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

type SecretEnvelope = {
  algorithm: 'aes-256-gcm'
  iv: string
  tag: string
  ciphertext: string
}

function getSecretKeyMaterial(): string {
  const explicit = process.env.MARKETPLACE_SECRET_KEY
  if (explicit) return explicit

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'MARKETPLACE_SECRET_KEY is required in production. ' +
        'Set it to a random 32-byte hex string.'
    )
  }

  console.warn(
    '[marketplace-crypto] MARKETPLACE_SECRET_KEY not set. ' +
      'Using insecure dev fallback — do NOT use in production.'
  )
  return 'marketplace-central-dev-key'
}

function getSecretKey(): Buffer {
  return createHash('sha256').update(getSecretKeyMaterial()).digest()
}

export function encryptSecretPayload(payload: Record<string, unknown>): SecretEnvelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const plaintext = JSON.stringify(payload)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptSecretPayload(envelope: SecretEnvelope): Record<string, unknown> {
  const decipher = createDecipheriv(
    envelope.algorithm,
    getSecretKey(),
    Buffer.from(envelope.iv, 'base64')
  )

  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')

  const parsed = JSON.parse(decrypted)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}
