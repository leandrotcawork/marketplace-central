package ports

import "context"

type EncryptionService interface {
	Encrypt(ctx context.Context, plaintext []byte) (ciphertext []byte, keyID string, err error)
	Decrypt(ctx context.Context, ciphertext []byte, keyID string) ([]byte, error)
}
