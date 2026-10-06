import '@arcgis/core/assets/esri/themes/light/main.css';
import './style.css';
import WebScene from '@arcgis/core/WebScene.js';
import SceneView from '@arcgis/core/views/SceneView.js';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils.js';
import { pragueScenario } from './scenarios/prague.js';
import { startWater } from './water/startWater.js';

const status = document.querySelector('#status');
let active, generation = 0;
async function loadScenario(scenario) {
  const current = ++generation;
  active?.dispose();
  document.title = `${scenario.title} · Flow-driven water`;
  const abort = new AbortController(), failures = new Set();
  const scene = new WebScene({ portalItem: {
    id: scenario.webSceneItemId, portal: { url: scenario.portalUrl },
  }});
  const view = new SceneView({ container: 'app', map: scene });
  let water;
  function showError(label, error) {
    if (current !== generation || abort.signal.aborted) return;
    failures.add(`${label}: ${error?.message ?? String(error)}`);
    status.hidden = false; status.dataset.error = 'true';
    status.textContent = [...failures].join('\n');
    console.error(`[Flood scene] ${label}`, error?.message ?? error);
  }
  const layerHandle = view.on('layerview-create-error', ({layer,error}) => showError(layer.title,error));
  const fatalHandle = reactiveUtils.watch(() => view.fatalError, error => {
    if (error) showError('3D rendering failed; reload the page',error);
  });
  active = { dispose() {
    abort.abort(); water?.dispose(); layerHandle.remove(); fatalHandle.remove(); view.destroy();
  }};
  status.hidden = false; delete status.dataset.error; status.textContent = 'Loading flood scene…';
  if (import.meta.env.DEV) window.floodScene = {scene,view};
  try {
    await scene.load(); await view.when(); abort.signal.throwIfAborted();
    status.textContent = 'Validating water sources and starting streaming…';
    water = await startWater(view,scenario,abort.signal,error => showError('Water RenderNode failed',error));
    if (abort.signal.aborted) {water.dispose(); return;}
    if (!failures.size) status.hidden = true;
    return water;
  } catch (error) {
    if (error.name !== 'AbortError') showError('Unable to initialize the flood scene',error);
  }
}
loadScenario(pragueScenario);
if (import.meta.env.DEV) window.floodApp = {loadScenario,scenario:pragueScenario};
if (import.meta.hot) import.meta.hot.dispose(() => {
  generation++; active?.dispose(); delete window.floodApp; delete window.floodScene;
});
