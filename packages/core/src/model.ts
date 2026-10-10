/** The language-neutral Flag model (DESIGN.md → Normalizer and the FlagModel). */

export type TargetId = 'ts-server' | 'ts-browser' | 'go' | 'java';

export type FlagKind = 'boolean' | 'string' | 'number' | 'json';

export interface FlagModel {
  projectKey: string;
  /** Sorted by key. */
  flags: Flag[];
}

export type Maintainer =
  | { kind: 'member'; email: string; name?: string }
  | { kind: 'team'; key: string; name: string };

export interface Flag {
  key: string;
  name: string;
  /** Missing → "". */
  description: string;
  kind: FlagKind;
  /** Number flags only; default 'double'. */
  numberType?: 'int' | 'double';
  clientSideAvailability: { usingEnvironmentId: boolean; usingMobileKey: boolean };
  tags: string[];
  maintainer?: Maintainer;
  deprecated: boolean;
  deprecationMessage?: string;
  archived: boolean;
  /** From `codegen.name` custom properties. */
  aliases: Partial<Record<TargetId, string>>;
  uiUrl: string;
}
