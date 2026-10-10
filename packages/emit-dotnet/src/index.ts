/**
 * dotnet emitter: a typed wrapper over `LaunchDarkly.ServerSdk` 8.x
 * (DESIGN.md → Generated code by target → dotnet).
 */

import {
  checkIdentifiers,
  CodegenError,
  flagIdentifier,
  upperCamel,
  Writer,
  type EmittedIdentifier,
  type Emitter,
  type Flag,
  type FlagModel,
  type IdentifierRules,
  type TargetConfig,
  type TargetId,
} from '@launchtarqly/core';

/** This target's id, as configs and `codegen.name.<target>` properties spell it. */
export const DOTNET: TargetId = 'dotnet';

/** `System.Object` members, which a flag method would hide (CS0108) or confusingly overload. */
const OBJECT_MEMBERS = ['Equals', 'GetHashCode', 'ToString', 'GetType', 'MemberwiseClone', 'Finalize', 'ReferenceEquals'];

/**
 * The C# reserved keywords (C# spec → Lexical structure → Keywords). They are
 * all lowercase, so only an alias can hit one. Contextual keywords (`var`,
 * `async`, …) are legal member names and aren't listed.
 */
const CSHARP_KEYWORDS = [
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class',
  'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event',
  'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if',
  'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null',
  'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly',
  'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe',
  'ushort', 'using', 'virtual', 'void', 'volatile', 'while',
];

/**
 * A C# identifier (C# spec → Lexical structure → Identifiers), without the
 * `@` prefix or Unicode escapes: a letter or `_`, then letters, digits,
 * connecting, combining and formatting characters.
 */
const IDENTIFIER = '[\\p{L}\\p{Nl}_][\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}\\p{Mn}\\p{Mc}\\p{Cf}]*';

const NAMING: IdentifierRules = {
  target: DOTNET,
  reserved: new Set([...CSHARP_KEYWORDS, ...OBJECT_MEMBERS]),
  pattern: new RegExp(`^${IDENTIFIER}$`, 'u'),
};
/** The classes the file declares. */
const CLASS_NAMES = ['Flags', 'FlagKeys'];
/**
 * Names the file declares, which flag members must not reuse: the classes
 * (a member can't share its class's name, CS0542) and the wrapper's field.
 */
const OWN_NAMES = [...CLASS_NAMES, '_client'];

/** Each flag's name, after checking every identifier the file will emit. */
function flagNames(model: FlagModel): Map<Flag, string> {
  const names = new Map(model.flags.map((flag) => [flag, flagIdentifier(flag, DOTNET, upperCamel)]));
  const emitted: EmittedIdentifier[] = OWN_NAMES.map((identifier) => ({ identifier }));
  for (const [flag, name] of names) {
    emitted.push(
      { flagKey: flag.key, identifier: name, primary: true }, // method and FlagKeys constant
      { flagKey: flag.key, identifier: `${name}Detail` },
    );
  }
  checkIdentifiers(NAMING, emitted);
  return names;
}

const NAMESPACE = new RegExp(`^${IDENTIFIER}(?:\\.${IDENTIFIER})*$`, 'u');

/** The `namespace` option, checked; `out` must name a .cs file. Throws CodegenError (exit 2). */
function targetOptions(cfg: TargetConfig): { namespace: string } {
  const { namespace, out } = cfg;
  if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) {
    const got = namespace === undefined ? 'it is missing' : `got ${JSON.stringify(namespace)}`;
    throw new CodegenError(
      `dotnet target: \`namespace\` is required and must be dotted C# identifiers (for example MyApp.FeatureFlags); ${got}`,
    );
  }
  const segments = namespace.split('.');
  const keyword = segments.find((segment) => CSHARP_KEYWORDS.includes(segment));
  if (keyword !== undefined) {
    throw new CodegenError(
      `dotnet target: \`namespace\` segment "${keyword}" is a C# keyword; got ${JSON.stringify(namespace)}`,
    );
  }
  const last = segments[segments.length - 1]!;
  if (CLASS_NAMES.includes(last)) {
    throw new CodegenError(
      `dotnet target: \`namespace\` must not end in ${last}, the name of a generated class (code in the parent namespace would resolve ${last} to the namespace); got ${JSON.stringify(namespace)}`,
    );
  }
  if (!out.endsWith('.cs')) {
    throw new CodegenError(
      `dotnet target: \`out\` must be the path of a .cs file (for example Flags.g.cs), got ${JSON.stringify(out)}`,
    );
  }
  return { namespace };
}

/** A regular C# string literal. */
function csString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escapes text for an XML doc comment. */
function xmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The SDK method prefix and C# type for a flag's kind; `codegen.number: int` picks `int` (ADR 0001). */
function kindMethod(flag: Flag): { method: string; type: string } {
  switch (flag.kind) {
    case 'boolean':
      return { method: 'BoolVariation', type: 'bool' };
    case 'string':
      return { method: 'StringVariation', type: 'string' };
    case 'number':
      return flag.numberType === 'int'
        ? { method: 'IntVariation', type: 'int' }
        : { method: 'DoubleVariation', type: 'double' };
    case 'json':
      return { method: 'JsonVariation', type: 'LdValue' };
  }
}

/** A brace-delimited block: `{`, the indented `body`, `}`, each on its own line. */
function braces(w: Writer, body: () => void): void {
  w.block('{', '}', body);
}

function emitFlagMethods(w: Writer, flag: Flag, name: string): void {
  const { method, type } = kindMethod(flag);
  const title = xmlText(flag.name);
  const params = [
    '/// <param name="context">The context to evaluate the flag for.</param>',
    '/// <param name="fallback">The value to use if the flag can\'t be evaluated.</param>',
  ];
  w.line('/// <summary>');
  w.line(`/// ${title}`);
  w.line('/// </summary>');
  for (const p of params) w.line(p);
  w.line('/// <returns>The flag\'s value for <paramref name="context"/>.</returns>');
  w.line(`public ${type} ${name}(Context context, ${type} fallback)`);
  braces(w, () => w.line(`return _client.${method}(FlagKeys.${name}, context, fallback);`));
  w.line();
  w.line(`/// <summary>${title}, with the reason for the value. See <see cref="${name}"/>.</summary>`);
  for (const p of params) w.line(p);
  w.line('/// <returns>The flag\'s value and the reason it was chosen.</returns>');
  w.line(`public EvaluationDetail<${type}> ${name}Detail(Context context, ${type} fallback)`);
  braces(w, () => w.line(`return _client.${method}Detail(FlagKeys.${name}, context, fallback);`));
}

export const dotnetEmitter: Emitter = {
  id: DOTNET,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [8],
  emit(model, cfg, ctx) {
    const { namespace } = targetOptions(cfg);
    const names = flagNames(model);
    const w = new Writer({ indent: '    ' });
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line('// <auto-generated/>');
    w.line();
    w.line('using LaunchDarkly.Sdk;');
    w.line('using LaunchDarkly.Sdk.Server.Interfaces;');
    w.line();
    w.line(`namespace ${namespace}`);
    braces(w, () => {
      w.line('/// <summary>');
      w.line(`/// Typed accessors for the flags in LaunchDarkly project <c>${xmlText(model.projectKey)}</c>.`);
      w.line('/// </summary>');
      w.line('public sealed class Flags');
      braces(w, () => {
        w.line('private readonly ILdClient _client;');
        w.line();
        w.line('/// <summary>');
        w.line('/// Creates a wrapper that evaluates flags through <paramref name="client"/>.');
        w.line('/// </summary>');
        w.line('/// <param name="client">The LaunchDarkly client, usually an <c>LdClient</c>.</param>');
        w.line('public Flags(ILdClient client)');
        braces(w, () => w.line('_client = client;'));
        for (const flag of model.flags) {
          w.line();
          emitFlagMethods(w, flag, names.get(flag)!);
        }
      });
      w.line();
      w.line('/// <summary>');
      w.line('/// The raw key of every flag in <see cref="Flags"/>.');
      w.line('/// </summary>');
      w.line('public static class FlagKeys');
      braces(w, () => {
        model.flags.forEach((flag, i) => {
          if (i > 0) w.line();
          const name = names.get(flag)!;
          w.line(`/// <summary>Key of the flag behind <see cref="Flags.${name}"/>.</summary>`);
          w.line(`public const string ${name} = ${csString(flag.key)};`);
        });
      });
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default dotnetEmitter;
