//go:build deprecated

package main

import (
	"context"
	"fmt"

	"example.com/compile-go/ldflags"
	"github.com/launchdarkly/go-sdk-common/v3/ldcontext"
)

// useDeprecated calls the deprecated legacy-cart flag's four methods and its
// key constant from the doc-comments golden file. The compile test builds with
// -tags deprecated for that file only and expects staticcheck to report SA1019
// for each of these five uses.
func useDeprecated(f *ldflags.Flags) {
	user := ldcontext.New("user-1")
	ctx := context.Background()

	v, _ := f.LegacyCart(user, false)
	_, d, _ := f.LegacyCartDetail(user, false)
	c, _ := f.LegacyCartCtx(ctx, user, false)
	_, dc, _ := f.LegacyCartDetailCtx(ctx, user, false)
	fmt.Println(v, d.Reason, c, dc.Reason, ldflags.KeyLegacyCart)
}

func init() {
	useDeprecated(ldflags.New(nil))
}
