import { getVaultUpgradeCost, calculateVaultBonus } from '@parsers/misc/upgradeVault';
import { ARCADE_OMEGA_LEVEL, getArcadeCapCost, getArcadeGoldCost, getArcadeUpgradeBonus } from '@parsers/world-2/arcade';
import { calcAtomBonus, getAtomUpgradeCost } from '@parsers/world-3/atomCollider';
import { applyStatuesMulti } from '@parsers/world-1/statues';
import { getStatueFlairExpMulti } from '@parsers/class-specific/royalGuardian';
import { formatAdvisorNumber } from './format';

const valid = Number.isFinite;
const label = (s = '') => s.replaceAll('_', ' ').replaceAll('$', '').trim();
const levelsText = (n) => `${n} ${n === 1 ? 'level' : 'levels'}`;
const VAULT_DAMAGE = [0, 10, 15, 20, 25, 27, 41, 80];

// Each plan starts from the original save. Plans are alternatives, not one shared shopping list.
export function additionalUpgradePlans({ account, characters, objective, limit }) {
  const plans = [];
  const coverage = {};
  const considered = (system) => {
    coverage[system] ??= { candidates: 0, evaluated: 0, skipped: {} };
    coverage[system].candidates++;
  };
  const skip = (system, reason) => {
    const counts = coverage[system].skipped;
    counts[reason] = (counts[reason] ?? 0) + 1;
  };
  const add = (system, action, acc) => {
    coverage[system].evaluated++;
    plans.push({ action, account: acc });
  };

  for (const index of objective === 'damage' ? VAULT_DAMAGE : [18]) {
    const row = account.upgradeVault?.upgrades?.[index];
    if (!row) continue;
    considered('Vault');
    if (!row.unlocked) { skip('Vault', 'locked'); continue; }
    if (!valid(row.level) || !valid(row.maxLevel)) { skip('Vault', 'missing level data'); continue; }
    if (row.level >= row.maxLevel) { skip('Vault', 'capped'); continue; }
    let acc = account, count = 0, total = 0;
    for (; count < limit && row.level + count < row.maxLevel; count++) {
      let price;
      try { price = getVaultUpgradeCost(acc.upgradeVault.upgrades, index, acc); } catch { break; }
      if (!valid(price) || price < 0 || !valid(acc.currencies?.rawMoney) || price > acc.currencies.rawMoney) break;
      const rows = acc.upgradeVault.upgrades.map((r, i) => i === index ? { ...r, level: r.level + 1 } : r);
      const upgrades = rows.map((r, i) => ({ ...r, bonus: calculateVaultBonus(rows, i) }));
      total += price;
      acc = { ...acc, currencies: { ...acc.currencies, rawMoney: acc.currencies.rawMoney - price },
        upgradeVault: { ...acc.upgradeVault, upgrades, totalUpgradeLevels: (acc.upgradeVault.totalUpgradeLevels ?? 0) + 1 } };
      if (index === 25) acc = { ...acc, statues: applyStatuesMulti(acc, characters) };
    }
    if (!count) { skip('Vault', 'coins or price data'); continue; }
    const name = label(row.name);
    add('Vault', { id: `${objective}:vault:${index}`, category: 'Vault', icon: `/data/VaultUpg${index}.png`,
      title: `Vault: Raise ${name} by ${levelsText(count)}`, levelCount: count, targetLevel: row.level + count,
      cost: `${formatAdvisorNumber(total)} coins`, amount: total, resource: 'coins',
      evidence: [`Level ${row.level} → ${row.level + count}; cap ${row.maxLevel}`, 'Unlock, per-level coin costs and vault bonuses checked.'],
      nextStep: `Buy ${levelsText(count)} of ${name} in the Upgrade Vault.`, route: '/account/misc/upgrade-vault' }, acc);
  }

  const arcadeEffects = objective === 'damage' ? ['Base_Damage', 'Total_Damage', 'Weapon_Power'] : ['Drop_Rate'];
  for (const [index, row] of (account.arcade?.shop ?? []).entries()) {
    if (!arcadeEffects.includes((row.effect ?? '').replace(/^[^A-Za-z]*(x_)?/, ''))) continue;
    considered('Arcade');
    if (row.active !== true) { skip('Arcade', row.active === undefined ? 'rotation unavailable' : 'not currently on sale'); continue; }
    if (!valid(row.level)) { skip('Arcade', 'missing level data'); continue; }
    if (row.level >= ARCADE_OMEGA_LEVEL) { skip('Arcade', 'capped'); continue; }
    let acc = account, count = 0;
    const costs = new Map();
    for (; count < limit && row.level + count < ARCADE_OMEGA_LEVEL; count++) {
      const level = row.level + count;
      let price;
      try { price = getArcadeCapCost(level) ?? { cost: getArcadeGoldCost(acc, level, index), currency: 'gold' }; } catch { break; }
      const field = `${price.currency}Balls`;
      const owned = acc.arcade[field];
      if (!valid(price.cost) || price.cost < 0 || !valid(owned) || price.cost > owned) break;
      const nextLevel = level + 1;
      const shop = acc.arcade.shop.map((r, i) => i === index
        ? { ...r, level: nextLevel, bonus: getArcadeUpgradeBonus(r, acc, nextLevel) } : r);
      costs.set(price.currency, (costs.get(price.currency) ?? 0) + price.cost);
      acc = { ...acc, arcade: { ...acc.arcade, shop, [field]: owned - price.cost,
        totalUpgradeLevels: (acc.arcade.totalUpgradeLevels ?? 0) + 1 } };
    }
    if (!count) { skip('Arcade', 'balls or price data'); continue; }
    const name = label(row.effect.replace(/^[^A-Za-z]*(x_)?/, ''));
    add('Arcade', { id: `${objective}:arcade:${index}`, category: 'Arcade', icon: `/data/${row.iconName ?? `PachiShopICON${index}`}.png`,
      title: `Arcade: Raise ${name} by ${levelsText(count)}`, levelCount: count, targetLevel: row.level + count,
      cost: [...costs].map(([currency, cost]) => `${formatAdvisorNumber(cost)} ${currency} balls`).join(' + '),
      resource: 'arcade', amount: count, evidence: [`Level ${row.level} → ${row.level + count}`,
        'Current shop rotation checked; Gold, Royal and Omega ball costs budgeted separately.'],
      nextStep: `Buy ${levelsText(count)} of ${name} in the Arcade shop.`, route: '/account/world-2/arcade-shop' }, acc);
  }

  // Neon is a direct maximum-damage input. Other atoms need separate dependency modelling.
  const neon = account.atoms?.atoms?.[9];
  if (objective === 'damage' && neon) {
    considered('Atom');
    if (!(account.towers?.data?.[8]?.level > 0) || !(account.atoms.totalAtomsAvailable > 9)) skip('Atom', 'collider or atom locked');
    else if (!valid(neon.level) || !valid(neon.maxLevel)) skip('Atom', 'missing level data');
    else if (neon.level >= neon.maxLevel) skip('Atom', 'capped');
    else {
      let acc = account, count = 0, total = 0;
      for (; count < limit && neon.level + count < neon.maxLevel; count++) {
        let price;
        try { price = getAtomUpgradeCost(acc, 9, neon.level + count); } catch { break; }
        if (!valid(price) || price < 0 || !valid(acc.atoms.particles) || price > acc.atoms.particles) break;
        const level = neon.level + count + 1;
        const value = calcAtomBonus(9, level, acc);
        const atoms = acc.atoms.atoms.map((r, i) => i === 9 ? { ...r, level, value, bonus: value } : r);
        total += price;
        acc = { ...acc, atoms: { ...acc.atoms, particles: acc.atoms.particles - price, atoms } };
      }
      if (!count) skip('Atom', 'particles or price data');
      else add('Atom', { id: `${objective}:atom:9`, category: 'Atom', icon: '/data/Atom9.png',
        title: `Atom: Raise ${label(neon.name)} by ${levelsText(count)}`, levelCount: count, targetLevel: neon.level + count,
        cost: `${formatAdvisorNumber(total)} atom particles`, amount: total, resource: 'particles',
        evidence: [`Level ${neon.level} → ${neon.level + count}; cap ${neon.maxLevel}`, 'Each price includes Neon’s updated atom-cost discount.'],
        nextStep: `Buy ${levelsText(count)} of ${label(neon.name)} in the Atom Collider.`, route: '/account/world-3/atom-collider' }, acc);
    }
  }

  for (const index of objective === 'damage' ? [0, 22] : []) {
    const row = account.statues?.[index];
    if (!row) continue;
    considered('Statue');
    const statueIndex = row.statueIndex ?? index;
    if (!(account.statueGrades?.[statueIndex] >= 1)) { skip('Statue', 'shared gold statue not unlocked'); continue; }
    if (!valid(row.level) || !valid(row.progress)) { skip('Statue', 'missing progress data'); continue; }
    const rawName = `Statue${statueIndex + 1}`;
    const owned = account.storage?.list?.filter((r) => r.rawName === rawName).reduce((sum, r) => sum + r.amount, 0);
    const multi = getStatueFlairExpMulti(account, statueIndex);
    if (!valid(owned) || !valid(multi) || multi <= 0) { skip('Statue', 'missing storage or flair data'); continue; }
    let count = 0, progress = row.progress, used = 0;
    for (; count < limit; count++) {
      const level = row.level + count;
      const required = Math.round(Math.pow(level, 1.17) * Math.pow(1.35, level / 10) + 1);
      const cost = Math.max(0, Math.ceil((required - progress) / multi));
      if (!valid(required) || !valid(cost) || used + cost > owned) break;
      used += cost;
      progress += cost * multi - required;
    }
    if (!count || !used) { skip('Statue', 'insufficient stored statues'); continue; }
    let remaining = used;
    const list = account.storage.list.map((r) => {
      if (r.rawName !== rawName || remaining <= 0) return r;
      const spent = Math.min(remaining, r.amount); remaining -= spent;
      return { ...r, amount: r.amount - spent };
    });
    const statues = account.statues.map((r, i) => i === index ? { ...r, level: r.level + count, progress } : r);
    const acc = { ...account, statues, storage: { ...account.storage, list } };
    const name = label(row.name);
    add('Statue', { id: `${objective}:statue:${statueIndex}`, category: 'Statue', icon: `/data/${row.rawName ?? rawName}.png`,
      title: `Statue: Raise ${name} by ${levelsText(count)}`, levelCount: count, targetLevel: row.level + count,
      cost: `${formatAdvisorNumber(used)} ${name} statues`, amount: used, resource: 'statues',
      evidence: [`Level ${row.level} → ${row.level + count}`, 'Stored statues, existing XP progress, shared gold unlock and current flair XP multiplier included.'],
      nextStep: `Turn in ${formatAdvisorNumber(used)} ${name} statues at the statue vendor.`, route: '/account/misc/general' }, acc);
  }
  return { plans, coverage };
}
