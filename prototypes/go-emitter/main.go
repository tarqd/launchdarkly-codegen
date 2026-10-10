// PROTOTYPE consumer: calls every generated method against an offline
// *ld.LDClient. Throwaway; see README.md.
package main

import (
	"context"
	"fmt"

	"example.com/goemitter/ldflags"
	"github.com/launchdarkly/go-sdk-common/v3/ldcontext"
	"github.com/launchdarkly/go-sdk-common/v3/ldvalue"
	ld "github.com/launchdarkly/go-server-sdk/v7"
)

var _ ldflags.Client = (*ld.LDClient)(nil)

func main() {
	client, _ := ld.MakeCustomClient("sdk-key", ld.Config{Offline: true}, 0)
	f := ldflags.New(client)
	user := ldcontext.New("user-1")
	ctx := context.Background()

	b, _ := f.CheckoutV2(user, false)
	_, bd, _ := f.CheckoutV2Detail(user, false)
	bc, _ := f.CheckoutV2Ctx(ctx, user, false)
	_, bdc, _ := f.CheckoutV2DetailCtx(ctx, user, false)
	s, _ := f.PricingTier(user, "free")
	_, sd, _ := f.PricingTierDetail(user, "free")
	sc, _ := f.PricingTierCtx(ctx, user, "free")
	_, sdc, _ := f.PricingTierDetailCtx(ctx, user, "free")
	fmt.Println(b, bd.Reason, bc, bdc.Reason, s, sd.Reason, sc, sdc.Reason, ldflags.KeyCheckoutV2, ldflags.KeyPricingTier)
	useDeprecated(f, ctx, user)
}

// Each line here should raise SA1019 under staticcheck.
func useDeprecated(f *ldflags.Flags, ctx context.Context, user ldcontext.Context) {
	j, _ := f.CheckoutConfig(user, ldvalue.Null())
	_, jd, _ := f.CheckoutConfigDetail(user, ldvalue.Null())
	jc, _ := f.CheckoutConfigCtx(ctx, user, ldvalue.Null())
	_, jdc, _ := f.CheckoutConfigDetailCtx(ctx, user, ldvalue.Null())
	fmt.Println(j, jd.Reason, jc, jdc.Reason, ldflags.KeyCheckoutConfig)
}
