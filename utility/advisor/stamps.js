import { evaluateStamp, getGoldCostToMaxLevel } from '@parsers/world-1/stamps';
import { isRiftBonusUnlocked } from '@parsers/world-4/rift';
import { OPT } from '@parsers/accountOptions';

// Deduct from matching stacks in order, preserving the original save and duplicate stacks.
const spendStorage = (account, amount, matches) => {
  let left = amount;
  const list = account.storage?.list?.map((row) => {
    if (!matches(row) || left <= 0) return row;
    const spent = Math.min(left, row.amount);
    left -= spent;
    return { ...row, amount: row.amount - spent };
  });
  return { ...account, storage: { ...account.storage, list } };
};

export const stampBatch = ({ account, characters, category, index, limit }) => {
  const original = account.stamps[category][index];
  let acc = account;
  let stamp = original;
  let levels = 0, coins = 0, materials = 0, gildedCount = 0, capUnlocks = 0;
  let carrier, blocked;
  for (let step = 0; step < limit; step++) {
    let next = acc;
    let unlock;
    let gilded = false;
    let cost;
    try {
      cost = getGoldCostToMaxLevel({ ...stamp, maxLevel: stamp.level + 1 }, acc);
      if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(acc.currencies?.rawMoney)) { blocked = 'coin cost unavailable'; break; }
      if (cost > acc.currencies.rawMoney) { blocked = 'insufficient coins'; break; }
      if (stamp.level === stamp.maxLevel) {
        unlock = evaluateStamp(stamp, acc, characters, false, undefined, false, false);
        if ((!unlock.hasMaterials || !unlock.enoughPlayerStorage)
          && isRiftBonusUnlocked(acc.rift, 'Stamp_Mastery') && Number(acc.accountOptions?.[OPT.gildedStamps]) > 0) {
          gilded = true;
          unlock = evaluateStamp(stamp, acc, characters, true, undefined, false, false);
        }
        if (!unlock.hasMaterials || !unlock.enoughPlayerStorage) { blocked = 'stamp materials or carry capacity'; break; }
        if (!Number.isFinite(stamp.reqItemMultiplicationLevel) || stamp.reqItemMultiplicationLevel < 1) { blocked = 'stamp cap cost unavailable'; break; }
        if (stamp.materials?.length) {
          for (const material of stamp.materials) {
            if (material.type !== 'Equip') next = spendStorage(next, material.itemQuantity * unlock.materialCost,
              (row) => row.name === material.itemName);
          }
        } else next = spendStorage(next, unlock.materialCost, (row) => row.rawName === stamp.itemReq?.rawName);
        // A material-cap purchase consumes the accumulated Hydrogen discount.
        next = { ...next, atoms: { ...next.atoms, stampReducer: 0 } };
        if (gilded) {
          const options = Array.isArray(next.accountOptions) ? next.accountOptions.slice() : { ...next.accountOptions };
          options[OPT.gildedStamps] = Number(options[OPT.gildedStamps]) - 1;
          next = { ...next, accountOptions: options };
        }
      }
    } catch { blocked = 'stamp cap cost unavailable'; break; }
    const updated = { ...stamp, level: stamp.level + 1,
      maxLevel: unlock ? stamp.maxLevel + stamp.reqItemMultiplicationLevel : stamp.maxLevel,
      ownedMats: unlock && !stamp.materials?.length ? stamp.ownedMats - unlock.materialCost : stamp.ownedMats };
    acc = { ...next, currencies: { ...next.currencies, rawMoney: next.currencies.rawMoney - cost },
      stamps: { ...next.stamps, [category]: next.stamps[category].map((row, i) => i === index ? updated : row) } };
    stamp = updated;
    levels++;
    coins += cost;
    if (unlock) {
      materials += unlock.materialCost;
      capUnlocks++;
      gildedCount += Number(gilded);
      carrier = unlock.bestCharacter?.name;
    }
  }
  return { account: acc, levels, coins, materials, gildedCount, capUnlocks, carrier, targetLevel: stamp.level, blocked };
};
