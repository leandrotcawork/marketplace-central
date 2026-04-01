package config

import "os"

type Config struct {
	Addr string
}

func Load() Config {
	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	return Config{Addr: addr}
}
