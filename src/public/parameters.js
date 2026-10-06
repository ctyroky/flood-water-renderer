import {FloodWaterError} from './errors.js';
export const parameterDefaults=Object.freeze({flowSpeed:1,brightness:1,reflection:1,waterColor:.45,opacity:.96,paused:false});
const ranges={flowSpeed:[.25,5],brightness:[.5,2],reflection:[0,2],waterColor:[0,1],opacity:[0,1]};
export function mergeParameters(current,patch) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new FloodWaterError('INVALID_PARAMETER','Parameters must be an object');
  for(const [key,value] of Object.entries(patch)) {
    const range=Object.hasOwn(ranges,key)?ranges[key]:null;
    if(key==='paused'?typeof value!=='boolean':!range||!Number.isFinite(value)||value<range[0]||value>range[1]) {
      throw new FloodWaterError('INVALID_PARAMETER',`Invalid ${key}; expected ${key==='paused'?'boolean':range?range.join(' … '):'a documented parameter'}`);
    }
  }
  return {...current,...patch};
}
