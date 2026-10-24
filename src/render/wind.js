// 風：讓草、樹葉在頂點著色器裡擺動。所有材質共用同一個時間 uniform。
export const sharedTime = { value: 0 };

// mode 'tip'：用 aTip 屬性（0 根部 → 1 尖端）決定擺幅，適合草
// mode 'canopy'：用模型本身的高度決定擺幅，適合樹冠、灌木
export function addWind(material, { strength = 0.2, mode = 'tip' } = {}) {
  const weight = mode === 'tip' ? 'aTip * aTip' : 'clamp(position.y * 0.5 + 0.5, 0.0, 1.0)';
  material.onBeforeCompile = shader => {
    shader.uniforms.uTime = sharedTime;
    shader.vertexShader = `uniform float uTime;\n${mode === 'tip' ? 'attribute float aTip;\n' : ''}${shader.vertexShader}`
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windBase = instanceMatrix[3].xyz;
        #else
          vec3 windBase = vec3(0.0);
        #endif
        float windW = ${weight};
        float windS = sin(uTime * 1.7 + windBase.x * 0.21 + windBase.z * 0.17) + 0.4 * sin(uTime * 3.3 + windBase.x * 0.7);
        transformed.x += windS * windW * ${strength.toFixed(3)};
        transformed.z += windS * windW * ${(strength * 0.5).toFixed(3)};`);
  };
  material.customProgramCacheKey = () => `wind-${mode}-${strength}`;
  return material;
}
