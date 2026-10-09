package main

import (
	"example.com/crosscheck/ldflags"
	"github.com/launchdarkly/go-sdk-common/v3/ldcontext"
)

// PROTOTYPE: a call site that staticcheck should flag as using a deprecated flag.
func useOldBanner(f *ldflags.Flags) { _, _ = f.OldBanner(ldcontext.New("u"), false) }

var _ = useOldBanner
