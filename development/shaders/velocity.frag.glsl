#version 300 es
precision highp float;
// FIELD_SAMPLER
in vec2 vUV;
uniform vec2 uSizeMeters;
uniform vec2 uWorldOffset;
uniform vec4 uVelocityUV;
uniform float uFade;
uniform float uTime;
uniform float uSpeedScale;
uniform float uMagnitudeMax;
layout(location=0) out vec4 fragColor;
void main() {
  vec4 local = fieldAt(uVelocityUV.xy+vUV*uVelocityUV.zw);
  if (local.a < 0.5) discard;
  // A weak continuous tint demonstrates per-fragment (not just grid) sampling.
  vec3 tint = mix(vec3(0.05,0.8,1.0), vec3(1.0,0.45,0.03),
    clamp(local.b / uMagnitudeMax, 0.0, 1.0));
  vec2 p = uWorldOffset + vUV*uSizeMeters;
  const float spacing = 24.0;
  vec2 center = (floor(p / spacing) + 0.5) * spacing;
  vec4 cell = fieldAt(uVelocityUV.xy+(center-uWorldOffset)/uSizeMeters*uVelocityUV.zw);
  float speed = length(cell.rg);
  float arrow = 0.0, bead = 0.0;
  if (cell.a > 0.5 && speed > 0.0001) {
    vec2 direction = cell.rg / speed;
    vec2 delta = p - center;
    float along = dot(delta, direction);
    float across = dot(delta, vec2(-direction.y, direction.x));
    // Static arrowhead makes signed direction unambiguous; bead moves -8 -> +8.
    float body = step(abs(across), 0.55) * step(-8.0, along) * step(along, 6.0);
    float head = step(abs(across), (10.0-along)*0.7) * step(5.0, along) * step(along,10.0);
    arrow = max(body, head);
    float moving = mod(uTime * speed * uSpeedScale, 16.0) - 8.0;
    bead = 1.0 - smoothstep(1.0, 1.9, length(vec2(along-moving, across)));
  }
  float ink = max(arrow * 0.6, bead);
  fragColor = vec4(mix(tint, vec3(1.0), bead), mix(0.10, 0.95, ink)*uFade);
}
