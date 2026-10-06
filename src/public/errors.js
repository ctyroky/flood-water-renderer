export class FloodWaterError extends Error {
  constructor(code,message,{cause,fatal=true,tileId}={}) {
    super(message,{cause});this.name='FloodWaterError';this.code=code;this.fatal=fatal;
    if(tileId!==undefined)this.tileId=tileId;
  }
}
export function waterError(error,code,message,extra={}) {
  if(error instanceof FloodWaterError)return error;
  return new FloodWaterError(code,message??error?.message??String(error),{cause:error,...extra});
}
export function aborted() {return new FloodWaterError('ABORTED','Water start was cancelled');}
export function abortable(promise,signal) {
  return new Promise((resolve,reject)=>{
    const cancel=()=>reject(aborted());
    if(signal.aborted){Promise.resolve(promise).catch(()=>{});cancel();return;}
    signal.addEventListener('abort',cancel,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));
  });
}
