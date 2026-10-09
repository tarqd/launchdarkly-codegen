// PROTOTYPE consumer: proves *ld.LDClient satisfies the generated Client
// interface and that call sites read well. Never run against a real project.
package main

import (
	"fmt"

	"example.com/crosscheck/ldflags"
	"github.com/launchdarkly/go-sdk-common/v3/ldcontext"
	"github.com/launchdarkly/go-sdk-common/v3/ldvalue"
	ld "github.com/launchdarkly/go-server-sdk/v7"
	"github.com/launchdarkly/go-server-sdk/v7/interfaces"
)

var (
	_ ldflags.Client = (*ld.LDClient)(nil)
	_ ldflags.Client = interfaces.LDClientEvaluations(nil) // the SDK's own interface also fits
)

func main() {
	client, _ := ld.MakeCustomClient("sdk-key", ld.Config{Offline: true}, 0)
	flags := ldflags.New(client)
	user := ldcontext.New("user-1")

	on, _ := flags.Checkout(user, false)
	quota, _ := flags.BigQuota(user, 100)
	rate, _ := flags.DiscountRate(user, 0.0)
	cfg, _ := flags.CheckoutConfig(user, ldvalue.Null())
	_, detail, _ := flags.MaxItemsDetail(user, 10)
	fmt.Println(on, quota, rate, cfg, detail.Reason, ldflags.KeyAPIURLID)
}
