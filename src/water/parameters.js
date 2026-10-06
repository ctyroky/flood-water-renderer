// Stage 3 tuning, in local metric coordinates. Speed is visual, NOT calibrated m/s.
// Copied per renderer instance; the public facade maps supported appearance controls.
export const waterParameters = {
  animationSpeed: 0.12,
  flowSpeedMultiplier: 1.0, // Visual multiplier of animationSpeed, not physical units.
  brightness: 1.0,
  reflection: 1.0,
  colorPosition: 0.45,
  largeWaveScale: 7.5,
  fineWaveScale: 1.15,
  largeWaveStrength: 0.50,
  fineWaveStrength: 0.20,
  largePeriod: 4.8,
  finePeriod: 3.7,
  baseColor: [0.25, 0.34, 0.30],
  alpha: 0.96,
  fresnelStrength: 0.55,
  specularStrength: 0.65,
};

export const waterColorStops = [
  {position:0,color:[0.12,0.29,0.35]},
  {position:0.45,color:waterParameters.baseColor},
  {position:1,color:[0.38,0.28,0.16]},
];
export function waterColor(value,out) {
  const t=Math.max(0,Math.min(1,value));
  const a=t<=0.45?waterColorStops[0]:waterColorStops[1],b=t<=0.45?waterColorStops[1]:waterColorStops[2];
  const f=(t-a.position)/(b.position-a.position);
  for(let i=0;i<3;i++)out[i]=a.color[i]+(b.color[i]-a.color[i])*f;
  return out;
}
