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

const NAMING: IdentifierRules = {
  target: DOTNET,
  // C# keywords are lowercase, so an UpperCamel name can't hit one; the full
  // rule set (keyword aliases, System.Object members) is #37's.
  reserved: new Set(),
  pattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
};
/** Type names the file declares, which flag members must not reuse. */
const OWN_NAMES = ['Flags', 'FlagKeys'];

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

const IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*';
const NAMESPACE = new RegExp(`^${IDENTIFIER}(?:\\.${IDENTIFIER})*$`);

/** The `namespace` option, checked; `out` must name a .cs file. Throws CodegenError (exit 2). */
function targetOptions(cfg: TargetConfig): { namespace: string } {
  const { namespace, out } = cfg;
  if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) {
    const got = namespace === undefined ? 'it is missing' : `got ${JSON.stringify(namespace)}`;
    throw new CodegenError(
      `dotnet target: \`namespace\` is required and must be dotted C# identifiers (for example MyApp.FeatureFlags); ${got}`,
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
  for (const paragraph of text.trim().split(/(?:\r?\n[ \t]*){2,}/)) {
    const body = paragraph.split(/\r?\n/).map((l) => xmlText(l.trimEnd()));
    body[0] = `<para>${body[0]}`;
    body[body.length - 1] += '</para>';
    lines.push(...body);
  }
  return lines;
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

/**
 * The `<summary>` body of a flag's main method (DESIGN.md → Doc comments):
 * the name, then a `<para>` each for the description, the trailer and the UI link.
 */
function summaryLines(flag: Flag): string[] {
  const lines = [xmlText(flag.name)];
  if (flag.description.trim() !== '') lines.push(...paragraphs(flag.description));
  const trailer = [`key: <c>${xmlText(flag.key)}</c>`];
  if (flag.tags.length > 0) trailer.push(`tags: ${xmlText(flag.tags.join(', '))}`);
  if (flag.maintainer) {
    const maintainer = flag.maintainer.kind === 'team' ? `team ${flag.maintainer.name}` : flag.maintainer.email;
    trailer.push(`maintainer: ${xmlText(maintainer)}`);
  }
  lines.push(`<para>${trailer.join(' · ')}</para>`, `<para><see href="${xmlAttribute(flag.uiUrl)}"/></para>`);
  return lines;
}

/** The deprecation message: the flag's own, else a generic one. No date, so output doesn't churn. */
function deprecationText(flag: Flag): string | undefined {
  if (!flag.deprecated) return undefined;
  return flag.deprecationMessage ?? `The \`${flag.key}\` flag is deprecated.`;
}

/**
 * `[System.Obsolete]` for a deprecated flag's member: on .NET 5+ with the
 * `LDFLAG001` diagnostic id and the flag's UI link, plain before (ADR 0003).
 * `UrlFormat` is a format string, so its braces are doubled.
 */
function emitObsolete(w: Writer, flag: Flag): void {
  const message = deprecationText(flag);
  if (message === undefined) return;
  const url = flag.uiUrl.replace(/\{/g, '{{').replace(/\}/g, '}}');
  w.directive('#if NET5_0_OR_GREATER');
  w.line(`[System.Obsolete(${csString(message)}, DiagnosticId = "LDFLAG001", UrlFormat = ${csString(url)})]`);
  w.directive('#else');
  w.line(`[System.Obsolete(${csString(message)})]`);
  w.directive('#endif');
}

function emitFlagMethods(w: Writer, flag: Flag, name: string): void {
  const { method, type } = kindMethod(flag);
  const title = xmlText(flag.name);
  const params = [
    '/// <param name="context">The context to evaluate the flag for.</param>',
    '/// <param name="fallback">The value to use if the flag can\'t be evaluated.</param>',
  ];
  w.line('/// <summary>');
  for (const text of summaryLines(flag)) w.line(`/// ${text}`);
  w.line('/// </summary>');
  const deprecation = deprecationText(flag);
  if (deprecation !== undefined) w.line(`/// <remarks>Deprecated: ${xmlText(deprecation)}</remarks>`);
  for (const p of params) w.line(p);
  w.line('/// <returns>The flag\'s value for <paramref name="context"/>.</returns>');
  emitObsolete(w, flag);
  w.line(`public ${type} ${name}(Context context, ${type} fallback)`);
  braces(w, () => w.line(`return _client.${method}(FlagKeys.${name}, context, fallback);`));
  w.line();
  w.line(`/// <summary>${title}, with the reason for the value. See <see cref="${name}"/>.</summary>`);
  for (const p of params) w.line(p);
  w.line('/// <returns>The flag\'s value and the reason it was chosen.</returns>');
  emitObsolete(w, flag);
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
          emitObsolete(w, flag);
          w.line(`public const string ${name} = ${csString(flag.key)};`);
        });
      });
    });
    return [{ path: cfg.out, contents: w.toString() }];
  },
};

export default dotnetEmitter;
