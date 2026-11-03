import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { ArchivedAgent } from '../types'
import { folderKey } from './share'
import { HISTORY_KEY, MAX_HISTORY, PLAIN_KEY, SHAPES, live } from './state'

// What the pane keeps in the plugin's store: the agents that finished, and
// the wording the person picked.

const plain = atom({ plugin: 'agent-monitor', key: 'plain' } as const, false, {
  shape: SHAPES.plain,
})
const archive = atom({ plugin: 'agent-monitor', key: 'archive' } as const, [] as ArchivedAgent[], {
  shape: SHAPES.archive,
})

// Finished agents kept in the plugin's store, across restarts and sessions.
export const isArchived = (value: unknown): value is ArchivedAgent => {
  const v = value as Partial<ArchivedAgent> | null
  return typeof v?.id === 'string' && typeof v.folder === 'string' && typeof v.status === 'string' && Array.isArray(v.skills)
}

export async function readHistory($: EngineInterface): Promise<ArchivedAgent[]> {
  try {
    const stored = await $.store.get(HISTORY_KEY)
    return Array.isArray(stored) ? stored.filter(isArchived) : []
  } catch {
    return []
  }
}

export async function keepInHistory($: EngineInterface, entry: ArchivedAgent): Promise<void> {
  try {
    const list = await readHistory($)
    await $.store.set(HISTORY_KEY, [...list.filter(a => a.id !== entry.id), entry].slice(-MAX_HISTORY))
  } catch {
    // History is a nicety: the pane works without it.
  }
}

// The agents earlier sessions in this folder finished, for the Done tab.
export async function loadArchive($: EngineInterface): Promise<void> {
  const here = folderKey(live.selfCwd)
  const list = await readHistory($)
  await update($, archive, () => list.filter(a => folderKey(a.folder) === here))
}

export async function loadPlain($: EngineInterface): Promise<void> {
  try {
    const stored = await $.store.get(PLAIN_KEY)
    if (typeof stored === 'boolean') await update($, plain, () => stored)
  } catch {
    // Keep the default wording.
  }
}

export async function togglePlain($: EngineInterface): Promise<void> {
  const next = !(await read($, plain))
  await update($, plain, () => next)
  try {
    await $.store.set(PLAIN_KEY, next)
  } catch {
    // The choice holds for this session only.
  }
}
