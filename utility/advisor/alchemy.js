import { growth } from '@utility/helpers';
import { getBubbleBonus, getBubbleUpgradeCost, getBubbleParticleCost, getVialsBonusByStat, LIQUID_INFO } from '@parsers/world-2/alchemy';
import { summonEssenceColor } from '@parsers/world-6/summoning';
import { getAchievementStatus } from '@parsers/achievements';
import { OPT } from '@parsers/accountOptions';

export const DAMAGE_BUBBLES = new Set(['BRITTLEY_SPEARS', 'BOW_JACK', 'MATTY_STAFFORD',
  'POWER_TRIONE', 'POWER_TRITWO', 'POWER_TRITHREE', 'FARQUAD_FORCE', 'QUICKDRAW_QUIVER', 'SMARTER_SPELLS',
  'DMG_OF_THE_SUN', 'DMG_OF_THE_MOON', 'DMG_OF_THE_SOUL', 'BIG_MEATY_CLAWS', 'QUICK_SLAP', 'NAME_I_GUESS',
  'SPEAR_POWAH', 'BOW_POWER', 'WAND_PAWUR']);
const finite = Number.isFinite;
const CROPS = { W6item1: 4, W6item2: 30, W6item3: 46, W6item4: 72, W6item5: 99 };
const ESSENCES = { W6item6: 0, W6item7: 1, W6item8: 2, W6item9: 3, W6item10: 4 };

export const bubbleResourceName = (account, item) => {
  if (/^Liquid[1-4]$/.test(item.rawName)) return LIQUID_INFO[Number(item.rawName.slice(-1)) - 1].displayName;
  if (item.rawName in ESSENCES) return `${summonEssenceColor[ESSENCES[item.rawName]]} summoning essence`;
  if (item.rawName in CROPS) return `farming crop #${CROPS[item.rawName]}`;
  if (/^W7item[0-3]$/.test(item.rawName)) return account.spelunking?.discoveries?.flat()?.[Number(item.rawName.slice(-1))]?.name ?? item.rawName;
  return item.name ?? item.rawName;
};

export const ownedBubbleResource = (account, rawName) => {
  if (/^Liquid[1-4]$/.test(rawName)) return account.alchemy?.liquids?.[Number(rawName.slice(-1)) - 1];
  if (rawName === 'Bits') return account.gaming?.bits;
  if (rawName.startsWith('Sail')) return account.sailing?.lootPile?.find((r) => r.rawName === rawName.replace('SailTr', 'SailT'))?.amount ?? 0;
  if (rawName.startsWith('W6item')) {
    if (rawName in CROPS) return account.farming?.crop?.[CROPS[rawName]];
    if (rawName in ESSENCES) return account.summoning?.essences?.[ESSENCES[rawName]];
    return undefined;
  }
  if (/^W7item[0-3]$/.test(rawName)) return account.spelunking?.discoveries?.flat()?.[Number(rawName.slice(-1))]?.amount;
  if (!Array.isArray(account.storage?.list)) return undefined;
  return account.storage.list.filter((r) => r.rawName === rawName).reduce((sum, r) => sum + r.amount, 0);
};

// Match the Bubbles page's current-cauldron costs. Optional bargain tags and
// class-discount previews are not assumed to be active.
export const bubblePurchase = (account, bubble, spent = new Map()) => {
  const rows = account.alchemy?.bubbles?.[bubble.cauldron];
  if (!rows || !Array.isArray(bubble.itemReq)) return { blocked: 'missing cost data' };
  const last = rows[14]?.level ?? 0;
  const multi = bubble.cauldron !== 'kazam' ? rows[16]?.level ?? 0 : 0;
  const cauldronLevel = account.alchemy.cauldrons?.[bubble.cauldron]?.boosts?.cost?.level ?? 0;
  const vialBonus = getVialsBonusByStat(account.alchemy.vials, 'AlchBubbleCost') + getBubbleBonus(account, 'UNDEVELOPED_COSTS', false);
  const costs = [];
  let usingParticles = false;
  for (const [itemIndex, item] of bubble.itemReq.entries()) {
    if (item.rawName === 'Blank') continue;
    if (!item.rawName || item.rawName === 'ERROR') return { blocked: 'missing cost data' };
    const amount = getBubbleUpgradeCost({ rawName: item.rawName, bubbleIndex: bubble.index, level: bubble.level, baseCost: item.baseCost,
      discounts: {
        cauldronBubble: Math.max(0.05, 1 - growth('decay', last, 40, 12, false) / 100 * growth('decayMulti', 0, 2, 50, false) * growth('decayMulti', multi, 1.4, 30, false)),
        cauldronLevel: Math.max(0.1, 1 - Math.round(10 * growth('decay', cauldronLevel, 90, 100, false)) / 1000),
        vialAndBubble: Math.max(0.05, 1 - vialBonus / 100),
        bargainTag: 1,
        smrt: Math.max(0.9, 1 - 0.1 * getAchievementStatus(account.achievements, 108))
      } });
    const owned = ownedBubbleResource(account, item.rawName) - (spent.get(item.rawName) ?? 0);
    if (!finite(amount) || amount < 0) return { blocked: 'missing cost data' };
    if (finite(owned) && owned >= amount) {
      costs.push({ rawName: item.rawName, name: bubbleResourceName(account, item), amount, owned });
      continue;
    }
    const particles = getBubbleParticleCost(account, bubble.index, item.rawName, itemIndex, amount);
    const uses = Number(account.accountOptions?.[OPT.alternateParticles]) - (spent.get('BoronUses') ?? 0);
    const particlesLeft = account.atoms?.particles - (spent.get('Particles') ?? 0);
    if (particles > 0 && finite(particlesLeft) && particlesLeft >= particles && uses >= 1) {
      costs.push({ rawName: 'Particles', name: 'atom particles', amount: particles, owned: particlesLeft },
        { rawName: 'BoronUses', name: 'Boron upgrade use', amount: 1, owned: uses });
      usingParticles = true;
    } else return { blocked: finite(owned) ? 'insufficient resources' : 'missing resource data' };
  }
  if (!costs.length) return { blocked: 'missing cost data' };
  const sums = new Map();
  for (const cost of costs) sums.set(cost.rawName, (sums.get(cost.rawName) ?? 0) + cost.amount);
  if (costs.some((c) => sums.get(c.rawName) > c.owned)) return { blocked: 'insufficient resources' };
  return { costs, usingParticles };
};
