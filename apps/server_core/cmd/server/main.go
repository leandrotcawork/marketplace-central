package main

import (
	"log"
	"net/http"

	"marketplace-central/apps/server_core/internal/platform/httpx"
)

func main() {
	log.Fatal(http.ListenAndServe(":8080", httpx.NewRouter()))
}
