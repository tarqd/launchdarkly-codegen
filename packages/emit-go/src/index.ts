/**
 * go emitter: a typed wrapper over `github.com/launchdarkly/go-server-sdk/v7`
 * (DESIGN.md → Generated code by target → go).
 */

import {
  CodegenError,
  flagIdentifier,
  upperCamel,
  Writer,
  type Emitter,
  type Flag,
  type TargetConfig,
  type TargetId,
} from '@launchtarqly/core';
import { deprecation, methodDoc } from './doc.js';

/** This target's id, as configs and `codegen.name.<target>` properties spell it. */
export const GO: TargetId = 'go';

const SDK_COMMON = 'github.com/launchdarkly/go-sdk-common/v3';

/** The Go spec's keywords, which can't name a package. */
const GO_KEYWORDS: ReadonlySet<string> = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for',
  'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select',
  'struct', 'switch', 'type', 'var',
]);

/**
 * The target's `package`, after checking it and `out` (DESIGN.md → go →
 * Config). Config loading passes these keys through unchecked, so a bad
 * value is a CodegenError (exit 2) naming the key.
 */
function packageName(cfg: TargetConfig): string {
  if (!cfg.out.endsWith('.go')) {
    throw new CodegenError(`go target: out must be the path of a .go file, got ${JSON.stringify(cfg.out)}`);
  }
  const pkg = cfg.package;
  if (typeof pkg !== 'string' || !/^[a-z][a-z0-9_]*$/.test(pkg) || GO_KEYWORDS.has(pkg)) {
    throw new CodegenError(
      `go target: package must be a lowercase Go identifier that is not a keyword, got ${JSON.stringify(pkg)}`,
    );
  }
  return pkg;
}

/** An SDK evaluation method family and the Go type it takes and returns. */
interface KindMethod {
  method: string;
  type: string;
}

const BOOL: KindMethod = { method: 'BoolVariation', type: 'bool' };
const STRING: KindMethod = { method: 'StringVariation', type: 'string' };
const FLOAT64: KindMethod = { method: 'Float64Variation', type: 'float64' };
const INT: KindMethod = { method: 'IntVariation', type: 'int' };
const JSON_VALUE: KindMethod = { method: 'JSONVariation', type: 'ldvalue.Value' };

/**
 * Every kind the `Client` interface lists, in its order. Always all five, so a
 * project's first flag of a kind never changes the interface.
 */
const CLIENT_KINDS: readonly KindMethod[] = [BOOL, STRING, FLOAT64, INT, JSON_VALUE];

/** The SDK method family for a flag. Number flags are `float64` unless `codegen.number: int` (ADR 0001). */
function kindMethod(flag: Flag): KindMethod {
  switch (flag.kind) {
    case 'boolean':
      return BOOL;
    case 'string':
      return STRING;
    case 'number':
      return flag.numberType === 'int' ? INT : FLOAT64;
    case 'json':
      return JSON_VALUE;
  }
}

/** A Go interpreted string literal. */
function goString(value: string): string {
  return JSON.stringify(value);
}

function emitClient(w: Writer): void {
  w.line('// Client is the subset of the LaunchDarkly client that Flags calls: the typed');
  w.line('// evaluation methods for every flag kind. *ld.LDClient satisfies it.');
  w.block('type Client interface {', '}', () => {
    for (const { method, type } of CLIENT_KINDS) {
      const params = `key string, context ldcontext.Context, defaultVal ${type}`;
      w.line(`${method}(${params}) (${type}, error)`);
      w.line(`${method}Detail(${params}) (${type}, ldreason.EvaluationDetail, error)`);
      w.line(`${method}Ctx(ctx gocontext.Context, ${params}) (${type}, error)`);
      w.line(`${method}DetailCtx(ctx gocontext.Context, ${params}) (${type}, ldreason.EvaluationDetail, error)`);
    }
  });
}

function emitFlagMethods(w: Writer, flag: Flag, name: string): void {
  const { method, type } = kindMethod(flag);
  const key = `Key${name}`;
  const params = `context ldcontext.Context, fallback ${type}`;
  const ctxParams = `ctx gocontext.Context, ${params}`;
  const value = `(${type}, error)`;
  const detail = `(${type}, ldreason.EvaluationDetail, error)`;
  const forms = [
    { suffix: '', doc: methodDoc(name, flag), params, result: value, call: `${method}(${key}, context, fallback)` },
    { suffix: 'Detail', doc: variantDoc(`${name}Detail is ${name} with the evaluation reason.`, flag), params, result: detail, call: `${method}Detail(${key}, context, fallback)` },
    { suffix: 'Ctx', doc: variantDoc(`${name}Ctx is ${name} with a Go context for SDK hooks.`, flag), params: ctxParams, result: value, call: `${method}Ctx(ctx, ${key}, context, fallback)` },
    { suffix: 'DetailCtx', doc: variantDoc(`${name}DetailCtx is ${name}Detail with a Go context for SDK hooks.`, flag), params: ctxParams, result: detail, call: `${method}DetailCtx(ctx, ${key}, context, fallback)` },
  ];
  for (const form of forms) {
    w.line();
    for (const text of form.doc) w.line(text === '' ? '//' : `// ${text}`);
    w.block(`func (f *Flags) ${name}${form.suffix}(${form.params}) ${form.result} {`, '}', () => {
      w.line(`return f.client.${form.call}`);
    });
  }
}

/** A variant's one-line doc, plus the `Deprecated:` paragraph for a deprecated flag. */
function variantDoc(summary: string, flag: Flag): string[] {
  const deprecated = deprecation(flag);
  return deprecated === undefined ? [summary] : [summary, '', deprecated];
}

/**
 * The `Key…` constants, `=`-aligned the way gofmt aligns a run of single-line
 * specs (by rune count). A deprecated constant's `// Deprecated:` line ends
 * the run before it, so that constant starts a new one.
 */
function emitKeys(w: Writer, flags: readonly Flag[], names: Map<Flag, string>): void {
  const runs: Flag[][] = [];
  for (const flag of flags) {
    if (flag.deprecated || runs.length === 0) runs.push([flag]);
    else runs[runs.length - 1]!.push(flag);
  }
  w.line();
  w.line('// Flag keys, for code that needs the raw key.');
  w.block('const (', ')', () => {
    for (const run of runs) {
      const width = Math.max(...run.map((flag) => [...`Key${names.get(flag)!}`].length));
      for (const flag of run) {
        const deprecated = deprecation(flag);
        if (deprecated !== undefined) w.line(`// ${deprecated}`);
        const constant = `Key${names.get(flag)!}`;
        w.line(`${constant}${' '.repeat(width - [...constant].length)} = ${goString(flag.key)}`);
      }
    }
  });
}

export const goEmitter: Emitter = {
  id: GO,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [7],
  emit(model, cfg, ctx) {
    const pkg = packageName(cfg);
    const names = new Map(model.flags.map((flag) => [flag, flagIdentifier(flag, GO, upperCamel)]));
    // The Flag model is sorted by key, so methods and constants are too.
    const flags = model.flags;
    const w = new Writer({ indent: '\t', commentPrefix: '//' });
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line();
    w.line(`// Package ${pkg} is a type-safe wrapper around the LaunchDarkly Go server SDK`);
    w.line(`// for the flags in project ${model.projectKey}.`);
    w.line(`package ${pkg}`);
    w.line();
    w.block('import (', ')', () => {
      w.line('gocontext "context"');
      w.line();
      for (const sub of ['ldcontext', 'ldreason', 'ldvalue']) w.line(goString(`${SDK_COMMON}/${sub}`));
    });
    w.line();
    emitClient(w);
    w.line();
    w.line(`// Flags evaluates the flags of project ${model.projectKey}.`);
    w.line('type Flags struct{ client Client }');
    w.line();
    w.line('// New returns a Flags that evaluates through client.');
    w.line('func New(client Client) *Flags { return &Flags{client: client} }');
    for (const flag of flags) emitFlagMethods(w, flag, names.get(flag)!);
    if (flags.length > 0) emitKeys(w, flags, names);
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default goEmitter;
