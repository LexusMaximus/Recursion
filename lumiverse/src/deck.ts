// Ours (not ported): fixed mini-deck for the Tier 0 Lumiverse pipeline (PLAN.md Step 5,
// decision 3). Families and roles are taken from CARD_CATALOG in src/cards.mjs. Entries are
// shaped so sanitizeHandCard (lumiverse/src/cards.mjs) is an identity pass over them.
import { CARD_CATALOG } from './cards.mjs';

export interface MiniDeckCard {
  id: string;
  family: string;
  role: string;
  status: 'active';
  promptText: string;
  tokenEstimate: number;
  detailProfile: 'compact' | 'standard' | 'expanded';
  emphasis: 'normal' | 'emphasized' | 'muted';
  evidenceRefs: string[];
}

// Same formula as estimateTokens in src/cards.mjs:475-477 (not exported there, so restated).
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function catalogRole(family: string): string {
  const entry = CARD_CATALOG.find((candidate) => candidate.family === family);
  if (!entry) throw new Error(`MINI_DECK family is not in CARD_CATALOG: ${family}`);
  return entry.role;
}

function deckCard(family: string, id: string, promptText: string): MiniDeckCard {
  return Object.freeze({
    id,
    family,
    role: catalogRole(family),
    status: 'active' as const,
    promptText,
    tokenEstimate: estimateTokens(promptText),
    detailProfile: 'standard' as const,
    emphasis: 'normal' as const,
    evidenceRefs: [] as string[]
  });
}

export const MINI_DECK: readonly MiniDeckCard[] = Object.freeze([
  deckCard('Scene Frame', 'scene-frame-1', 'State the current situation and the useful next exchange; do not invent a pause.'),
  deckCard('Active Cast', 'active-cast-1', 'Name who is present and their current conversational or physical role.'),
  deckCard('Scene Constraints', 'scene-constraints-1', 'Hold the hard limits the scene has already established; contradict none of them.'),
  deckCard('Knowledge', 'knowledge-1', 'Track what each character knows and what stays uncertain to them.'),
  deckCard('Open Threads', 'open-threads-1', 'Carry the unresolved questions and pending actions into this exchange.')
]);
