import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errorHandler';

export interface SandboxCheck {
  status: 'not_run' | 'passed' | 'failed';
  logs: string;
}

export interface SandboxResult {
  linter: SandboxCheck;
  typecheck: SandboxCheck;
  overall: 'not_run' | 'passed' | 'failed';
  logs: string[];
}

export interface SandboxExecutor {
  checkPatch(patch: string): Promise<SandboxResult>;
}

export type SandboxCheckCommand = 'npm run lint' | 'npm run typecheck';

export interface IsolatedSandboxCommandRunner {
  runIsolatedCheck(patch: string, command: SandboxCheckCommand): Promise<SandboxCheck>;
}

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const FORBIDDEN_PATCH_PATHS = /(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:node_modules|\.git|dist|build)(?:\/|$)/i;

export function digestPatch(patch: string): string {
  return createHash('sha256').update(patch, 'utf8').digest('hex');
}

export function extractChangedPaths(patch: string): string[] {
  const paths = new Set<string>();
  const lines = patch.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const newPath = lines[index].match(/^\+\+\+\s+(?:b\/)?(.+)$/);
    const oldPath = lines[index - 1]?.match(/^---\s+(?:a\/)?(.+)$/);
    const pathValue = newPath?.[1] === '/dev/null'
      ? oldPath?.[1]
      : newPath?.[1];
    if (!pathValue || pathValue === '/dev/null') continue;
    const path = pathValue.trim();
    if (
      !SAFE_PATH.test(path) ||
      path.split('/').some((segment) => segment === '.' || segment === '..' || segment.length === 0) ||
      FORBIDDEN_PATCH_PATHS.test(path)
    ) {
      throw new HttpError(400, 'Patch contains an unsafe or restricted file path.', 'UNSAFE_PATCH_PATH');
    }
    paths.add(path);
  }
  if (paths.size === 0) {
    throw new HttpError(400, 'Patch must include at least one valid changed file path.', 'EMPTY_PATCH_PATHS');
  }
  if (paths.size > 50) throw new HttpError(400, 'A mutation may change no more than 50 files.', 'PATCH_TOO_MANY_FILES');
  return [...paths];
}

export class MockSandboxExecutor implements SandboxExecutor {
  async checkPatch(_patch: string): Promise<SandboxResult> {
    return {
      linter: { status: 'not_run', logs: 'Not run: isolated patch workspace is not configured.' },
      typecheck: { status: 'not_run', logs: 'Not run: isolated patch workspace is not configured.' },
      overall: 'not_run',
      logs: [
        'Patch execution is disabled.',
        'Configured check commands for a future isolated runner: npm run lint; npm run typecheck.',
      ],
    };
  }
}

export class IsolatedWorkspaceSandboxExecutor implements SandboxExecutor {
  constructor(private readonly runner: IsolatedSandboxCommandRunner) {}

  async checkPatch(patch: string): Promise<SandboxResult> {
    const linter = await this.runner.runIsolatedCheck(patch, 'npm run lint');
    const typecheck = await this.runner.runIsolatedCheck(patch, 'npm run typecheck');
    const overall = linter.status === 'failed' || typecheck.status === 'failed'
      ? 'failed'
      : linter.status === 'passed' && typecheck.status === 'passed'
        ? 'passed'
        : 'not_run';
    return {
      linter,
      typecheck,
      overall,
      logs: [linter.logs, typecheck.logs],
    };
  }
}

export const sandboxExecutor: SandboxExecutor = new MockSandboxExecutor();
