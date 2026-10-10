//go:build !flagkinds

package main

import "example.com/compile-go/ldflags"

// useEveryKind is a no-op for golden files other than flag-kinds; see kinds.go.
func useEveryKind(*ldflags.Flags) {}
