// Command compile-go uses the generated wrapper the way a consumer would. The
// compile test copies a golden file to ldflags/flags_gen.go and runs gofmt,
// go vet and staticcheck on this module.
package main

import (
	"fmt"

	"example.com/compile-go/ldflags"
	ld "github.com/launchdarkly/go-server-sdk/v7"
)

// The generated file does not import the server SDK, so the assertion that
// *ld.LDClient satisfies Client lives here.
var _ ldflags.Client = (*ld.LDClient)(nil)

func main() {
	client, err := ld.MakeCustomClient("sdk-key", ld.Config{Offline: true}, 0)
	if err != nil {
		panic(err)
	}
	defer client.Close()
	flags := ldflags.New(client)
	fmt.Println(flags != nil)
	useEveryKind(flags)
}
