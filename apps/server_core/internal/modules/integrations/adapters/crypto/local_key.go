package crypto

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

type LocalKeyService struct {
	key   []byte
	keyID string
}

func NewLocalKeyService(rawKey string, keyID ...string) (*LocalKeyService, error) {
	key := []byte(strings.TrimSpace(rawKey))
	if len(key) != 32 {
		return nil, errors.New("INTEGRATIONS_CREDENTIAL_ENCRYPTION_FAILED")
	}
	id := "local-key"
	if len(keyID) > 0 && strings.TrimSpace(keyID[0]) != "" {
		id = strings.TrimSpace(keyID[0])
	}
	return &LocalKeyService{
		key:   append([]byte(nil), key...),
		keyID: id,
	}, nil
}

func (s *LocalKeyService) Encrypt(ctx context.Context, plaintext []byte) ([]byte, string, error) {
	select {
	case <-ctx.Done():
		return nil, "", ctx.Err()
	default:
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, "", err
	}

	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)
	buf := make([]byte, 0, len(nonce)+len(ciphertext))
	buf = append(buf, nonce...)
	buf = append(buf, ciphertext...)
	return buf, s.keyID, nil
}

func (s *LocalKeyService) Decrypt(ctx context.Context, ciphertext []byte, keyID string) ([]byte, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}
	if keyID != "" && keyID != s.keyID {
		return nil, errors.New("INTEGRATIONS_CREDENTIAL_DECRYPTION_FAILED")
	}

	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(ciphertext) < gcm.NonceSize() {
		return nil, errors.New("INTEGRATIONS_CREDENTIAL_DECRYPTION_FAILED")
	}

	nonce := ciphertext[:gcm.NonceSize()]
	encrypted := ciphertext[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, encrypted, nil)
	if err != nil {
		return nil, errors.New("INTEGRATIONS_CREDENTIAL_DECRYPTION_FAILED")
	}
	return plaintext, nil
}

func (s *LocalKeyService) EncryptJSON(payload map[string]any) ([]byte, string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, "", err
	}
	ciphertext, keyID, err := s.Encrypt(context.Background(), raw)
	if err != nil {
		return nil, "", err
	}
	return []byte(base64.StdEncoding.EncodeToString(ciphertext)), keyID, nil
}

func (s *LocalKeyService) DecryptJSON(encoded []byte) (map[string]any, string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(string(encoded))
	if err != nil {
		return nil, "", fmt.Errorf("decode payload: %w", err)
	}
	raw, err := s.Decrypt(context.Background(), ciphertext, s.keyID)
	if err != nil {
		return nil, "", err
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, "", err
	}
	return payload, s.keyID, nil
}
