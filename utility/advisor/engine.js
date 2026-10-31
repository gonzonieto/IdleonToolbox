/**
 * Progression Advisor v0.1: pure, deterministic, browser-local recommendations.
 *
 * This module intentionally imports no parsers, game data, React, or services.
 * Callers provide already-parsed account/character data and optional stats
 * computed by Toolbox's existing game formulas.
 *
 * A priority score is an ordering heuristic, NOT an estimate of percentage gain.
 * The engine does not model marginal upgrade gains or material costs yet.
 */
export const OBJECTIVES = Object.freeze({
  damage: { label: 'Damage', description: 'Make combat progression more effective' },
  dropRate: { label: 'Drop rate', description: 'Find opportunities to improve drop rarity' }
});

const clamp = (n, lower, upper) => Math.max(lower, Math.min(upper, n));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const nonnegative = (n) => finite(n) ? Math.max(n, 0) : 0;
const formatInteger = (n) => Math.round(n).toLocaleString('en-US');
const formatRate = (n) => `${n.toFixed(2)}x`;

const suggestion = (id, score, title, rationale, evidence, nextStep, route, confidence = 'medium', effort = 'check', caveat = '') => ({
  id, score, title, rationale, evidence, nextStep, route, confidence, effort, caveat
});

const combatStamps = (account) => Array.isArray(account?.stamps?.combat) ? account.stamps.combat : [];
const relevantBubble = (account, name) => (account?.alchemy?.bubblesFlat ?? [])
  .find((bubble) => bubble?.bubbleName === name);

// Only raise a check for a real, unlocked upgrade. Never assume an unreleased
// bubble or an item at level zero can actually be purchased.
const bubbleCheck = (account, name, label, objective) => {
  const bubble = relevantBubble(account, name);
  const level = bubble?.level;
  if (!finite(level) || level < 1) return null;
  const threshold = 30; // A REVIEW threshold, not a mathematical optimum.
  if (level >= threshold) return null;
  return suggestion(
    `${objective}:bubble:${name}`,
    35 + Math.round((threshold - level) / threshold * 10),
    `Review ${label} (alchemy)`,
    `${label} is a known source for this objective. It is currently below the advisor's configurable review threshold of level ${threshold}; this is not evidence that the next upgrade is the best investment.`,
    [`Current bubble level: ${formatInteger(level)}`],
    'Open Bubbles and compare the next level’s displayed effect and required materials with your other available upgrades.',
    '/account/world-2/bubbles',
    'medium', 'upgrade check',
    'Upgrade return, affordability, and other multipliers have not yet been simulated.'
  );
};

const inspectCombatStamps = (account) => {
  const eligible = combatStamps(account).filter((stamp) => finite(stamp?.level) && stamp.level > 0);
  if (eligible.length < 2) return null;
  const lowest = [...eligible].sort((a, b) => a.level - b.level).slice(0, 3);
  return suggestion(
    'damage:stamp-review', 28,
    'Inspect your lowest-level combat stamps',
    'Combat stamps offer permanent combat bonuses, but not every combat stamp raises damage. This is a shortlist for inspection, not an upgrade order.',
    lowest.map((stamp) => `${stamp.displayName ?? stamp.rawName ?? 'Combat stamp'}: Lv ${formatInteger(stamp.level)}`),
    'Check whether these stamps improve your desired damage stat and whether their next levels are affordable.',
    '/account/world-1/stamps', 'low', 'upgrade check',
    'Ranked by current level only; no marginal damage-per-material calculation is implied.'
  );
};

/**
 * @param {object} input
 * @param {'damage'|'dropRate'} input.objective
 * @param {object} input.account - Toolbox's parsed account (not the raw save)
 * @param {object[]} input.characters - Toolbox's parsed characters
 * @param {string} input.characterName - Selected character name
 * @param {object} [input.stats] - Map of character name to {maxDamage, hitChance, survivability, dropRate}
 * @returns {{objective:string, characterName:string|null, recommendations:object[], metrics:object, diagnostics:string[]}}
 */
export const getRecommendations = ({ objective = 'damage', account, characters = [], characterName, stats = {} } = {}) => {
  const mode = Object.hasOwn(OBJECTIVES, objective) ? objective : 'damage';
  const list = Array.isArray(characters) ? characters : [];
  const selected = list.find((c) => c?.name === characterName) ?? list[0];
  const diagnostics = [];
  const recommendations = [];
  const character = selected ?? null;
  const metrics = character && stats?.[character.name] ? stats[character.name] : {};
  if (!account || !character) return {
    objective: mode,
    characterName: character?.name ?? null,
    metrics: {}, recommendations: [],
    diagnostics: ['No parsed account and character data available. Import a save or sign in to Toolbox.']
  };
  if (metrics.calculationUnavailable) {
    diagnostics.push('The existing Toolbox formula could not calculate this metric from the available save. Numeric comparisons are hidden until the data is available.');
  }
  const add = (recommendation) => { if (recommendation) recommendations.push(recommendation); };

  if (mode === 'damage') {
    // Toolbox's hitChance is a percentage [0,100], not a [0,1] fraction.
    if (character.targetMonster && finite(metrics.hitChance) && metrics.hitChance >= 0 && metrics.hitChance < 99.5) {
      const missed = 100 - metrics.hitChance;
      add(suggestion('damage:accuracy', clamp(70 + missed * 0.55, 70, 96),
        'Improve accuracy against your current target',
        `Your calculated hit chance is below 100%. Improving accuracy can increase effective combat output even before maximum damage changes.`,
        [`Target: ${character.targetMonster}`, `Current hit chance: ${metrics.hitChance.toFixed(1)}%`],
        'Review accuracy sources and compare the hit chance after your next upgrade or equipment change.',
        '/characters', 'high', 'build check',
        'This is target-specific. The advisor has not calculated the cheapest way to reach 100%.'
      ));
    }
    if (character.targetMonster && finite(metrics.survivability) && metrics.survivability < 99.5 && metrics.survivability >= 0) {
      add(suggestion('damage:survivability', clamp(59 + (100 - metrics.survivability) * 0.3, 59, 87),
        'Check survivability before buying more damage',
        'Your survival rate against your current target is below 100%, which can reduce effective AFK combat progress.',
        [`Target: ${character.targetMonster}`, `Survivability: ${metrics.survivability.toFixed(1)}%`],
        'Review health, defence and food for this character before prioritizing raw damage.',
        '/characters', 'high', 'build check'
      ));
    }
    const available = Array.isArray(character.talentPointsLeft)
      ? character.talentPointsLeft.map(nonnegative).reduce((a, b) => a + b, 0)
      : 0;
    if (available >= 1) {
      add(suggestion('damage:talents', clamp(50 + Math.log2(available + 1) * 5, 52, 77),
        'Review unspent talent points',
        'Unspent talent points may allow a damage improvement without farming new materials. Which talents improve damage depends on your class and build.',
        [`Available points across talent tabs: ${formatInteger(available)}`],
        'Inspect relevant damage, main-stat, and combat talents on this character. Do not assume every unspent point should go into damage.',
        '/characters', 'high', 'quick check'
      ));
    }
    add(inspectCombatStamps(account));
    // These three bubbles are direct inputs to getMaxDamage's main-stat calculation,
    // but their relative value varies between classes and other bonuses.
    // Only examine the main-stat bubble for the selected class. Other bubbles
    // may be useful account-wide, but are not direct replacements for this one.
    const bubbleByStat = {
      strength: ['FARQUAD_FORCE', 'Farquad Force'],
      agility: ['QUICKDRAW_QUIVER', 'Quickdraw Quiver'],
      wisdom: ['SMARTER_SPELLS', 'Smarter Spells']
    };
    const classBubble = bubbleByStat[metrics.mainStat];
    if (classBubble) add(bubbleCheck(account, ...classBubble, mode));
    if (finite(metrics.maxDamage)) diagnostics.push(`Displayed maximum damage: ${formatInteger(metrics.maxDamage)} (Toolbox formula).`);
  } else {
    const current = metrics.dropRate;
    const peers = list.map((entry) => ({ name: entry.name, value: stats?.[entry.name]?.dropRate }))
      .filter((entry) => finite(entry.value) && entry.value > 0);
    const best = [...peers].sort((a, b) => b.value - a.value)[0];
    if (best && finite(current) && current > 0 && best.name !== character.name && best.value > current * 1.1) {
      add(suggestion('dropRate:compare-characters', clamp(68 + (best.value / current - 1) * 15, 68, 89),
        'Compare drop-rate setups across characters',
        `Another character has a higher calculated drop-rate multiplier. Compare removable bonuses such as cards, obols, equipment, and star signs before changing your setup.`,
        [`${character.name}: ${formatRate(current)}`, `${best.name}: ${formatRate(best.value)}`],
        `Inspect ${best.name}'s drop-rate setup and determine whether any transferable choices also help ${character.name}.`,
        '/characters', 'high', 'build check',
        'Different classes and abilities make total drop rates non-transferable. The difference is NOT a predicted improvement.'
      ));
    }
    add(bubbleCheck(account, 'DROPPIN_LOADS', 'Droppin Loads', mode));
    const available = Array.isArray(character.talentPointsLeft)
      ? character.talentPointsLeft.map(nonnegative).reduce((a, b) => a + b, 0)
      : 0;
    if (available >= 1) add(suggestion('dropRate:talents', 40,
      'Check available drop-rate and luck talents',
      'You have unspent talent points. Some class-specific talents can increase drop rate, but many classes have no relevant direct talent.',
      [`Available points: ${formatInteger(available)}`],
      'Review your available talents for drop rate and luck; do not spend points based on this reminder alone.',
      '/characters', 'low', 'quick check'));
    if (finite(current)) diagnostics.push(`Calculated drop rate: ${formatRate(current)} (Toolbox formula).`);
  }

  // A score is an explainable triage heuristic, not a percentage improvement.
  // Use explicit IDs for deterministic tie-breaking across sessions/engines.
  return {
    objective: mode,
    characterName: character.name,
    metrics,
    diagnostics,
    recommendations: recommendations
      .filter((r) => r && finite(r.score))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  };
};
