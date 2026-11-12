// Ported from Recursion src/card-selection.mjs (MIT License, Copyright (c) 2026 Josh Shapiro).
// Source lines: 75-82. Full license: LICENSE (repo root).
export function missingPlannedCards(cards = [], requirements = []) {
  return requirements.filter((job) => !cards.some((card) => {
    if (card?.status !== 'active' || !String(card.promptText || '').trim()) return false;
    if (job.cardId) return card.origin === 'authored' && card.id === job.cardId;
    return card.origin !== 'authored' && card.family === job.family
      && (job.sourceCardIds || []).every((id) => (card.sourceCardIds || []).includes(id));
  })).map(({ family = '', cardId = '', sourceCardIds = [] }) => ({ family, cardId, sourceCardIds }));
}
