uniform highp sampler2D uVelocity;
// Input UV: SW=(0,0), NE=(1,1). Texture row 0 is the northern raster row.
// Manual bilinear filtering needs no float-linear extension and interpolates
// COMPONENTS, never angles. Reject a dry nearest cell; renormalize wet neighbors.
vec4 fieldAt(vec2 uv) {
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return vec4(0);
  ivec2 size = textureSize(uVelocity, 0);
  vec2 t = vec2(uv.x, 1.0 - uv.y) * vec2(size) - 0.5;
  ivec2 nearest = clamp(ivec2(floor(t + 0.5)), ivec2(0), size - 1);
  if (texelFetch(uVelocity, nearest, 0).a < 0.5) return vec4(0);
  ivec2 base = ivec2(floor(t));
  vec2 f = fract(t);
  vec4 a = texelFetch(uVelocity, clamp(base, ivec2(0), size - 1), 0);
  vec4 b = texelFetch(uVelocity, clamp(base + ivec2(1,0), ivec2(0), size - 1), 0);
  vec4 c = texelFetch(uVelocity, clamp(base + ivec2(0,1), ivec2(0), size - 1), 0);
  vec4 d = texelFetch(uVelocity, clamp(base + ivec2(1,1), ivec2(0), size - 1), 0);
  vec4 value = mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  return value.a > 0.00001 ? vec4(value.rgb / value.a, 1) : vec4(0);
}
