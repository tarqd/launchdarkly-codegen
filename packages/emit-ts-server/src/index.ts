/**
 * ts-server emitter: a typed facade over `@launchdarkly/node-server-sdk` v9
 * (DESIGN.md → Generated code by target → ts-server).
 */

import { CodegenError, lowerCamel, Writer, type Emitter, type Flag, type FlagKind } from '@launchtarqly/core';

const SDK_PACKAGE = '@launchdarkly/node-server-sdk';
const SUPPORTED_SDK_MAJORS = [9];

/** A single-quoted TypeScript string literal. */
function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** The SDK method prefix and TypeScript type for each Flag kind. */
const KIND_METHODS: Record<FlagKind, { method: string; type: string }> = {
  boolean: { method: 'boolVariation', type: 'boolean' },
  string: { method: 'stringVariation', type: 'string' },
  number: { method: 'numberVariation', type: 'number' },
  json: { method: 'jsonVariation', type: 'unknown' },
};

function emitFlagMethods(w: Writer, flag: Flag): void {
  const name = lowerCamel(flag.key);
  const key = tsString(flag.key);
  const { method, type } = KIND_METHODS[flag.kind];
  w.block(`${name}(context: LDContext, fallback: ${type}): Promise<${type}> {`, '}', () => {
    w.line(`return this.client.${method}(${key}, context, fallback);`);
  });
  w.block(
    `${name}Detail(context: LDContext, fallback: ${type}): Promise<LDEvaluationDetailTyped<${type}>> {`,
    '}',
    () => {
      w.line(`return this.client.${method}Detail(${key}, context, fallback);`);
    },
  );
}

export const tsServerEmitter: Emitter = {
  id: 'ts-server',
  emit(model, cfg, ctx) {
    if (!SUPPORTED_SDK_MAJORS.includes(cfg.sdkMajor)) {
      throw new CodegenError(
        `target ts-server: unsupported sdkMajor ${cfg.sdkMajor} (supported: ${SUPPORTED_SDK_MAJORS.join(', ')})`,
      );
    }
    const w = new Writer();
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line();
    w.line(`import type { LDClient, LDContext, LDEvaluationDetailTyped } from ${tsString(SDK_PACKAGE)};`);
    w.line();
    w.block('export class Flags {', '}', () => {
      w.line('constructor(private readonly client: LDClient) {}');
      for (const flag of model.flags) {
        w.line();
        emitFlagMethods(w, flag);
      }
    });
    w.line();
    w.block('export const FlagKeys = {', '} as const;', () => {
      for (const flag of model.flags) {
        w.line(`${lowerCamel(flag.key)}: ${tsString(flag.key)},`);
      }
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default tsServerEmitter;
