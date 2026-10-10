/**
 * java emitter: a typed facade over `com.launchdarkly:launchdarkly-java-server-sdk` 7.x
 * (DESIGN.md → Generated code by target → java). The output is already
 * google-java-format 1.37.0's canonical form (ADR 0004).
 */

import { Writer, type Emitter, type Flag, type FlagKind, type TargetId } from '@launchtarqly/core';
import { classDoc, isDeprecated, javadocLines, keyConstantDoc, methodDoc, type Javadoc } from './javadoc.js';
import { flagNames, type JavaFlagNames } from './naming.js';
import { javaOptions } from './options.js';

/** This target's id, as configs and `codegen.name.<target>` properties spell it. */
export const JAVA: TargetId = 'java';

/** The one file the target writes, inside the `out` directory. */
const FILE_NAME = 'Flags.java';

const SDK = 'com.launchdarkly.sdk';
const CLIENT_INTERFACE = `${SDK}.server.interfaces.LDClientInterface`;

/** The SDK method prefix, Java type and boxed type of each kind. */
interface KindMethod {
  method: string;
  type: string;
  boxed: string;
}

function kindMethod(flag: Flag): KindMethod {
  const byKind: Record<FlagKind, KindMethod> = {
    boolean: { method: 'boolVariation', type: 'boolean', boxed: 'Boolean' },
    string: { method: 'stringVariation', type: 'String', boxed: 'String' },
    number:
      flag.numberType === 'int'
        ? { method: 'intVariation', type: 'int', boxed: 'Integer' }
        : { method: 'doubleVariation', type: 'double', boxed: 'Double' },
    json: { method: 'jsonValueVariation', type: 'LDValue', boxed: 'LDValue' },
  };
  return byKind[flag.kind];
}

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

/** Writes `doc` laid out for a member at column `indent`. */
function writeDoc(w: Writer, doc: Javadoc, indent: number): void {
  for (const line of javadocLines(doc, indent)) w.line(line);
}

/**
 * Writes a method's comment and, when the comment has `@deprecated`, the
 * `@Deprecated` annotation on its own line. javac doesn't warn when one half
 * of the pair is missing, so both come from the one comment.
 */
function writeMethodDoc(w: Writer, doc: Javadoc): void {
  writeDoc(w, doc, MEMBER_INDENT);
  if (isDeprecated(doc)) w.line('@Deprecated');
}

function emitFlagMethods(w: Writer, flag: Flag, names: JavaFlagNames): void {
  const { method, type, boxed } = kindMethod(flag);
  const key = `Keys.${names.constant}`;
  w.line();
  writeMethodDoc(w, methodDoc(flag, 'value'));
  w.block(`public ${type} ${names.method}(LDContext context, ${type} fallback) {`, '}', () => {
    w.line(`return client.${method}(${key}, context, fallback);`);
  });
  w.line();
  writeMethodDoc(w, methodDoc(flag, 'detail'));
  w.block(`public EvaluationDetail<${boxed}> ${names.method}Detail(LDContext context, ${type} fallback) {`, '}', () => {
    w.line(`return client.${method}Detail(${key}, context, fallback);`);
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
  emit(model, cfg, ctx) {
    const options = javaOptions(cfg);
    const names = flagNames(model);
    const w = new Writer();
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line(`package ${options.package};`);
    w.line();
    for (const name of imports(model.flags)) w.line(`import ${name};`);
    w.line();
    writeDoc(w, classDoc(model.projectKey), CLASS_INDENT);
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
          writeDoc(w, doc, KEYS_MEMBER_INDENT);
          // google-java-format keeps an annotation on a field on the same line.
          const annotation = isDeprecated(doc) ? '@Deprecated ' : '';
          w.line(`${annotation}public static final String ${names.get(flag)!.constant} = ${javaString(flag.key)};`);
        }
      });
    });
    return [{ path: `${cfg.out.replace(/[/\\]+$/, '')}/${FILE_NAME}`, contents: w.toString() }];
  },
};

export default javaEmitter;
