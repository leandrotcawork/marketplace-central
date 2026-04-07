package ports

import "net/http"

type MEAuthPort interface {
	HandleStart(http.ResponseWriter, *http.Request)
	HandleCallback(http.ResponseWriter, *http.Request)
	HandleStatus(http.ResponseWriter, *http.Request)
}
