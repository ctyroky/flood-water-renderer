export function program(gl, vertex, fragment, feedback) {
  const shaders = [];
  const result = gl.createProgram();
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
    }
    if (feedback) gl.transformFeedbackVaryings(result, ['sampled'], gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    return result;
  } catch (error) {
    gl.deleteProgram(result); throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}


