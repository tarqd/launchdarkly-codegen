/**
 * ts-server emitter: a typed facade over `@launchdarkly/node-server-sdk` v9
 * (DESIGN.md → Generated code by target → ts-server).
 */

import {
  deprecationText,
  docTrailer,
  ECMASCRIPT_RESERVED_WORDS,
  lowerCamel,
  nameFlags,
  Writer,
  type Emitter,
  type Flag,
  type NamingRules,
  type TargetId,
} from '@launchtarqly/core';
import { parseTsServerFlags } from './flag-changes.js';
import { CLIENT_FIELD, FLAG_KEYS_CLOSE, FLAG_KEYS_OPEN, KIND_METHODS } from './output.js';

export { parseTsServerFlags } from './flag-changes.js';

/** This target's id, as configs and `codegen.name` values spell it. */
export const TS_SERVER: TargetId = 'ts-server';

const SDK_PACKAGE = '@launchdarkly/node-server-sdk';

/** Each flag's name is its method and its FlagKeys entry; `Detail` names the detail method. */
const NAMING: NamingRules = {
  target: TS_SERVER,
  convert: lowerCamel,
  reserved: ECMASCRIPT_RESERVED_WORDS,
  pattern: /^[A-Za-z_$][A-Za-z0-9_$]*$/,
  // Members of the generated `Flags` class that flag methods must not shadow.
  ownNames: ['constructor', CLIENT_FIELD],
  derived: (name) => [`${name}Detail`],
};

/** A single-quoted TypeScript string literal. */
function tsString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** The doc-comment lines for a flag's methods (DESIGN.md → Doc comments). */
function docLines(flag: Flag): string[] {
  const lines = [flag.name, ''];
  if (flag.description.trim() !== '') lines.push(...flag.description.trim().split(/\r?\n/), '');
  lines.push(docTrailer(flag, inlineCode), flag.uiUrl);
  const deprecation = deprecationText(flag, inlineCode);
  if (deprecation !== undefined) lines.push('', `@deprecated ${deprecation}`);
  return lines;
}

/** TSDoc inline code. */
function inlineCode(text: string): string {
  return `\`${text}\``;
}

function emitFlagMethods(w: Writer, flag: Flag, name: string): void {
  const key = tsString(flag.key);
  const { method, type } = KIND_METHODS[flag.kind];
  const doc = docLines(flag);
  w.docComment(doc);
  w.block(`${name}(context: LDContext, fallback: ${type}): Promise<${type}> {`, '}', () => {
    w.line(`return this.${CLIENT_FIELD}.${method}(${key}, context, fallback);`);
  });
  w.docComment(doc);
  w.block(
    `${name}Detail(context: LDContext, fallback: ${type}): Promise<LDEvaluationDetailTyped<${type}>> {`,
    '}',
    () => {
      w.line(`return this.${CLIENT_FIELD}.${method}Detail(${key}, context, fallback);`);
    },
  );
}

export const tsServerEmitter: Emitter = {
  id: TS_SERVER,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [9],
  outExtensions: ['.ts', '.mts', '.cts'],
  emit(model, cfg, ctx) {
    const names = nameFlags(model, NAMING);
    const w = new Writer();
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line();
    w.line(`import type { LDClient, LDContext, LDEvaluationDetailTyped } from ${tsString(SDK_PACKAGE)};`);
    w.line();
    w.block('export class Flags {', '}', () => {
      w.line(`constructor(private readonly ${CLIENT_FIELD}: LDClient) {}`);
      for (const flag of model.flags) {
        w.line();
        emitFlagMethods(w, flag, names.get(flag)!);
      }
    });
    w.line();
    w.block(FLAG_KEYS_OPEN, FLAG_KEYS_CLOSE, () => {
      for (const flag of model.flags) {
        const deprecation = deprecationText(flag, inlineCode);
        if (deprecation !== undefined) w.inlineDocComment(`@deprecated ${deprecation}`);
        w.line(`${names.get(flag)!}: ${tsString(flag.key)},`);
      }
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
  readFlags: parseTsServerFlags,
};

export default tsServerEmitter;
