import fieldSource from '../src/render/shaders/field.glsl?raw';
import {program} from '../src/render/gpu.js';

// One-time GPU readback: the SAME GLSL fieldAt function as the visible shader.
// Runs inside render(), so it never interferes asynchronously with ArcGIS GL state.
export function auditTexture(gl, field) {
  const candidates = [];
  let dry = -1;
  for (let i = 0; i < field.width * field.height; i++) {
    if (field.pixels[i * 4 + 3]) candidates.push(i);
    else if (dry < 0) dry = i;
  }
  candidates.sort((a, b) => field.pixels[a * 4 + 2] - field.pixels[b * 4 + 2]);
  const selected = (candidates.length ? [0.1, 0.3, 0.5, 0.7, 0.9] : []).map((q) => candidates[Math.floor(q * (candidates.length - 1))]);
  if (dry >= 0) selected.push(dry);
  const uv = selected.flatMap((i) => [(i % field.width + 0.5) / field.width,
    1 - (Math.floor(i / field.width) + 0.5) / field.height]);
  // Also test arbitrary subpixel coordinates and out-of-extent handling.
  uv.push(0.51731, 0.43327, 0.67291, 0.62143, -0.1, 0.5);
  const count = uv.length / 2;
  const p = program(gl, `#version 300 es\nprecision highp float;
    layout(location=0) in vec2 aUV; out vec4 sampled;
    ${fieldSource}
    void main() { sampled=fieldAt(aUV); gl_Position=vec4(0,0,0,1); }`,
  '#version 300 es\nprecision highp float; out vec4 color; void main(){color=vec4(0);}', true);
  const vao = gl.createVertexArray(), input = gl.createBuffer(), output = gl.createBuffer();
  const feedback = gl.createTransformFeedback();
  try {
    gl.useProgram(p); gl.uniform1i(gl.getUniformLocation(p, 'uVelocity'), 0);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, input);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
    gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, count * 16, gl.STREAM_READ);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, count); gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    const values = new Float32Array(count * 4);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
    return Array.from({ length: count }, (_, i) => ({
      uv: uv.slice(i * 2, i * 2 + 2), gpu: Array.from(values.subarray(i * 4, i * 4 + 4)),
      sourcePixel: selected[i] ?? null,
      expectedAtPixelCenter: i < selected.length
        ? Array.from(field.pixels.subarray(selected[i] * 4, selected[i] * 4 + 4)) : null,
    }));
  } finally {
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindVertexArray(null);
    gl.deleteTransformFeedback(feedback); gl.deleteBuffer(input); gl.deleteBuffer(output);
    gl.deleteVertexArray(vao); gl.deleteProgram(p);
  }
}


