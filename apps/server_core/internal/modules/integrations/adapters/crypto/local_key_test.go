package crypto

import "testing"

func TestLocalKeyServiceEncryptsAndDecryptsJSON(t *testing.T) {
	t.Parallel()

	service, err := NewLocalKeyService("0123456789abcdef0123456789abcdef", "local-key-1")
	if err != nil {
		t.Fatalf("NewLocalKeyService() error = %v", err)
	}

	ciphertext, keyID, err := service.EncryptJSON(map[string]any{
		"access_token": "access-token-1",
		"seller_id":    "seller-123",
	})
	if err != nil {
		t.Fatalf("EncryptJSON() error = %v", err)
	}
	if keyID != "local-key-1" {
		t.Fatalf("keyID = %q, want %q", keyID, "local-key-1")
	}
	if string(ciphertext) == "" || string(ciphertext) == `{"access_token":"access-token-1","seller_id":"seller-123"}` {
		t.Fatalf("ciphertext should be non-empty and not plaintext JSON: %q", string(ciphertext))
	}

	plaintext, decryptedKeyID, err := service.DecryptJSON(ciphertext)
	if err != nil {
		t.Fatalf("DecryptJSON() error = %v", err)
	}
	if decryptedKeyID != "local-key-1" {
		t.Fatalf("decrypted keyID = %q, want %q", decryptedKeyID, "local-key-1")
	}
	if plaintext["access_token"] != "access-token-1" {
		t.Fatalf("access_token = %v, want access-token-1", plaintext["access_token"])
	}
	if plaintext["seller_id"] != "seller-123" {
		t.Fatalf("seller_id = %v, want seller-123", plaintext["seller_id"])
	}
}

func TestLocalKeyServiceRejectsShortKey(t *testing.T) {
	t.Parallel()

	_, err := NewLocalKeyService("short", "local-key-1")
	if err == nil {
		t.Fatal("NewLocalKeyService() error = nil, want error")
	}
}
