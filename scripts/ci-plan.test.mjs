import { describe, expect, it } from 'vitest';
import { listCompileTargets, listTargets, plan } from './ci-plan.mjs';

const TARGETS = ['dotnet', 'go', 'java', 'ts-server'];
const NOTHING = { unit: [], compile: [], pack: false };
const EVERYTHING = { unit: 'all', compile: TARGETS, pack: true };

describe('ci-plan', () => {
  it('finds the built-in targets from packages/emit-*', () => {
    expect(listTargets()).toEqual(expect.arrayContaining(TARGETS));
    expect(listCompileTargets(TARGETS)).toEqual(TARGETS);
  });

  it('compiles only targets that have a compile project', () => {
    expect(plan(['packages/emit-ruby/src/index.ts'], [...TARGETS, 'ruby'], TARGETS)).toEqual({
      unit: ['packages/cli/', 'packages/emit-ruby/'],
      compile: [],
      pack: true,
    });
  });

  it('runs nothing for docs-only changes', () => {
    expect(
      plan(
        ['README.md', 'CONTEXT.md', 'docs/adr/0001-number-flags-default-to-double.md', '.claude/skills/add-emitter/SKILL.md', '.github/workflows/claude.yml'],
        TARGETS,
      ),
    ).toEqual(NOTHING);
  });

  it('runs the CLI unit tests for DESIGN.md, which one of them reads', () => {
    expect(plan(['DESIGN.md'], TARGETS)).toEqual({ unit: ['packages/cli/'], compile: [], pack: false });
  });

  it('runs only one target for a change to its emitter', () => {
    expect(plan(['packages/emit-go/src/index.ts'], TARGETS)).toEqual({
      unit: ['packages/cli/', 'packages/emit-go/'],
      compile: ['go'],
      pack: true,
    });
  });

  it('runs a target for a change to its goldens', () => {
    expect(plan(['fixtures/golden/java/aliases.java'], TARGETS)).toEqual({
      unit: ['packages/cli/', 'packages/emit-java/'],
      compile: ['java'],
      pack: false,
    });
    expect(plan(['fixtures/golden/ts-server/aliases.ts'], TARGETS).pack).toBe(true);
  });

  it('runs only the compile test for a change to a compile fixture', () => {
    expect(plan(['fixtures/compile/dotnet/modern/Program.cs'], TARGETS)).toEqual({ unit: [], compile: ['dotnet'], pack: false });
  });

  it('runs the CLI tests and smoke test for a CLI change', () => {
    expect(plan(['packages/cli/src/config.ts'], TARGETS)).toEqual({ unit: ['packages/cli/'], compile: [], pack: true });
    expect(plan(['fixtures/snapshots/aliases.json'], TARGETS)).toEqual({ unit: ['packages/cli/'], compile: [], pack: true });
  });

  it('runs everything for core, root config, ci.yml and unknown paths', () => {
    for (const file of ['packages/core/src/index.ts', 'pnpm-lock.yaml', 'tsconfig.base.json', '.github/workflows/ci.yml', 'scripts/ci-plan.mjs', 'something-new.txt']) {
      expect(plan([file], TARGETS)).toEqual(EVERYTHING);
    }
  });

  it('runs everything for an emitter package it does not know as a target', () => {
    expect(plan(['packages/emit-ruby/src/index.ts'], TARGETS)).toEqual(EVERYTHING);
  });

  it('combines the jobs of several changes', () => {
    expect(plan(['packages/emit-go/src/index.ts', 'fixtures/compile/java/pom.xml', 'README.md'], TARGETS)).toEqual({
      unit: ['packages/cli/', 'packages/emit-go/'],
      compile: ['go', 'java'],
      pack: true,
    });
  });
});
