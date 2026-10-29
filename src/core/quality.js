// 畫質設定：存在瀏覽器裡，切換時重新載入頁面套用
export const QUALITY_PRESETS = {
  low: { label: '低', pixelRatio: 1, shadows: false, shadowSize: 0, samples: 0, bloom: false, fogFar: 420, grassRadius: 24, grassDensity: 1.5, rainDrops: 400 },
  medium: { label: '中', pixelRatio: 1.5, shadows: true, shadowSize: 1024, samples: 2, bloom: false, fogFar: 560, grassRadius: 40, grassDensity: 3, rainDrops: 900 },
  high: { label: '高', pixelRatio: 2, shadows: true, shadowSize: 2048, samples: 4, bloom: true, fogFar: 680, grassRadius: 56, grassDensity: 5, rainDrops: 1600 },
};

const STORAGE_KEY = 'ninja-road.quality';

export function loadQuality(isTouch) {
  let key = null;
  try { key = localStorage.getItem(STORAGE_KEY); } catch { /* 無法存取儲存空間時用預設值 */ }
  if (!QUALITY_PRESETS[key]) key = isTouch ? 'medium' : 'high';
  return { key, ...QUALITY_PRESETS[key] };
}

export function saveQuality(key) {
  try { localStorage.setItem(STORAGE_KEY, key); } catch { /* 忽略 */ }
}
