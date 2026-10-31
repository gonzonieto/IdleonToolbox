import { getMaxDamage } from '@parsers/damage';
import { getDropRate } from '@parsers/character';
import { evaluateStamp, getGoldCostToMaxLevel } from '@parsers/world-1/stamps';
import { isRiftBonusUnlocked } from '@parsers/world-4/rift';
import { OPT } from '@parsers/accountOptions';
import { bubblePurchase, DAMAGE_BUBBLES } from './alchemy';
import { formatAdvisorNumber } from './format';

// Only direct passive inputs are supported. Changing stat/all-talent buffs would require
// reparsing derived character state, so those must not be simulated by editing one field.
const TALENTS = {
  damage: new Set(['SHARPENED_AXE', 'GILDED_SWORD', 'CARRY_A_BIG_STICK', 'HIGH_POLYMER_LIMBS', 'POWER_OVERWHELMING']),
  dropRate: new Set(['ROBBINGHOOD'])
};
const valid = (n) => typeof n === 'number' && Number.isFinite(n);
const label = (name) => name.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const evaluateUpgrades = ({ objective = 'damage', account, characters = [], characterName }, calculate) => {
  const mode = objective === 'dropRate' ? 'dropRate' : 'damage';
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
      const spend = Math.min(Math.floor(points), Math.floor(maxLevel - baseLevel));
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
      evaluate({ id: `${mode}:talent:${skillIndex}`, title: `Raise ${label(name)} to ${baseLevel + spend}`,
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
      let unlock = null;
      let gilded = false;
      if (stamp.level === stamp.maxLevel) {
        try {
          unlock = evaluateStamp(stamp, account, characters, false, undefined, false, false);
          if ((!unlock.hasMaterials || !unlock.enoughPlayerStorage)
            && isRiftBonusUnlocked(account.rift, 'Stamp_Mastery') && Number(account.accountOptions?.[OPT.gildedStamps]) > 0) {
            gilded = true;
            unlock = evaluateStamp(stamp, account, characters, true, undefined, false, false);
          }
        } catch { block('stamp cap cost unavailable'); continue; }
        if (!unlock.hasMaterials || !unlock.enoughPlayerStorage) { block('stamp materials or carry capacity'); continue; }
      }
      let cost;
      try { cost = getGoldCostToMaxLevel({ ...stamp, maxLevel: stamp.level + 1 }, account); }
      catch { result.unavailable++; continue; }
      if (!valid(cost) || cost < 0 || !valid(account.currencies?.rawMoney)) { block('coin cost unavailable'); continue; }
      if (cost > account.currencies.rawMoney) { block('insufficient coins'); continue; }
      const acc = { ...account, stamps: { ...account.stamps,
        [category]: stamps.map((s, i) => i === index ? { ...s, level: s.level + 1,
          maxLevel: unlock ? s.maxLevel + Math.max(1, s.reqItemMultiplicationLevel) : s.maxLevel } : s) } };
      const name = label(stamp.displayName ?? stamp.rawName);
      evaluate({ id: `${mode}:stamp:${category}:${stamp.rawName}`, title: `Raise ${name} to ${stamp.level + 1}`,
        cost: `${formatAdvisorNumber(cost)} coins${unlock ? ` + ${formatAdvisorNumber(unlock.materialCost)} ${label(stamp.itemReq?.name ?? stamp.itemReq?.rawName ?? 'materials')}${gilded ? ' + 1 gilded stamp' : ''}` : ''}`,
        evidence: [`Level ${stamp.level} → ${stamp.level + 1}; current cap ${stamp.maxLevel}`,
          unlock ? 'Material cap unlock and next coin level are included; materials and carry capacity checked.' : 'Affordable with the coins in this save; no material cap increase required.'],
        nextStep: unlock ? `Use ${unlock.bestCharacter?.name ?? 'a character with sufficient carry capacity'} to raise ${name}'s material cap${gilded ? ' with a gilded stamp' : ''}, then buy one level.` : `Buy one level of ${name} at the stamp vendor.`, route: '/account/world-1/stamps',
        resource: 'coins', amount: cost }, selected, acc);
    }
  }
  for (const bubble of account.alchemy?.bubblesFlat ?? []) {
    if (!(mode === 'damage' ? DAMAGE_BUBBLES.has(bubble.bubbleName) : bubble.bubbleName === 'DROPPIN_LOADS')
      || !valid(bubble.level) || bubble.level < 1) continue;
    let purchase;
    try { purchase = bubblePurchase(account, bubble); } catch { block('alchemy cost unavailable'); continue; }
    if (purchase.blocked) { block(`alchemy: ${purchase.blocked}`); continue; }
    const upgrade = (b) => b.bubbleIndex === bubble.bubbleIndex ? { ...b, level: b.level + 1 } : b;
    const acc = { ...account, alchemy: { ...account.alchemy,
      bubblesFlat: account.alchemy.bubblesFlat.map(upgrade),
      bubbles: Object.fromEntries(Object.entries(account.alchemy.bubbles).map(([key, rows]) => [key, rows.map(upgrade)])) } };
    const name = label(bubble.bubbleName);
    evaluate({ id: `${mode}:bubble:${bubble.bubbleIndex}`, title: `Raise ${name} to ${bubble.level + 1}`,
      cost: purchase.costs.map((c) => `${formatAdvisorNumber(c.amount)} ${label(c.name)}`).join(' + '),
      evidence: [`Bubble level ${bubble.level} → ${bubble.level + 1}`, 'Costs include current cauldron discounts; no optional bargain tag or class discount assumed.',
        ...(purchase.usingParticles ? ['Atom substitution and a remaining daily Boron use are included.'] : [])],
      nextStep: `Buy one level of ${name}${purchase.usingParticles ? ', paying particles for the first ingredient' : ''}.`,
      route: '/account/world-2/bubbles', resource: 'alchemy', amount: 1, costs: purchase.costs }, selected, acc);
  }
  result.actions.sort((a, b) => b.gainPercent - a.gainPercent || a.id.localeCompare(b.id));
  return result;
};
