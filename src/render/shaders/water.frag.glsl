#version 300 es
precision highp float;
// FIELD_SAMPLER
in vec2 vUV;
in vec3 vViewPosition;
uniform sampler2D uWaterMask;
uniform vec2 uSizeMeters;
uniform vec2 uWorldOffset;
uniform vec4 uVelocityUV, uFootprintUV;
uniform float uFade;
uniform float uTime;
uniform float uMagnitudeMax;
uniform vec4 uWaves; // large scale, fine scale, large strength, fine strength
uniform vec3 uAdvection; // speed, large period, fine period
uniform vec4 uWaterColor;
uniform vec2 uHighlights; // Fresnel, specular
uniform float uBrightness;
uniform vec3 uEastView, uNorthView, uUpView;
uniform vec3 uLightView, uDiffuse, uAmbient;
layout(location=0) out vec4 fragColor;

// Hash-based gradient noise with analytic derivative: no bitmap dependency.
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 gradient(vec2 cell) {
  float angle = hash(cell) * 6.28318530718;
  return vec2(cos(angle), sin(angle));
}
vec2 noiseGradient(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 s = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 ds = 30.0*f*f*(f*(f-2.0)+1.0);
  vec2 ga = gradient(cell), gb = gradient(cell+vec2(1,0));
  vec2 gc = gradient(cell+vec2(0,1)), gd = gradient(cell+vec2(1,1));
  float a = dot(ga,f), b = dot(gb,f-vec2(1,0));
  float c = dot(gc,f-vec2(0,1)), d = dot(gd,f-vec2(1,1));
  return mix(mix(ga,gb,s.x),mix(gc,gd,s.x),s.y)
    + vec2(mix(b-a,d-c,s.y), mix(c-a,d-b,s.x))*ds;
}
vec2 structure(vec2 p, vec2 direction) {
  // Short convolution along current elongates world-anchored detail. Rotating
  // global UVs by a varying angle would introduce phase seams near the island.
  vec2 g = 0.5*noiseGradient(p)
    + 0.25*noiseGradient(p+direction*0.65)
    + 0.25*noiseGradient(p-direction*0.65);
  return g - direction * dot(g, direction) * 0.35;
}
vec2 flowingSlope(vec2 p, vec2 velocity, vec2 direction, float scale,
                  float period, float speedFactor, vec2 seed) {
  float phaseA = fract(uTime / period);
  float phaseB = fract(uTime / period + 0.5);
  // The resetting phase has zero weight AND zero weight derivative. Displacement
  // is bounded to one period; these are samples of surface structure, not particles.
  float weightA = sin(3.14159265359 * phaseA);
  weightA *= weightA;
  vec2 travel = velocity * uAdvection.x * speedFactor * period;
  vec2 a = structure((p - travel * phaseA) / scale + seed, direction);
  vec2 b = structure((p - travel * phaseB) / scale + seed, direction);
  float footprint = max(length(dFdx(p / scale)), length(dFdy(p / scale)));
  float antialias = 1.0 - smoothstep(0.35, 1.1, footprint);
  return mix(b, a, weightA) * antialias;
}

void main() {
  vec2 footprintUV = uFootprintUV.xy + vUV*uFootprintUV.zw;
  float wet = texture(uWaterMask, vec2(footprintUV.x, 1.0-footprintUV.y)).r;
  if (wet < 0.01) discard; // Footprint comes ONLY from polygon geometry.
  vec2 velocityUV = uVelocityUV.xy + vUV*uVelocityUV.zw;
  vec4 local = fieldAt(velocityUV);
  // Near a NoData boundary fade current to calm across about one source pixel.
  // Invalid pixels stay calm; they are not holes and get no invented fast current.
  vec2 pixel = 1.0 / vec2(textureSize(uVelocity, 0));
  vec2 rasterUV = vec2(velocityUV.x, 1.0-velocityUV.y);
  float confidence = 0.25 * (
    texture(uVelocity, rasterUV + vec2(pixel.x,0)).a +
    texture(uVelocity, rasterUV - vec2(pixel.x,0)).a +
    texture(uVelocity, rasterUV + vec2(0,pixel.y)).a +
    texture(uVelocity, rasterUV - vec2(0,pixel.y)).a);
  vec2 velocity = local.rg * local.a * confidence;
  float speed = length(velocity);
  vec2 direction = speed > 0.001 ? velocity / speed : vec2(0,1);
  vec2 p = uWorldOffset + vUV*uSizeMeters;
  float activity = smoothstep(0.0, uMagnitudeMax, speed);
  vec2 large = flowingSlope(p, velocity, direction, uWaves.x,
    uAdvection.y, 1.0, vec2(13.7, 31.3));
  vec2 fine = flowingSlope(p, velocity, direction, uWaves.y,
    uAdvection.z, 1.13, vec2(71.1, 9.2));
  vec2 slope = (large*uWaves.z + fine*uWaves.w) * mix(0.45,1.0,activity);
  vec3 N = normalize(uUpView - slope.x*uEastView - slope.y*uNorthView);
  vec3 V = normalize(-vViewPosition);
  vec3 L = normalize(uLightView);
  vec3 H = normalize(L+V);
  float ndv = max(dot(N,V),0.0), ndl = max(dot(N,L),0.0);
  float fresnel = 0.02 + 0.98*pow(1.0-ndv,5.0);
  // Modest analytic sky tint, no environment-map or screen-space reflection.
  vec3 body = uWaterColor.rgb * (0.55 + 0.45*ndl) *
    clamp(uAmbient + uDiffuse*0.65, vec3(0.65), vec3(1.35));
  vec3 skyTint = vec3(0.32,0.38,0.41);
  vec3 color = mix(body, skyTint, min(fresnel*uHighlights.x, 0.95));
  float exponent = mix(100.0,48.0,activity);
  float specular = pow(max(dot(N,H),0.0),exponent) * ndl;
  color += uDiffuse * specular * uHighlights.y * (0.25+0.75*fresnel);
  // Final exposure scales the complete shaded result, not just its base color.
  // A smooth shoulder above 0.8 preserves highlight variation at high settings.
  color *= uBrightness;
  color = min(color, vec3(0.8)) + 0.2 * (1.0-exp(-max(color-0.8,vec3(0.0))/0.2));
  fragColor = vec4(color, uWaterColor.a*wet*uFade);
}
