/**
 * dotnet emitter: a typed wrapper over `LaunchDarkly.ServerSdk` 8.x
 * (DESIGN.md → Generated code by target → dotnet).
 */

import {
  checkIdentifiers,
  CodegenError,
  deprecationText,
  docTrailer,
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
import { parseDotnetFlags } from './flag-changes.js';
import { IDENTIFIER } from './identifier.js';
import { CLIENT_FIELD, FLAG_KEYS_CLASS, FLAG_KEYS_DECLARATION, KEY_CONSTANT_PREFIX, sdkMethod } from './output.js';

export { parseDotnetFlags } from './flag-changes.js';

/** This target's id, as configs and `codegen.name.<target>` properties spell it. */
export const DOTNET: TargetId = 'dotnet';

/** `System.Object` members, which a flag method would hide (CS0108) or confusingly overload. */
const OBJECT_MEMBERS = ['Equals', 'GetHashCode', 'ToString', 'GetType', 'MemberwiseClone', 'Finalize', 'ReferenceEquals'];

/**
 * The C# reserved keywords (C# spec → Lexical structure → Keywords). They are
 * all lowercase, so only an alias can hit one. Contextual keywords (`var`,
 * `async`, …) are legal member names and aren't listed.
 */
const CSHARP_KEYWORDS: ReadonlySet<string> = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class',
  'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event',
  'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if',
  'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null',
  'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly',
  'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe',
  'ushort', 'using', 'virtual', 'void', 'volatile', 'while',
]);

const NAMING: IdentifierRules = {
  target: DOTNET,
  reserved: new Set([...CSHARP_KEYWORDS, ...OBJECT_MEMBERS]),
  pattern: new RegExp(`^${IDENTIFIER}$`, 'u'),
};
/** The classes the file declares. */
const CLASS_NAMES = ['Flags', FLAG_KEYS_CLASS];
/**
 * Names the file declares, which flag members must not reuse: the classes
 * (a member can't share its class's name, CS0542) and the wrapper's field.
 */
const OWN_NAMES = [...CLASS_NAMES, CLIENT_FIELD];

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
  const keyword = segments.find((segment) => CSHARP_KEYWORDS.has(segment));
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

/**
 * A C# new-line (C# spec → Lexical structure → Line terminators): it ends a
 * `///` comment and can't appear in a regular string literal.
 */
const NEWLINE = String.raw`(?:\r\n|\r(?!\n)|[\n\u0085\u2028\u2029])`;

const STRING_ESCAPES: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/**
 * A regular C# string literal. Control characters and the other new-lines,
 * which would end the literal or hide in it, become `\uXXXX` escapes.
 */
function csString(value: string): string {
  const escaped = value.replace(
    /[\\"\p{Cc}\u2028\u2029]/gu,
    (c) => STRING_ESCAPES[c] ?? `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
  );
  return `"${escaped}"`;
}

/** `text` on one line, for a doc comment that has one: each run of new-lines and the spaces around it become one space. */
function oneLine(text: string): string {
  return text.trim().replace(new RegExp(String.raw`(?:[ \t]*${NEWLINE})+[ \t]*`, 'gu'), ' ');
}

/**
 * Escapes text for an XML doc comment. Characters XML 1.0 forbids even as
 * references (most C0 controls, lone surrogates, U+FFFE/U+FFFF) become U+FFFD,
 * or the compiler rejects the comment (CS1570).
 */
function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\p{Cs}\uFFFE\uFFFF]/gu, '\uFFFD')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapes text for a double-quoted XML attribute value in a doc comment. */
function xmlAttribute(text: string): string {
  return xmlText(text).replace(/"/g, '&quot;');
}

/**
 * A `<para>` per paragraph of `text` (paragraphs are separated by blank lines),
 * one doc-comment line per source line, trailing whitespace dropped.
 */
function paragraphs(text: string): string[] {
  const lines: string[] = [];
  for (const paragraph of text.trim().split(new RegExp(`(?:${NEWLINE}[ \\t]*){2,}`, 'u'))) {
    const body = paragraph.split(new RegExp(NEWLINE, 'u')).map((l) => xmlText(l.trimEnd()));
    body[0] = `<para>${body[0]}`;
    body[body.length - 1] += '</para>';
    lines.push(...body);
  }
  return lines;
}

/**
 * The `<summary>` body of a flag's main method (DESIGN.md → Doc comments):
 * the name, then a `<para>` each for the description, the trailer and the UI link.
 */
function summaryLines(flag: Flag): string[] {
  const lines = [xmlText(oneLine(flag.name))];
  if (flag.description.trim() !== '') lines.push(...paragraphs(flag.description));
  const trailer = docTrailer(flag, (key) => `<c>${xmlText(key)}</c>`, xmlText);
  lines.push(`<para>${trailer}</para>`, `<para><see href="${xmlAttribute(flag.uiUrl)}"/></para>`);
  return lines;
}

/**
 * `[System.Obsolete]` with a deprecated flag's `message`: on .NET 5+ with the
 * `LDFLAG001` diagnostic id and the flag's UI link, plain before (ADR 0003).
 * `UrlFormat` is a format string, so its braces are doubled.
 */
function emitObsolete(w: Writer, message: string, uiUrl: string): void {
  const url = uiUrl.replace(/\{/g, '{{').replace(/\}/g, '}}');
  w.directive('#if NET5_0_OR_GREATER');
  w.line(`[System.Obsolete(${csString(message)}, DiagnosticId = "LDFLAG001", UrlFormat = ${csString(url)})]`);
  w.directive('#else');
  w.line(`[System.Obsolete(${csString(message)})]`);
  w.directive('#endif');
}

/** A flag key in an `[Obsolete]` message, which is plain text: Markdown-style backticks. */
function markdownCode(text: string): string {
  return `\`${text}\``;
}

const PARAM_DOCS = [
  '/// <param name="context">The context to evaluate the flag for.</param>',
  '/// <param name="fallback">The value to use if the flag can\'t be evaluated.</param>',
];

function emitFlagMethods(w: Writer, flag: Flag, name: string): void {
  const { method, type } = sdkMethod(flag);
  const title = xmlText(oneLine(flag.name));
  const deprecation = deprecationText(flag, markdownCode);
  w.line('/// <summary>');
  for (const text of summaryLines(flag)) w.line(`/// ${text}`);
  w.line('/// </summary>');
  if (deprecation !== undefined) w.line(`/// <remarks>Deprecated: ${xmlText(oneLine(deprecation))}</remarks>`);
  for (const doc of PARAM_DOCS) w.line(doc);
  w.line('/// <returns>The flag\'s value for <paramref name="context"/>.</returns>');
  if (deprecation !== undefined) emitObsolete(w, deprecation, flag.uiUrl);
  w.line(`public ${type} ${name}(Context context, ${type} fallback)`);
  w.block('{', '}', () => w.line(`return ${CLIENT_FIELD}.${method}(${FLAG_KEYS_CLASS}.${name}, context, fallback);`));
  w.line();
  w.line(`/// <summary>${title}, with the reason for the value. See <see cref="${name}"/>.</summary>`);
  for (const doc of PARAM_DOCS) w.line(doc);
  w.line('/// <returns>The flag\'s value and the reason it was chosen.</returns>');
  if (deprecation !== undefined) emitObsolete(w, deprecation, flag.uiUrl);
  w.line(`public EvaluationDetail<${type}> ${name}Detail(Context context, ${type} fallback)`);
  w.block('{', '}', () => w.line(`return ${CLIENT_FIELD}.${method}Detail(${FLAG_KEYS_CLASS}.${name}, context, fallback);`));
}

export const dotnetEmitter: Emitter = {
  id: DOTNET,
  // Config validation checks each target's `sdkMajor` against this list.
  sdkMajors: [8],
  readFlags: parseDotnetFlags,
  emit(model, cfg, ctx) {
    const { namespace } = targetOptions(cfg);
    const names = flagNames(model);
    const w = new Writer({ indent: '    ', commentPrefix: '//' });
    w.header({ projectKey: model.projectKey, generatorVersion: ctx.generatorVersion });
    w.line('// <auto-generated/>');
    w.line();
    w.line('using LaunchDarkly.Sdk;');
    w.line('using LaunchDarkly.Sdk.Server.Interfaces;');
    w.line();
    w.line(`namespace ${namespace}`);
    w.block('{', '}', () => {
      w.line('/// <summary>');
      w.line(`/// Typed accessors for the flags in LaunchDarkly project <c>${xmlText(model.projectKey)}</c>.`);
      w.line('/// </summary>');
      w.line('public sealed class Flags');
      w.block('{', '}', () => {
        w.line(`private readonly ILdClient ${CLIENT_FIELD};`);
        w.line();
        w.line('/// <summary>');
        w.line('/// Creates a wrapper that evaluates flags through <paramref name="client"/>.');
        w.line('/// </summary>');
        w.line('/// <param name="client">The LaunchDarkly client, usually an <c>LdClient</c>.</param>');
        w.line('public Flags(ILdClient client)');
        w.block('{', '}', () => w.line(`${CLIENT_FIELD} = client;`));
        for (const flag of model.flags) {
          w.line();
          emitFlagMethods(w, flag, names.get(flag)!);
        }
      });
      w.line();
      w.line('/// <summary>');
      w.line('/// The raw key of every flag in <see cref="Flags"/>.');
      w.line('/// </summary>');
      w.line(FLAG_KEYS_DECLARATION);
      w.block('{', '}', () => {
        model.flags.forEach((flag, i) => {
          if (i > 0) w.line();
          const name = names.get(flag)!;
          const deprecation = deprecationText(flag, markdownCode);
          w.line(`/// <summary>Key of the flag behind <see cref="Flags.${name}"/>.</summary>`);
          if (deprecation !== undefined) emitObsolete(w, deprecation, flag.uiUrl);
          w.line(`${KEY_CONSTANT_PREFIX} ${name} = ${csString(flag.key)};`);
        });
      });
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default dotnetEmitter;
