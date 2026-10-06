export const tileDefaults = Object.freeze({scheme:'geographic-512-v1',level:0,sizeMeters:512,
  velocitySize:384,velocityBorder:2,footprintSize:768,footprintBorder:2,meshCells:192});
export const streamingDefaults = Object.freeze({concurrency:2,maxRequired:36,maxEntries:96,
  maxBytes:160*1024*1024,idleMs:30000,preload:1,debounceMs:250});
