#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
uniform mat4 uModelView;
uniform mat4 uProjection;
out vec2 vUV;
out vec3 vViewPosition;
void main() {
  vUV = aUV;
  vec4 position = uModelView * vec4(aPosition, 1.0);
  vViewPosition = position.xyz;
  gl_Position = uProjection * position;
}
