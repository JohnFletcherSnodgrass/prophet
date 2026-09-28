import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface NotifiedRecord {
  score: number;
  notifiedAt: string;
}

export interface PipelineState {
  /** Last notification sent per coin symbol, for dedupe/cooldown. */
  notified: Record<string, NotifiedRecord>;
}

export function emptyState(): PipelineState {
  return { notified: {} };
}

export async function loadState(path: string): Promise<PipelineState> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as PipelineState;
    return { notified: parsed.notified ?? {} };
  } catch (err) {
    if (isNotFound(err)) return emptyState();
    throw err;
  }
}

export async function saveState(path: string, state: PipelineState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'ENOENT';
}
