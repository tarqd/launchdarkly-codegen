/**
 * ts-server emitter: a typed facade over `@launchdarkly/node-server-sdk` v9
 * (DESIGN.md → Generated code by target → ts-server).
 */

import {
  checkIdentifiers,
  CodegenError,
  ECMASCRIPT_RESERVED_WORDS,
  escapeBlockCommentEnd,
  flagIdentifier,
  lowerCamel,
  Writer,
  type EmittedIdentifier,
  type Emitter,
  type Flag,
  type FlagKind,
  type FlagModel,
  type IdentifierRules,
} from '@launchtarqly/core';

const SDK_PACKAGE = '@launchdarkly/node-server-sdk';
const SUPPORTED_SDK_MAJORS = [9];

const NAMING: IdentifierRules = {
  target: 'ts-server',
  reserved: ECMASCRIPT_RESERVED_WORDS,
  pattern: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
};
/** Members of the generated `Flags` class that flag methods must not shadow. */
const CLASS_MEMBERS = ['constructor', 'client'];

/** Each flag's name, after checking every identifier the file will emit. */
function flagNames(model: FlagModel): Map<Flag, string> {
  const names = new Map(model.flags.map((flag) => [flag, flagIdentifier(flag, 'ts-server', lowerCamel)]));
  const emitted: EmittedIdentifier[] = CLASS_MEMBERS.map((identifier) => ({ identifier }));
  for (const [flag, name] of names) {
    emitted.push(
      { flagKey: flag.key, identifier: name, primary: true }, // method and FlagKeys entry
      { flagKey: flag.key, identifier: `${name}Detail` },
    );
  }
  checkIdentifiers(NAMING, emitted);
  return names;
}

/** A single-quoted TypeScript string literal. */
function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** The doc-comment lines for a flag's methods (DESIGN.md → Doc comments). */
function docLines(flag: Flag): string[] {
  const lines = [flag.name, ''];
  if (flag.description.trim() !== '') lines.push(...flag.description.trim().split(/\r?\n/), '');
  const trailer = [`key: \`${flag.key}\``];
  if (flag.tags.length > 0) trailer.push(`tags: ${flag.tags.join(', ')}`);
  if (flag.maintainer) {
    trailer.push(
      `maintainer: ${flag.maintainer.kind === 'team' ? `team ${flag.maintainer.name}` : flag.maintainer.email}`,
    );
  }
  lines.push(trailer.join(' · '), flag.uiUrl);
  const deprecation = deprecationText(flag);
  if (deprecation !== undefined) lines.push('', `@deprecated ${deprecation}`);
  return lines;
}

/** The `@deprecated` text: the flag's message, else a generic one. No date, so output doesn't churn. */
function deprecationText(flag: Flag): string | undefined {
  if (!flag.deprecated) return undefined;
  return flag.deprecationMessage ?? `The \`${flag.key}\` flag is deprecated.`;
}

/** The SDK method prefix and TypeScript type for each Flag kind. */
const KIND_METHODS: Record<FlagKind, { method: string; type: string }> = {
  boolean: { method: 'boolVariation', type: 'boolean' },
  string: { method: 'stringVariation', type: 'string' },
  number: { method: 'numberVariation', type: 'number' },
  json: { method: 'jsonVariation', type: 'unknown' },
};

function emitFlagMethods(w: Writer, flag: Flag, name: string): void {
  const key = tsString(flag.key);
  const { method, type } = KIND_METHODS[flag.kind];
  const doc = docLines(flag);
  w.docComment(doc);
  w.block(`${name}(context: LDContext, fallback: ${type}): Promise<${type}> {`, '}', () => {
    w.line(`return this.client.${method}(${key}, context, fallback);`);
  });
  w.docComment(doc);
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
  sdkMajors: SUPPORTED_SDK_MAJORS,
  emit(model, cfg, ctx) {
    if (!SUPPORTED_SDK_MAJORS.includes(cfg.sdkMajor)) {
      throw new CodegenError(
        `target ts-server: unsupported sdkMajor ${cfg.sdkMajor} (supported: ${SUPPORTED_SDK_MAJORS.join(', ')})`,
      );
    }
    const names = flagNames(model);
    const w = new Writer();
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line();
    w.line(`import type { LDClient, LDContext, LDEvaluationDetailTyped } from ${tsString(SDK_PACKAGE)};`);
    w.line();
    w.block('export class Flags {', '}', () => {
      w.line('constructor(private readonly client: LDClient) {}');
      for (const flag of model.flags) {
        w.line();
        emitFlagMethods(w, flag, names.get(flag)!);
      }
    });
    w.line();
    w.block('export const FlagKeys = {', '} as const;', () => {
      for (const flag of model.flags) {
        const deprecation = deprecationText(flag);
        if (deprecation !== undefined) w.line(`/** @deprecated ${escapeBlockCommentEnd(deprecation)} */`);
        w.line(`${names.get(flag)!}: ${tsString(flag.key)},`);
      }
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default tsServerEmitter;
