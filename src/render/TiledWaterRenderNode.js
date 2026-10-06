import RenderNode from '@arcgis/core/views/3d/webgl/RenderNode.js';
import vertexSource from './shaders/velocity.vert.glsl?raw';
import waterSource from './shaders/water.frag.glsl?raw';
import fieldSource from './shaders/field.glsl?raw';
import { program } from './gpu.js';
import { waterColor } from '../water/parameters.js';

const uniformNames=['uModelView','uProjection','uVelocity','uSizeMeters','uWorldOffset','uTime',
  'uSpeedScale','uMagnitudeMax','uWaterMask','uVelocityUV','uFootprintUV','uFade','uWaves','uAdvection',
  'uWaterColor','uHighlights','uBrightness','uEastView','uNorthView','uUpView','uLightView','uDiffuse','uAmbient'];

export default RenderNode.createSubclass({
  declaredClass:'TiledWaterRenderNode',
  consumes:{required:['composite-color']},produces:'composite-color',
  records:null,waterParameters:null,magnitudeReference:1,basis:null,onError:null,
  onInitialized:null,onUpdate:null,onTileError:null,
  enabled:true,paused:false,
  initialize(){
    this._programs=null;this._active=[];this._deletions=[];this._gl=null;
    this._modelView=new Float32Array(16);this._projection=new Float32Array(16);this._color=new Float32Array(3);
    this._time=0;this._lastFrame=performance.now();
    this.diagnostics={frames:0,textureUploads:0,waterMaskUploads:0,gpuSamples:[],failed:null,
      drawCalls:0,drawCallsLastFrame:0,cpuSubmissionMs:0,gpuBytes:0,disposedTiles:0,shaderCompilations:0};
  },
  setModeEnabled(value){this.enabled=value;this.requestRender();},
  setPaused(value){this.paused=value;this.requestRender();},
  setActiveTiles(records){this._active=records;this.requestRender();},
  evictTile(record){if(record.gpu)this._deletions.push(record);this.requestRender();},
  setup(gl){
    this._programs={};
    for(const [key,source] of [['water',waterSource]]) {
      const p=program(gl,vertexSource,source.replace('// FIELD_SAMPLER',fieldSource));
      this.diagnostics.shaderCompilations++;
      this._programs[key]={program:p,uniforms:Object.fromEntries(uniformNames.map(n=>[n,gl.getUniformLocation(p,n)]))};
    }
  },
  deleteTile(gl,record){
    const r=record.gpu;if(!r)return;
    gl.deleteTexture(r.texture);gl.deleteTexture(r.mask);gl.deleteBuffer(r.vertices);
    gl.deleteBuffer(r.indices);gl.deleteVertexArray(r.vao);
    this.diagnostics.gpuBytes-=record.bytes;this.diagnostics.disposedTiles++;record.gpu=null;
  },
  upload(gl,record){
    const {field,waterFootprint:mask,surface}=record.data;
    const r=record.gpu={vao:gl.createVertexArray(),vertices:gl.createBuffer(),indices:gl.createBuffer(),
      texture:gl.createTexture(),mask:gl.createTexture()};
    this.diagnostics.gpuBytes+=record.bytes;
    try {
      gl.bindVertexArray(r.vao);gl.bindBuffer(gl.ARRAY_BUFFER,r.vertices);
      gl.bufferData(gl.ARRAY_BUFFER,surface.vertices,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,r.indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,surface.indices,gl.STATIC_DRAW);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      for(const [unit,texture,data,float] of [[0,r.texture,field,true],[1,r.mask,mask,false]]) {
        gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,float?gl.NEAREST:gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,float?gl.NEAREST:gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,float?gl.RGBA32F:gl.R8,data.width,data.height,0,
          float?gl.RGBA:gl.RED,float?gl.FLOAT:gl.UNSIGNED_BYTE,data.pixels);
      }
      this.diagnostics.textureUploads++;this.diagnostics.waterMaskUploads++;
      const error=gl.getError();if(error!==gl.NO_ERROR)throw new Error(`Water tile GPU error ${error}`);
      record.uploads=(record.uploads??0)+1;
    }catch(error){
      this.deleteTile(gl,record);record.state='error';record.error=error.message;
      record.retryAt=performance.now()+2000*2**record.attempts;
      throw error;
    }
  },
  commonUniforms(gl,u,camera){
    const w=this.waterParameters,m=camera.viewMatrix,sun=this.sunLight;
    this._projection.set(camera.projectionMatrix);
    gl.uniformMatrix4fv(u.uProjection,false,this._projection);
    gl.uniform1i(u.uVelocity,0);gl.uniform1i(u.uWaterMask,1);
    gl.uniform1f(u.uTime,this._time);gl.uniform1f(u.uSpeedScale,0.45);
    gl.uniform1f(u.uMagnitudeMax,this.magnitudeReference);
    gl.uniform4f(u.uWaves,w.largeWaveScale,w.fineWaveScale,w.largeWaveStrength,w.fineWaveStrength);
    gl.uniform3f(u.uAdvection,w.animationSpeed*w.flowSpeedMultiplier,w.largePeriod,w.finePeriod);
    waterColor(w.colorPosition,this._color);
    gl.uniform4f(u.uWaterColor,...this._color,w.alpha);
    gl.uniform2f(u.uHighlights,w.fresnelStrength*w.reflection,w.specularStrength*w.reflection);
    gl.uniform1f(u.uBrightness,w.brightness);
    for(let i=0;i<3;i++) {
      const b=this.basis[i],location=i===0?u.uEastView:i===1?u.uNorthView:u.uUpView;
      gl.uniform3f(location,m[0]*b[0]+m[4]*b[1]+m[8]*b[2],
        m[1]*b[0]+m[5]*b[1]+m[9]*b[2],m[2]*b[0]+m[6]*b[1]+m[10]*b[2]);
    }
    const d=sun.direction;
    gl.uniform3f(u.uLightView,m[0]*d[0]+m[4]*d[1]+m[8]*d[2],
      m[1]*d[0]+m[5]*d[1]+m[9]*d[2],m[2]*d[0]+m[6]*d[1]+m[10]*d[2]);
    const dc=sun.diffuse.color,di=sun.diffuse.intensity,ac=sun.ambient.color,ai=sun.ambient.intensity;
    gl.uniform3f(u.uDiffuse,dc[0]*di,dc[1]*di,dc[2]*di);
    gl.uniform3f(u.uAmbient,ac[0]*ai,ac[1]*ai,ac[2]*ai);
  },
  render(){
    this.resetWebGLState();const output=this.bindRenderTarget(),gl=this.gl,now=performance.now();this._gl=gl;
    if(!this.paused&&this.enabled)this._time+=Math.min((now-this._lastFrame)/1000,0.1);
    this._lastFrame=now;
    try {
      for(const r of this._deletions)this.deleteTile(gl,r);this._deletions.length=0;
      if(!this.enabled||this.diagnostics.failed)return output;
      if(!this._programs||!gl.isProgram(this._programs.water.program)) {
        for(const r of this.records.values())if(r.gpu)this.deleteTile(gl,r);
        this.setup(gl);
        this.onInitialized?.();
      }
      // Upload at most one newly ready tile per frame; none in steady-state frames.
      let pendingUploads=false,uploaded=false;
      for(const r of this.records.values())if(r.required&&r.state==='ready'&&!r.data.empty&&!r.gpu) {
        if(uploaded){pendingUploads=true;break;}
        try{this.upload(gl,r);}catch(error){this.onTileError?.(error,r.id);}
        uploaded=true;
      }
      const p=this._programs.water,u=p.uniforms,camera=this.camera;
      gl.viewport(...camera.viewport);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);
      gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.useProgram(p.program);this.commonUniforms(gl,u,camera);
      let draws=0,fading=false;
      for(const record of this._active) {
        if(record.state!=='ready'||!record.gpu)continue;
        const tile=record.data,r=record.gpu,m=camera.viewMatrix,origin=tile.surface.origin;
        this._modelView.set(m);
        for(let row=0;row<4;row++)this._modelView[12+row]=m[row]*origin[0]+m[4+row]*origin[1]+m[8+row]*origin[2]+m[12+row];
        gl.uniformMatrix4fv(u.uModelView,false,this._modelView);
        gl.uniform2f(u.uSizeMeters,...tile.sizeMeters);gl.uniform2f(u.uWorldOffset,...tile.worldOffset);
        gl.uniform4f(u.uVelocityUV,...tile.field.uv);gl.uniform4f(u.uFootprintUV,...tile.waterFootprint.uv);
        const fade=Math.min(1,(now-record.readyAt)/450);fading ||= fade<1;gl.uniform1f(u.uFade,fade);
        gl.bindVertexArray(r.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,r.texture);
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,r.mask);
        gl.drawElements(gl.TRIANGLES,tile.surface.indices.length,gl.UNSIGNED_SHORT,0);draws++;
        record.lastRenderedFrame=this.diagnostics.frames;
      }
      this.diagnostics.frames++;this.diagnostics.time=this._time;
      this.diagnostics.drawCalls+=draws;this.diagnostics.drawCallsLastFrame=draws;
      this.diagnostics.cpuSubmissionMs+=performance.now()-now;
      if(uploaded||(draws&&!this._hasDrawn)) {this._hasDrawn ||= draws>0;this.onUpdate?.();}
      if((!this.paused&&draws)||pendingUploads||fading)this.requestRender();
    }catch(error){this.diagnostics.failed=error.message;this.onError?.(error);}
    finally{gl.bindVertexArray(null);this.resetWebGLState();}
    return output;
  },
  destroy(){
    const gl=this._gl;
    if(gl) {
      for(const r of this._deletions)this.deleteTile(gl,r);
      for(const r of this.records.values())this.deleteTile(gl,r);
      if(this._programs)for(const p of Object.values(this._programs))gl.deleteProgram(p.program);
    }
    this.onError=null;this.onInitialized=null;this.onUpdate=null;this.onTileError=null;
    this._programs=null;this._active=[];this._deletions=[];
  },
});
