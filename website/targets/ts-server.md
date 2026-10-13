# ts-server

For the Node.js server SDK, `@launchdarkly/node-server-sdk` v9.

```yaml
targets:
  - id: ts-server
    out: src/flags.generated.ts   # .ts, .mts or .cts
    sdkMajor: 9
```

## Usage

```ts
import { init } from '@launchdarkly/node-server-sdk';
import { FlagKeys, Flags } from './flags.generated.js';

const flags = new Flags(init(sdkKey));

const enabled: boolean = await flags.checkoutV2(context, false);
const detail = await flags.checkoutV2Detail(context, false); // LDEvaluationDetailTyped<boolean>
FlagKeys.checkoutV2; // 'checkout-v2'
```

Identifiers are lowerCamel: `checkout-v2.new_flow` becomes `checkoutV2NewFlow`.
JSON flags return `unknown`. Deprecated flags get `@deprecated`.

## Generated output

<<< ../../fixtures/golden/ts-server/flag-kinds.ts
