package web

import "embed"

// Static contains embedded frontend assets.
//go:embed static/*
var Static embed.FS
