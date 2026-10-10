/**
 * ts-server emitter: a typed facade over `@launchdarkly/node-server-sdk` v9
 * (DESIGN.md → Generated code by target → ts-server).
 */

import {
  CodegenError,
  escapeBlockCommentEnd,
  lowerCamel,
  Writer,
  type Emitter,
  type Flag,
} from '@launchtarqly/core';

const SDK_PACKAGE = '@launchdarkly/node-server-sdk';
const SUPPORTED_SDK_MAJORS = [9];

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

function emitFlagMethods(w: Writer, flag: Flag): void {
  const name = lowerCamel(flag.key);
  const key = tsString(flag.key);
  const doc = docLines(flag);
  w.docComment(doc);
  w.block(`${name}(context: LDContext, fallback: boolean): Promise<boolean> {`, '}', () => {
    w.line(`return this.client.boolVariation(${key}, context, fallback);`);
  });
  w.docComment(doc);
  w.block(
    `${name}Detail(context: LDContext, fallback: boolean): Promise<LDEvaluationDetailTyped<boolean>> {`,
    '}',
    () => {
      w.line(`return this.client.boolVariationDetail(${key}, context, fallback);`);
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
        const deprecation = deprecationText(flag);
        if (deprecation !== undefined) w.line(`/** @deprecated ${escapeBlockCommentEnd(deprecation)} */`);
        w.line(`${lowerCamel(flag.key)}: ${tsString(flag.key)},`);
      }
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default tsServerEmitter;
