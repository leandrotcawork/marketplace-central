package config

import "os"

type Config struct {
	Addr string
}

func Load() Config {
	addr := os.Getenv("SERVER_ADDR")
	apiPort := os.Getenv("API_PORT")
	if apiPort != "" {
		addr = ":" + apiPort
	}
	if addr == "" {
		addr = ":8080"
	}

	return Config{Addr: addr}
}
