package main

import (
	"log"
	"opslab-survey/internal/server"
)

func main() {
	if err := server.Start(); err != nil {
		log.Fatal(err)
	}
}
