// 道具與裝備。type: consumable（消耗品）/ weapon / armor / accessory
export const ITEMS = {
  potion: { name: '傷藥', type: 'consumable', price: 25, desc: '回復 50 HP', hp: 50 },
  pill: { name: '兵糧丸', type: 'consumable', price: 35, desc: '回復 60 查克拉', chakra: 60 },
  kunai2: { name: '鋼製苦無', type: 'weapon', price: 120, level: 1, desc: '體術與苦無傷害 +15%', mul: 1.15 },
  kunai3: { name: '精鍛苦無', type: 'weapon', price: 420, level: 6, desc: '體術與苦無傷害 +35%', mul: 1.35 },
  mail: { name: '鎖子甲', type: 'armor', price: 150, level: 1, desc: '受到的傷害 -15%', def: 0.85 },
  plate: { name: '鍛鐵護甲', type: 'armor', price: 520, level: 10, desc: '受到的傷害 -30%', def: 0.7 },
  charm: { name: '查克拉護符', type: 'accessory', price: 260, level: 4, desc: '查克拉上限 +20、回復速度 +50%', chakra: 20, regen: 1.5 },
  // 任務獎勵（商店不賣）
  fang: { name: '狼王之牙', type: 'weapon', price: 0, desc: '體術與苦無傷害 +25%', mul: 1.25 },
  feather: { name: '鴉羽護符', type: 'accessory', price: 0, desc: '查克拉上限 +40、回復速度 +80%', chakra: 40, regen: 1.8 },
};

export const SHOP_STOCK = ['potion', 'pill', 'kunai2', 'mail', 'charm', 'kunai3', 'plate'];

export const SLOT_NAMES = { weapon: '武器', armor: '防具', accessory: '飾品' };

export const RAMEN_PRICE = 20;
