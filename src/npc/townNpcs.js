import * as THREE from 'three';
import { lerpAngle } from '../core/math.js';
import { createNameplate } from '../core/textures.js';
import { createCharacter, animateCharacter } from '../player/character.js';
import { toonify } from '../render/toon.js';
import { getTerrainHeight } from '../world/terrain.js';
import { THEME } from '../data/theme.js';
import { QUEST_BOARD } from '../world/village.js';

// 站在固定位置、可以對話的 NPC
const NPCS = [
  { key: 'leader', x: QUEST_BOARD.x + 5, z: QUEST_BOARD.z + 1, color: '#ffd27a',
    look: { jacket: 0xf2efe6, pants: 0xe8e2d4, shoulders: 0xb3261e, hair: 0xd8d8d8, spiky: false, band: false, hat: 0xf2efe6 } },
  { key: 'traveler', x: -7, z: 146, color: '#ffffff',
    look: { jacket: 0x8a7a62, pants: 0x5a4e3e, shoulders: 0x6a5a44, hair: 0x2a1d14, spiky: false, band: false, hat: 0xb89a5a } },
];

// 村民的閒聊（都是實用的提示）
export const TIPS = [
  '敵人身上閃紅光就是要出手了，趕快用替身術閃開！',
  '查克拉不夠的時候，找個安全的地方聚集查克拉吧。',
  '在水面上奔跑很耗查克拉，別在河中央用光了。',
  '鈴屋的拉麵一碗下肚，什麼傷都好了。',
  '忍具店的鎖子甲可以減少受到的傷害，出遠門前買一件吧。',
  '首領塔前的任務板上有很多委託，完成了有報酬拿。',
  '聽說幽冥森林最深處，有一頭比牛還大的狼王……',
  '最近北方山區常有人看到一個白髮的忍者，總覺得不太對勁。',
  '升級後記得打開選單分配能力點。',
  '鎖定敵人之後再用替身術，會直接繞到對方背後喔。',
];

export class TownNpcs {
  constructor(scene) {
    this.list = NPCS.map(n => {
      const model = createCharacter(n.look);
      toonify(model.root);
      const tag = createNameplate(THEME.npcs[n.key], n.color);
      tag.position.y = 2.75;
      model.root.add(tag);
      // 頭上的「！」：有事要說時顯示
      const mark = createNameplate('！', '#ffd23a');
      mark.position.y = 3.2;
      mark.scale.set(1.6, 0.4, 1);
      mark.visible = false;
      model.root.add(mark);
      scene.add(model.root);
      const pos = new THREE.Vector3(n.x, getTerrainHeight(n.x, n.z), n.z);
      return { ...n, name: THEME.npcs[n.key], model, mark, pos, facing: Math.PI, time: Math.random() * 5 };
    });
  }

  get(key) { return this.list.find(n => n.key === key); }

  update(dt, player, hasNews) {
    for (const n of this.list) {
      n.time += dt;
      const d = n.pos.distanceTo(player.pos);
      // 玩家靠近時轉頭看向玩家
      const want = d < 8 ? Math.atan2(player.pos.x - n.pos.x, player.pos.z - n.pos.z) : n.key === 'leader' ? 0 : Math.PI;
      n.facing = lerpAngle(n.facing, want, 1 - Math.exp(-4 * dt));
      n.model.root.position.copy(n.pos);
      n.model.root.rotation.y = n.facing;
      n.mark.visible = hasNews(n.key);
      n.mark.position.y = 3.2 + Math.sin(n.time * 3) * 0.08;
      animateCharacter(n.model, { phase: 0, move: 0, time: n.time }, dt);
    }
  }
}

// 天守大人的對話：依劇情進度不同
export function leaderScript(quests, progress) {
  const name = THEME.player.name;
  const flags = progress.flags;
  const crow = quests.status('crow');
  if (!flags.metLeader) {
    flags.metLeader = true;
    return {
      pages: [
        `你就是新任下忍${name}吧？我是${THEME.areas.village.name}的天守。`,
        '最近村子周圍不太平靜：森林裡的狼群變多了，南方道路也出現了山賊。',
        '到我身旁的任務板接任務，一步一步磨練自己吧。完成之後回來任務板回報就可以領報酬。',
      ],
    };
  }
  if (crow === 'complete') {
    return {
      pages: [
        `${name}……你真的打倒了黑鴉，取回了禁術卷軸！`,
        `${THEME.areas.village.name}以你為榮。這枚鴉羽護符是黑鴉身上的東西，就由你保管吧。`,
      ],
      turnIn: 'crow',
    };
  }
  if (crow === 'active') {
    return { pages: ['黑鴉就躲在北方山區。他會用火遁和分身術，千萬小心。', '打不過就先撤退，到鈴屋吃碗拉麵再來。'] };
  }
  if (crow === 'available') {
    return {
      pages: [
        '你查到的情報證實了我的擔心。',
        `那些流浪忍者的首領，是一個叫「${THEME.enemies.crow}」的叛忍。他偷走了村子的禁術卷軸，躲在北方山區。`,
        '這是 A 級任務，非常危險。你願意接下嗎？',
      ],
      offer: 'crow',
    };
  }
  if (quests.isDone('crow')) {
    return { pages: ['卷軸回來之後，村子終於恢復平靜了。', '不過忍者的修行沒有終點，繼續加油吧。'] };
  }
  if (progress.level < 10 && quests.isDone('rogues')) {
    return { pages: ['流浪忍者背後似乎有人在指揮……等你成為上忍（Lv.10），我再告訴你詳情。'] };
  }
  return { pages: ['任務辦得還順利嗎？', '別逞強，打不過就先回村子補給。'] };
}

export function travelerScript(quests) {
  if (quests.isActive('delivery') && !quests.isComplete('delivery')) {
    return { pages: ['咦？這是鈴屋的拉麵？太感謝了！', '走了一整天，終於可以填飽肚子了。替我謝謝老闆！'], talk: 'traveler' };
  }
  return { pages: ['南方的山賊越來越猖狂了，我都不敢再往前走。', '你是風鈴之里的忍者吧？拜託想想辦法。'] };
}
