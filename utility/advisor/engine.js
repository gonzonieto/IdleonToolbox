import { formatAdvisorNumber } from './format';

export const OBJECTIVES = Object.freeze({
  damage: { label: 'Damage', description: 'Increase displayed maximum damage' },
  dropRate: { label: 'Drop rate', description: 'Increase the drop-rate multiplier' }
});

// Recommendations come only from evaluated, affordable changes. Spare points,
// low upgrade levels, and differences between characters are not recommendations.
export const getRecommendations = ({ objective = 'damage', account, characters = [], characterName, evaluation } = {}) => {
  const mode = Object.hasOwn(OBJECTIVES, objective) ? objective : 'damage';
  const character = characters.find((c) => c.name === characterName) ?? characters[0];
  const diagnostics = [];
  const result = { objective: mode, characterName: character?.name ?? null, recommendations: [], diagnostics };
  if (!account || !character) return result;
  if (!(Number.isFinite(evaluation?.baseline) && evaluation.baseline > 0)) {
    diagnostics.push('The current metric could not be calculated. No upgrade predictions are available.');
    return result;
  }
  const metric = mode === 'damage' ? 'maximum damage' : 'drop-rate multiplier';
  diagnostics.push(`Current ${metric}: ${formatAdvisorNumber(evaluation.baseline)}.`);
  diagnostics.push(`${evaluation.checked} supported changes evaluated for this character.`);
  if (evaluation.unavailable) diagnostics.push(`${evaluation.unavailable} calculations were unavailable and excluded.`);
  result.recommendations = (evaluation.actions ?? []).filter((a) => Number.isFinite(a.after)
    && a.after > evaluation.baseline && Number.isFinite(a.gainPercent) && a.gainPercent > 0)
    .map((a) => ({ ...a, before: evaluation.baseline }))
    .sort((a, b) => b.gainPercent - a.gainPercent || a.id.localeCompare(b.id));
  return result;
};
