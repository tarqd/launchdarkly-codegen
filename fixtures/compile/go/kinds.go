//go:build flagkinds

package main

import (
	"context"
	"fmt"

	"example.com/compile-go/ldflags"
	"github.com/launchdarkly/go-sdk-common/v3/ldcontext"
	"github.com/launchdarkly/go-sdk-common/v3/ldvalue"
)

// useEveryKind calls every method form for every flag kind in the flag-kinds
// golden file. The compile test builds with -tags flagkinds for that file only.
func useEveryKind(f *ldflags.Flags) {
	user := ldcontext.New("user-1")
	ctx := context.Background()

	b, _ := f.CheckoutV2(user, false)
	_, bd, _ := f.CheckoutV2Detail(user, false)
	bc, _ := f.CheckoutV2Ctx(ctx, user, false)
	_, bdc, _ := f.CheckoutV2DetailCtx(ctx, user, false)
	fmt.Println(b, bd.Reason, bc, bdc.Reason, ldflags.KeyCheckoutV2)

	s, _ := f.PricingTier(user, "free")
	_, sd, _ := f.PricingTierDetail(user, "free")
	sc, _ := f.PricingTierCtx(ctx, user, "free")
	_, sdc, _ := f.PricingTierDetailCtx(ctx, user, "free")
	fmt.Println(s, sd.Reason, sc, sdc.Reason, ldflags.KeyPricingTier)

	d, _ := f.SampleRate(user, 0.5)
	_, dd, _ := f.SampleRateDetail(user, 0.5)
	dc, _ := f.SampleRateCtx(ctx, user, 0.5)
	_, ddc, _ := f.SampleRateDetailCtx(ctx, user, 0.5)
	fmt.Println(d, dd.Reason, dc, ddc.Reason, ldflags.KeySampleRate)

	i, _ := f.MaxCartItems(user, 10)
	_, id, _ := f.MaxCartItemsDetail(user, 10)
	ic, _ := f.MaxCartItemsCtx(ctx, user, 10)
	_, idc, _ := f.MaxCartItemsDetailCtx(ctx, user, 10)
	fmt.Println(i, id.Reason, ic, idc.Reason, ldflags.KeyMaxCartItems)

	j, _ := f.CheckoutConfig(user, ldvalue.Null())
	_, jd, _ := f.CheckoutConfigDetail(user, ldvalue.Null())
	jc, _ := f.CheckoutConfigCtx(ctx, user, ldvalue.Null())
	_, jdc, _ := f.CheckoutConfigDetailCtx(ctx, user, ldvalue.Null())
	fmt.Println(j, jd.Reason, jc, jdc.Reason, ldflags.KeyCheckoutConfig)
}
