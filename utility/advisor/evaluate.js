import { getMaxDamage } from '@parsers/damage';
import { getDropRate } from '@parsers/character';
import { stampBatch } from './stamps';
import { bubblePurchase, DAMAGE_BUBBLES } from './alchemy';
import { formatAdvisorNumber } from './format';
import { additionalUpgradePlans } from './systems';

// Only direct passive inputs are supported. Changing stat/all-talent buffs would require
// reparsing derived character state, so those must not be simulated by editing one field.
const TALENTS = {
  damage: new Set(['SHARPENED_AXE', 'GILDED_SWORD', 'CARRY_A_BIG_STICK', 'HIGH_POLYMER_LIMBS', 'POWER_OVERWHELMING']),
  dropRate: new Set(['ROBBINGHOOD'])
};
const valid = (n) => typeof n === 'number' && Number.isFinite(n);
const label = (name) => name.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const evaluateUpgrades = ({ objective = 'damage', account, characters = [], characterName, batchSize = 10 }, calculate) => {
  const mode = objective === 'dropRate' ? 'dropRate' : 'damage';
  const limit = Number.isFinite(batchSize) ? Math.max(1, Math.min(100, Math.floor(batchSize))) : 10;
  const levelText = (n) => `${n} ${n === 1 ? 'level' : 'levels'}`;
  const selected = characters.find((c) => c.name === characterName) ?? characters[0];
  const result = { baseline: null, actions: [], checked: 0, unavailable: 0, blocked: {} };
  const block = (reason) => { result.blocked[reason] = (result.blocked[reason] ?? 0) + 1; };
  if (!account || !selected) return result;
  const metric = calculate ?? ((character, peers, acc) => mode === 'damage'
    ? getMaxDamage(character, peers, acc).maxDamage : getDropRate(character, acc, peers).dropRate);
  try { result.baseline = metric(selected, characters, account); } catch { result.unavailable++; return result; }
  if (!valid(result.baseline) || result.baseline <= 0) return result;
  const evaluate = (action, character, acc) => {
    result.checked++;
    try {
      const peers = characters.map((c) => c === selected ? character : c);
      const after = metric(character, peers, acc);
      const gainPercent = ((after - result.baseline) / result.baseline) * 100;
      if (valid(after) && gainPercent > 0) result.actions.push({ ...action, after, gainPercent });
      else if (!valid(after)) result.unavailable++;
    } catch { result.unavailable++; }
  };

  Object.values(selected.talents ?? {}).forEach((tab, tabIndex) => {
    const points = selected.talentPointsLeft?.[tabIndex];
    if (!valid(points) || points < 1) return;
    for (const talent of tab.orderedTalents ?? []) {
      const { baseLevel, maxLevel, level, name, skillIndex } = talent;
      // Unknown caps and unlearned talents are excluded: activating a talent can change
      // bonus-level rules. Known learned passives preserve their existing bonus levels.
      if (!TALENTS[mode].has(name) || !valid(baseLevel) || baseLevel < 1
        || !valid(maxLevel) || !valid(level) || level < baseLevel || baseLevel >= maxLevel
        || !valid(skillIndex)) continue;
      const spend = Math.min(limit, Math.floor(points), Math.floor(maxLevel - baseLevel));
      if (spend < 1) continue;
      const upgrade = (t) => t.skillIndex === skillIndex
        ? { ...t, baseLevel: baseLevel + spend, level: level + spend } : t;
      const character = { ...selected,
        flatTalents: selected.flatTalents?.map(upgrade),
        talents: Object.fromEntries(Object.entries(selected.talents).map(([key, page]) =>
          [key, { ...page, orderedTalents: page.orderedTalents?.map(upgrade) }])),
        talentPointsLeft: selected.talentPointsLeft.map((p, i) => i === tabIndex ? p - spend : p)
      };
      if (!character.flatTalents?.some((t) => t.skillIndex === skillIndex)) continue;
      evaluate({ id: `${mode}:talent:${skillIndex}`, category: 'Talent', icon: `/data/UISkillIcon${talent.talentId ?? skillIndex}.png`,
        title: `Talent: Raise ${label(name)} by ${levelText(spend)}`, levelCount: spend, targetLevel: baseLevel + spend,
        cost: `${spend.toLocaleString('en-US')} talent points from tab ${tabIndex + 1}`,
        evidence: [`Allocated level ${baseLevel} → ${baseLevel + spend}; current cap ${maxLevel}`],
        nextStep: `On ${selected.name}, spend ${spend.toLocaleString('en-US')} points from tab ${tabIndex + 1} on ${label(name)}.`,
        route: '/characters', resource: 'talentPoints', amount: spend }, character, account);
    }
  });

  for (const [category, stamps] of Object.entries(account.stamps ?? {})) {
    if (!Array.isArray(stamps)) continue;
    for (const [index, stamp] of stamps.entries()) {
      const effects = mode === 'damage' ? ['Base_Damage', 'Total_Damage'] : ['Drop_Rate'];
      if (!effects.some((effect) => stamp.effect?.includes(effect)) || !valid(stamp.level)
        || stamp.level < 1 || !valid(stamp.maxLevel) || stamp.level > stamp.maxLevel) continue;
      const plan = stampBatch({ account, characters, category, index, limit });
      if (plan.blocked) block(plan.blocked);
      if (!plan.levels) continue;
      const name = label(stamp.displayName ?? stamp.rawName);
      evaluate({ id: `${mode}:stamp:${category}:${stamp.rawName}`, category: 'Stamp', icon: stamp.rawName ? `/data/${stamp.rawName}.png` : null,
        title: `Stamp: Raise ${name} by ${levelText(plan.levels)}`,
        levelCount: plan.levels, targetLevel: plan.targetLevel,
        cost: `${formatAdvisorNumber(plan.coins)} coins${plan.capUnlocks ? ` + ${formatAdvisorNumber(plan.materials)} ${label(stamp.itemReq?.name ?? stamp.itemReq?.rawName ?? 'materials')}${plan.gildedCount ? ` + ${plan.gildedCount} gilded ${plan.gildedCount === 1 ? 'stamp' : 'stamps'}` : ''}` : ''}`,
        evidence: [`Level ${stamp.level} → ${plan.targetLevel}; starting cap ${stamp.maxLevel}`,
          plan.capUnlocks ? `Material cap unlocks: ${plan.capUnlocks}. Cumulative materials, coin costs, carry capacity and gilded uses checked.` : 'Cumulative coin costs checked; no material cap increase required.'],
        nextStep: plan.capUnlocks ? `Use ${plan.carrier ?? 'a character with sufficient carry capacity'} to unlock the material caps as needed, then buy ${levelText(plan.levels)} of ${name}${plan.gildedCount ? `, using ${plan.gildedCount} gilded ${plan.gildedCount === 1 ? 'stamp' : 'stamps'}` : ''}.` : `Buy ${levelText(plan.levels)} of ${name} at the stamp vendor.`,
        route: '/account/world-1/stamps', resource: 'coins', amount: plan.coins }, selected, plan.account);
    }
  }
  for (const bubble of account.alchemy?.bubblesFlat ?? []) {
    if (!(mode === 'damage' ? DAMAGE_BUBBLES.has(bubble.bubbleName) : bubble.bubbleName === 'DROPPIN_LOADS')
      || !valid(bubble.level) || bubble.level < 1) continue;
    let acc = account;
    let current = bubble;
    let levels = 0;
    let particleLevels = 0;
    const spent = new Map();
    const totals = new Map();
    for (let step = 0; step < limit; step++) {
      let purchase;
      try { purchase = bubblePurchase(acc, current, spent); } catch { block('alchemy cost unavailable'); break; }
      if (purchase.blocked) { block(`alchemy: ${purchase.blocked}`); break; }
      for (const cost of purchase.costs) {
        spent.set(cost.rawName, (spent.get(cost.rawName) ?? 0) + cost.amount);
        totals.set(cost.rawName, { ...cost, amount: (totals.get(cost.rawName)?.amount ?? 0) + cost.amount });
      }
      levels++;
      if (purchase.usingParticles) particleLevels++;
      const upgrade = (b) => b.bubbleIndex === bubble.bubbleIndex ? { ...b, level: b.level + 1 } : b;
      acc = { ...acc, alchemy: { ...acc.alchemy,
        bubblesFlat: acc.alchemy.bubblesFlat.map(upgrade),
        bubbles: Object.fromEntries(Object.entries(acc.alchemy.bubbles).map(([key, rows]) => [key, rows.map(upgrade)])) } };
      current = { ...current, level: current.level + 1 };
    }
    if (!levels) continue;
    const costs = [...totals.values()];
    const name = label(bubble.bubbleName);
    evaluate({ id: `${mode}:bubble:${bubble.bubbleIndex}`, category: 'Bubble', icon: bubble.rawName ? `/data/${bubble.rawName}.png` : null,
      title: `Bubble: Raise ${name} by ${levelText(levels)}`,
      levelCount: levels, targetLevel: current.level,
      cost: costs.map((c) => `${formatAdvisorNumber(c.amount)} ${label(c.name)}`).join(' + '),
      evidence: [`Bubble level ${bubble.level} → ${current.level}`, 'Each level is priced separately; total materials, liquids and daily uses fit the save.',
        'Costs include current cauldron discounts; no optional bargain tag or class discount assumed.',
        ...(particleLevels ? [`${particleLevels} of these levels use particles for the first ingredient.`] : [])],
      nextStep: `Buy ${levelText(levels)} of ${name}${particleLevels ? `, paying particles for the first ingredient on ${particleLevels} ${particleLevels === 1 ? 'level' : 'levels'}` : ''}.`,
      route: '/account/world-2/bubbles', resource: 'alchemy', amount: levels, costs }, selected, acc);
  }
  const additional = additionalUpgradePlans({ account, characters, objective: mode, limit });
  result.coverage = additional.coverage;
  for (const plan of additional.plans) evaluate(plan.action, selected, plan.account);
  result.actions.sort((a, b) => b.gainPercent - a.gainPercent || a.id.localeCompare(b.id));
  return result;
};
