/**
 * go emitter: a typed wrapper over `github.com/launchdarkly/go-server-sdk/v7`
 * (DESIGN.md → Generated code by target → go).
 */

import type { Emitter, TargetId } from '@launchtarqly/core';

/** This target's id, as configs and `codegen.name.<target>` properties spell it. */
export const GO: TargetId = 'go';

export const goEmitter: Emitter = {
  id: GO,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [7],
  emit() {
    return [];
  },
};

export default goEmitter;
