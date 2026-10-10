/**
 * java emitter: a typed facade over `com.launchdarkly:launchdarkly-java-server-sdk` 7.x
 * (DESIGN.md → Generated code by target → java). The output is already
 * google-java-format 1.37.0's canonical form (ADR 0004).
 */

import { Writer, type Emitter, type Flag } from '@launchtarqly/core';
import { classDoc, isDeprecated, javadocLines, keyConstantDoc, methodDoc, type Javadoc } from './javadoc.js';
import { parseJavaFlags } from './flag-changes.js';
import { JAVA_KINDS, javaKind } from './kinds.js';
import { callLines, constantLines, signatureLines, type Call, type Signature } from './layout.js';
import { flagNames, JAVA, type JavaFlagNames } from './naming.js';
import { javaOptions } from './options.js';

export { parseJavaFlags } from './flag-changes.js';
export { JAVA } from './naming.js';

/** The one file the target writes, inside the `out` directory. */
const FILE_NAME = 'Flags.java';

const SDK = 'com.launchdarkly.sdk';
const CLIENT_INTERFACE = `${SDK}.server.interfaces.LDClientInterface`;

/** Exactly the imports the file uses, in ASCII order (google-java-format deletes unused ones). */
function imports(flags: readonly Flag[]): string[] {
  const used = [CLIENT_INTERFACE];
  if (flags.length > 0) used.push(`${SDK}.EvaluationDetail`, `${SDK}.LDContext`);
  if (flags.some((f) => f.kind === 'json')) used.push(`${SDK}.LDValue`);
  return used.sort();
}

/** The column each kind of member starts at: the class, its members, and `Keys` members. */
const CLASS_INDENT = 0;
const MEMBER_INDENT = 2;
const KEYS_MEMBER_INDENT = 4;
/** The column a method's statements start at. */
const METHOD_BODY_INDENT = 4;

/** One evaluation method: `signature` returning `call`, under `doc`. */
interface EvaluationMethod {
  doc: Javadoc;
  signature: Signature;
  call: Call;
}

/**
 * Writes one evaluation method. When its comment has `@deprecated`, the
 * `@Deprecated` annotation goes on its own line: javac doesn't warn when one
 * half of the pair is missing, so both come from the one comment.
 */
function emitMethod(w: Writer, { doc, signature, call }: EvaluationMethod): void {
  w.line();
  for (const line of javadocLines(doc, MEMBER_INDENT)) w.line(line);
  if (isDeprecated(doc)) w.line('@Deprecated');
  for (const line of signatureLines(signature, MEMBER_INDENT)) w.line(line);
  w.indent(() => {
    for (const line of callLines(call, METHOD_BODY_INDENT)) w.line(line);
  });
  w.line('}');
}

function emitFlagMethods(w: Writer, flag: Flag, names: JavaFlagNames): void {
  const { method, detailMethod, type, boxed } = JAVA_KINDS[javaKind(flag)];
  const params = ['LDContext context', `${type} fallback`];
  const args = [`Keys.${names.constant}`, 'context', 'fallback'];
  emitMethod(w, {
    doc: methodDoc(flag, 'value'),
    signature: { head: `public ${type}`, name: names.method, params },
    call: { head: `return client.${method}`, args },
  });
  emitMethod(w, {
    doc: methodDoc(flag, 'detail'),
    signature: { head: `public EvaluationDetail<${boxed}>`, name: `${names.method}Detail`, params },
    call: { head: `return client.${detailMethod}`, args },
  });
}

/** A double-quoted Java string literal. */
function javaString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export const javaEmitter: Emitter = {
  id: JAVA,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [7],
  readFlags: parseJavaFlags,
  emit(model, cfg, ctx) {
    const options = javaOptions(cfg);
    const names = flagNames(model);
    const w = new Writer();
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line(`package ${options.package};`);
    w.line();
    for (const name of imports(model.flags)) w.line(`import ${name};`);
    w.line();
    for (const line of javadocLines(classDoc(model.projectKey), CLASS_INDENT)) w.line(line);
    w.block('public final class Flags {', '}', () => {
      w.inlineDocComment('The wrapped SDK client.');
      w.line('private final LDClientInterface client;');
      w.line();
      w.docComment(['Wraps an SDK client.', '', '@param client the LaunchDarkly client to evaluate flags with']);
      w.block('public Flags(LDClientInterface client) {', '}', () => {
        w.line('this.client = client;');
      });
      for (const flag of model.flags) emitFlagMethods(w, flag, names.get(flag)!);
      w.line();
      w.inlineDocComment('The raw key of every flag, for code that needs the key itself.');
      w.block('public static final class Keys {', '}', () => {
        w.inlineDocComment('Not instantiable.');
        w.line('private Keys() {}');
        for (const flag of model.flags) {
          w.line();
          const doc = keyConstantDoc(flag);
          for (const line of javadocLines(doc, KEYS_MEMBER_INDENT)) w.line(line);
          const constant = {
            ...(isDeprecated(doc) ? { annotation: '@Deprecated' } : {}),
            head: 'public static final String',
            name: names.get(flag)!.constant,
            value: javaString(flag.key),
          };
          for (const line of constantLines(constant, KEYS_MEMBER_INDENT)) w.line(line);
        }
      });
    });
    return [{ path: `${cfg.out.replace(/[/\\]+$/, '')}/${FILE_NAME}`, contents: w.toString() }];
  },
};

export default javaEmitter;
