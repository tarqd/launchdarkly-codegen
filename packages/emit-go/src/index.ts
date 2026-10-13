/**
 * go emitter: a typed wrapper over `github.com/launchdarkly/go-server-sdk/v7`
 * (DESIGN.md → Generated code by target → go).
 */

import {
  GO_INITIALISMS,
  nameFlags,
  targetOption,
  upperCamel,
  Writer,
  type Emitter,
  type Flag,
  type NamingRules,
  type TargetId,
} from '@launchtarqly/core';
import { deprecation, methodDoc } from './doc.js';
import { parseGoFlags } from './flag-changes.js';
import { FLAGS_STRUCT, goKind, keyConstant, KEYS_COMMENT, KIND_METHODS, METHOD_FORMS } from './output.js';

export { parseGoFlags } from './flag-changes.js';

/** This target's id, as configs and `codegen.name` values spell it. */
export const GO: TargetId = 'go';

const SDK_COMMON = 'github.com/launchdarkly/go-sdk-common/v3';

/** The Go spec's keywords, which can't name a package. */
const GO_KEYWORDS: ReadonlySet<string> = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for',
  'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select',
  'struct', 'switch', 'type', 'var',
]);

/** The go target's own config keys (DESIGN.md → go → Config). */
const OPTIONS = {
  package: targetOption({
    type: 'string',
    required: true,
    description: "The generated file's Go package name: a lowercase Go identifier that is not a keyword.",
    example: 'ldflags',
    parse: (pkg, fail) =>
      /^[a-z][a-z0-9_]*$/.test(pkg) && !GO_KEYWORDS.has(pkg)
        ? pkg
        : fail(`must be a lowercase Go identifier that is not a keyword, got ${JSON.stringify(pkg)}`),
  }),
};

/** Each flag's name is its method; the other method forms and its key constant are built from it. */
const NAMING: NamingRules = {
  target: GO,
  convert: (key) => upperCamel(key, { initialisms: GO_INITIALISMS }),
  // Go keywords are all lowercase, so the export rule already excludes them.
  reserved: new Set(),
  pattern: /^\p{Lu}[\p{L}\p{Nd}_]*$/u,
  invalidReason: 'is not an exported Go identifier (it must start with an upper-case letter)',
  // Names the file declares itself, which no flag may take. The `client` field
  // is left out: it is lower-case, and the export rule already keeps every flag
  // identifier upper-case.
  ownNames: ['Client', 'Flags', 'New'],
  // Every method form (the bare one repeats the flag's name) and the key constant.
  derived: (name) => [...METHOD_FORMS.map(({ suffix }) => `${name}${suffix}`), keyConstant(name)],
};

/** A flag and the identifier the file names it by. */
interface NamedFlag {
  flag: Flag;
  name: string;
}

/** A Go interpreted string literal. */
function goString(value: string): string {
  return JSON.stringify(value);
}

/** A form's parameter list (after `valueParam`, the kind's Go `type`) and results. */
function signature(form: (typeof METHOD_FORMS)[number], type: string, valueParam: string) {
  const params = `${form.ctx ? 'ctx gocontext.Context, ' : ''}${valueParam} ${type}`;
  const result = form.detail ? `(${type}, ldreason.EvaluationDetail, error)` : `(${type}, error)`;
  return { params, result };
}

function emitClient(w: Writer): void {
  w.line('// Client is the subset of the LaunchDarkly client that Flags calls: the typed');
  w.line('// evaluation methods for every flag kind. *ld.LDClient satisfies it.');
  w.block('type Client interface {', '}', () => {
    for (const { method, type } of Object.values(KIND_METHODS)) {
      for (const form of METHOD_FORMS) {
        const { params, result } = signature(form, type, 'key string, context ldcontext.Context, defaultVal');
        w.line(`${method}${form.suffix}(${params}) ${result}`);
      }
    }
  });
}

function emitFlagMethods(w: Writer, { flag, name }: NamedFlag): void {
  const { method, type } = KIND_METHODS[goKind(flag)];
  const key = keyConstant(name);
  for (const form of METHOD_FORMS) {
    const { params, result } = signature(form, type, 'context ldcontext.Context, fallback');
    const doc = form.variantSummary ? variantDoc(form.variantSummary(name), flag) : methodDoc(name, flag);
    const args = `${form.ctx ? 'ctx, ' : ''}${key}, context, fallback`;
    w.line();
    for (const text of doc) w.line(text === '' ? '//' : `// ${text}`);
    w.block(`func (f *Flags) ${name}${form.suffix}(${params}) ${result} {`, '}', () => {
      w.line(`return f.client.${method}${form.suffix}(${args})`);
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
function emitKeys(w: Writer, flags: readonly NamedFlag[]): void {
  const runs: NamedFlag[][] = [];
  for (const named of flags) {
    if (named.flag.deprecated || runs.length === 0) runs.push([named]);
    else runs[runs.length - 1]!.push(named);
  }
  w.line();
  w.line(KEYS_COMMENT);
  w.block('const (', ')', () => {
    for (const run of runs) {
      const width = Math.max(...run.map(({ name }) => [...keyConstant(name)].length));
      for (const { flag, name } of run) {
        const deprecated = deprecation(flag);
        if (deprecated !== undefined) w.line(`// ${deprecated}`);
        const constant = keyConstant(name);
        w.line(`${constant}${' '.repeat(width - [...constant].length)} = ${goString(flag.key)}`);
      }
    }
  });
}

export const goEmitter: Emitter<typeof OPTIONS> = {
  id: GO,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [7],
  outExtensions: ['.go'],
  options: OPTIONS,
  emit(model, cfg, ctx) {
    const pkg = cfg.options.package;
    // The Flag model is sorted by key, so methods and constants are too.
    const flags = [...nameFlags(model, NAMING)].map(([flag, name]): NamedFlag => ({ flag, name }));
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
    w.line(FLAGS_STRUCT);
    w.line();
    w.line('// New returns a Flags that evaluates through client.');
    w.line('func New(client Client) *Flags { return &Flags{client: client} }');
    for (const named of flags) emitFlagMethods(w, named);
    if (flags.length > 0) emitKeys(w, flags);
    return [{ path: cfg.out, contents: w.toString() }];
  },
  readFlags: parseGoFlags,
};

export default goEmitter;
