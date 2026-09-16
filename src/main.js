import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { DEFAULTS, PRESETS, readUrl, writeUrl } from "./settings.js";
import { buildWaves, packWaves, sampleSurface } from "./waves.js";
import { createOcean } from "./ocean.js";
import { createSky } from "./sky.js";
import { createPillar } from "./pillar.js";
import { createBoat } from "./boat.js";
import { createMotes } from "./motes.js";

/* Nightsail — open water, a light standing on it, and a boat going past.
 *
 * Nothing in here is loaded from disk. The sea, the sky, the hull, the sail and the motes in the air
 * are all generated at start-up from the numbers in the panel, which is what makes every one of them
 * a slider rather than a decision baked into an asset. */

const settings = { ...DEFAULTS, ...readUrl() };

const canvas = document.getElementById("stage");
let renderer;

try
{
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch(error)
{
    document.getElementById("fallback").hidden = false;
    throw error;
}

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = settings.exposure;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(42, 7, 52);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 9, 0);
controls.minDistance = 6;
controls.maxDistance = 140;
/* Below the surface there is nothing to see and the water turns inside out, so the camera stays above it. */
controls.maxPolarAngle = Math.PI * 0.495;

/* ── the pieces ─────────────────────────────────────────────────────────── */

const sky = createSky(settings);
scene.add(sky.mesh);

const ocean = createOcean({ settings });
scene.add(ocean.mesh);

const pillar = createPillar(settings);
scene.add(pillar.group);

const boat = createBoat(settings);
scene.add(boat.group);

const motes = createMotes(settings);
scene.add(motes.points);

/* Two lights, both cheap: the column itself, and a dim wash from the sky so the unlit side of the
   hull is not pure black. */
const pillarLight = new THREE.PointLight(settings.pillarColor, 120, 400, 1.2);
pillarLight.position.set(0, 6, 0);
scene.add(pillarLight);

const skyLight = new THREE.HemisphereLight(settings.horizon, settings.deep, 1.4);
scene.add(skyLight);

let waves = [];

function applyWaves()
{
    waves = buildWaves({
        wind: settings.wind,
        wavelength: settings.wavelength,
        amplitude: settings.amplitude,
        steepness: settings.steepness,
        spread: settings.spread,
        speed: settings.waveSpeed,
    });

    const packed = packWaves(waves);
    ocean.uniforms.uWaveA.value = packed.a;
    ocean.uniforms.uWaveB.value = packed.b;
}

function applyColors()
{
    ocean.uniforms.uDeep.value.set(settings.deep);
    ocean.uniforms.uShallow.value.set(settings.shallow);
    ocean.uniforms.uFoam.value.set(settings.foam);
    ocean.uniforms.uSkyLow.value.set(settings.horizon);
    ocean.uniforms.uSkyTop.value.set(settings.skyTop);
    ocean.uniforms.uFogColor.value.set(settings.horizon);
    ocean.uniforms.uPillarColor.value.set(settings.pillarColor);
    ocean.uniforms.uFoamAmount.value = settings.foamAmount;
    ocean.uniforms.uGlossiness.value = settings.glossiness;
    ocean.uniforms.uReflection.value = settings.reflection;
    ocean.uniforms.uFogDensity.value = settings.fogDensity;
    ocean.uniforms.uPillarGlow.value = settings.pillarGlow;
    ocean.uniforms.uPillarReach.value = settings.pillarReach;

    sky.uniforms.uTop.value.set(settings.skyTop);
    sky.uniforms.uHorizon.value.set(settings.horizon);
    sky.uniforms.uGlowColor.value.set(settings.pillarColor);
    sky.uniforms.uGlow.value = settings.pillarGlow;
    sky.uniforms.uStars.value = settings.stars;

    pillar.setColor(settings.pillarColor);
    boat.setColors();

    motes.uniforms.uColor.value.set(settings.moteColor);
    motes.uniforms.uOpacity.value = settings.moteOpacity;
    motes.uniforms.uSize.value = settings.moteSize;
    motes.uniforms.uDrift.value = settings.moteDrift;

    pillarLight.color.set(settings.pillarColor);
    skyLight.color.set(settings.horizon);
    skyLight.groundColor.set(settings.deep);

    renderer.toneMappingExposure = settings.exposure;
    controls.autoRotate = settings.autoOrbit;
    controls.autoRotateSpeed = settings.orbitSpeed;
    document.body.style.background = settings.skyTop;
}

function resize()
{
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();

    motes.uniforms.uScreenScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}

addEventListener("resize", resize);

/* ── the panel ──────────────────────────────────────────────────────────── */

const gui = new GUI({ title: "Nightsail", width: 310 });
const apply = () => { applyColors(); writeUrl(settings); };
const applyAll = () => { applyWaves(); applyColors(); writeUrl(settings); };

const sea = gui.addFolder("Sea");
sea.add(settings, "amplitude", 0.05, 2, 0.01).name("swell height").onChange(applyAll);
sea.add(settings, "wavelength", 4, 60, 0.5).name("wavelength").onChange(applyAll);
sea.add(settings, "steepness", 0, 1.6, 0.01).name("steepness").onChange(applyAll);
sea.add(settings, "waveSpeed", 0, 3, 0.01).name("speed").onChange(applyAll);
sea.add(settings, "wind", -3.14, 3.14, 0.01).name("wind direction").onChange(applyAll);
sea.add(settings, "spread", 0, 1.6, 0.01).name("wind spread").onChange(applyAll);
sea.addColor(settings, "deep").name("deep water").onChange(apply);
sea.addColor(settings, "shallow").name("crest water").onChange(apply);
sea.addColor(settings, "foam").name("foam").onChange(apply);
sea.add(settings, "foamAmount", 0, 1, 0.01).name("foam amount").onChange(apply);
sea.add(settings, "glossiness", 0, 1, 0.01).name("glossiness").onChange(apply);
sea.add(settings, "reflection", 0, 1.5, 0.01).name("sky reflection").onChange(apply);

const air = gui.addFolder("Sky and air");
air.addColor(settings, "skyTop").name("zenith").onChange(apply);
air.addColor(settings, "horizon").name("horizon").onChange(apply);
air.add(settings, "stars", 0, 1.5, 0.01).name("stars").onChange(apply);
air.add(settings, "fogDensity", 0, 0.06, 0.001).name("haze").onChange(apply);
air.add(settings, "moteCount", 0, 6000, 50).name("motes").onFinishChange(() => { motes.build(Math.round(settings.moteCount)); apply(); });
air.add(settings, "moteSize", 0.01, 0.3, 0.005).name("mote size").onChange(apply);
air.add(settings, "moteDrift", 0, 6, 0.05).name("mote drift").onChange(apply);
air.addColor(settings, "moteColor").name("mote colour").onChange(apply);
air.add(settings, "moteOpacity", 0, 1, 0.01).name("mote opacity").onChange(apply);

const light = gui.addFolder("The light");
light.addColor(settings, "pillarColor").name("colour").onChange(apply);
light.add(settings, "pillarHeight", 5, 120, 1).name("height").onChange(apply);
light.add(settings, "pillarRadius", 0.2, 8, 0.05).name("radius").onChange(apply);
light.add(settings, "pillarIntensity", 0, 4, 0.01).name("intensity").onChange(apply);
light.add(settings, "pillarGlow", 0, 2, 0.01).name("spill on water").onChange(apply);
light.add(settings, "pillarReach", 3, 80, 0.5).name("spill reach").onChange(apply);
light.add(settings, "pillarPulse", 0, 1, 0.01).name("pulse").onChange(apply);

const vessel = gui.addFolder("Boat");
vessel.add(settings, "boatSpeed", -0.3, 0.3, 0.005).name("speed").onChange(apply);
vessel.add(settings, "pathRadius", 6, 80, 0.5).name("distance from light").onChange(apply);
vessel.add(settings, "length", 2, 14, 0.1).name("length").onChange(rebuildBoat);
vessel.add(settings, "beam", 0.6, 5, 0.05).name("beam").onChange(rebuildBoat);
vessel.add(settings, "draft", 0.2, 2.5, 0.05).name("draft").onChange(rebuildBoat);
vessel.add(settings, "sheer", 0, 2, 0.05).name("sheer").onChange(rebuildBoat);
vessel.add(settings, "mastHeight", 0, 12, 0.1).name("mast").onChange(() => { boat.layout(); apply(); });
vessel.add(settings, "sailSize", 0, 6, 0.1).name("sail").onChange(() => { boat.layout(); apply(); });
vessel.addColor(settings, "hullColor").name("hull").onChange(apply);
vessel.addColor(settings, "sailColor").name("sail colour").onChange(apply);
vessel.addColor(settings, "lanternColor").name("lantern").onChange(apply);
vessel.add(settings, "lanternGlow", 0, 6, 0.05).name("lantern glow").onChange(() => { boat.layout(); apply(); });

const view = gui.addFolder("View");
view.add(settings, "exposure", 0.2, 3, 0.01).name("exposure").onChange(apply);
view.add(settings, "autoOrbit").name("orbit by itself").onChange(apply);
view.add(settings, "orbitSpeed", -1.5, 1.5, 0.01).name("orbit speed").onChange(apply);
view.add(settings, "paused").name("freeze time").onChange(apply).listen();

const actions = {
    preset: "night",
    copyLink: async () =>
    {
        writeUrl(settings);
        try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
        catch { toast("Copy failed, the address bar has it"); }
    },
    copySettings: async () =>
    {
        try { await navigator.clipboard.writeText(JSON.stringify(settings, null, 2)); toast("Settings copied"); }
        catch { toast("Copy failed"); }
    },
    reset: () => load(DEFAULTS),
};

gui.add(actions, "preset", Object.keys(PRESETS)).name("preset").onChange((key) => load({ ...DEFAULTS, ...PRESETS[key] }));
gui.add(actions, "copyLink").name("copy link to this night");
gui.add(actions, "copySettings").name("copy settings as JSON");
gui.add(actions, "reset").name("reset");

function rebuildBoat()
{
    boat.rebuild();
    apply();
}

function load(next)
{
    const motesChanged = next.moteCount !== settings.moteCount;

    Object.assign(settings, next);
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());

    if(motesChanged) motes.build(Math.round(settings.moteCount));

    boat.rebuild();
    applyAll();
}

/* ── toast, stats, keys ─────────────────────────────────────────────────── */

const note = document.createElement("p");
note.className = "toast";
document.body.appendChild(note);
let noteTimer = 0;

function toast(text)
{
    note.textContent = text;
    note.classList.add("is-on");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => note.classList.remove("is-on"), 1600);
}

const stats = document.createElement("p");
stats.className = "stats";
document.body.appendChild(stats);

addEventListener("keydown", (event) =>
{
    if(event.key === "h" || event.key === "H") gui.show(gui._hidden);
    if(event.code === "Space")
    {
        event.preventDefault();
        settings.paused = !settings.paused;
        writeUrl(settings);
    }
});

/* ── the loop ───────────────────────────────────────────────────────────── */

const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);
const normal = new THREE.Vector3();
const tilt = new THREE.Quaternion();
const heading = new THREE.Quaternion();

let elapsed = 0;
let sailed = 0;
let frames = 0;
let fpsAt = performance.now();

function tick()
{
    requestAnimationFrame(tick);

    const delta = Math.min(clock.getDelta(), 0.1);

    if(!settings.paused)
    {
        elapsed += delta;
        sailed += delta * settings.boatSpeed;
    }

    ocean.uniforms.uWaveTime.value = elapsed;
    ocean.uniforms.uCamera.value.copy(camera.position);
    sky.uniforms.uTime.value = elapsed;
    motes.uniforms.uTime.value = elapsed;
    motes.uniforms.uCenter.value.copy(camera.position);

    /* The boat rides the same water the shader draws: position and slope come from the identical
       wave sum, evaluated on the CPU for this one point. */
    const x = Math.cos(sailed) * settings.pathRadius;
    const z = Math.sin(sailed) * settings.pathRadius;
    const surface = sampleSurface(waves, x, z, elapsed);

    boat.group.position.set(surface.x, surface.y, surface.z);

    normal.set(surface.nx, surface.ny, surface.nz);
    tilt.setFromUnitVectors(up, normal);
    heading.setFromAxisAngle(up, -sailed + Math.PI / 2);
    boat.group.quaternion.copy(tilt).multiply(heading);

    /* A light that never quite settles: the pulse is slow and shallow, enough to feel alive. */
    const pulse = 1 + Math.sin(elapsed * 1.3) * settings.pillarPulse * 0.5 + Math.sin(elapsed * 0.41) * settings.pillarPulse * 0.5;
    pillar.setIntensity(settings.pillarIntensity, pulse);
    pillar.layout(camera);
    pillarLight.intensity = 120 * settings.pillarIntensity * pulse;
    pillarLight.distance = settings.pillarReach * 12;

    ocean.uniforms.uPillarPosition.value.set(0, settings.pillarHeight * 0.12, 0);
    sky.uniforms.uGlowDirection.value.set(-camera.position.x, settings.pillarHeight * 0.3 - camera.position.y, -camera.position.z).normalize();

    controls.update();
    renderer.render(scene, camera);

    frames++;
    const now = performance.now();
    if(now - fpsAt > 500)
    {
        stats.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} fps`;
        frames = 0;
        fpsAt = now;
    }
}

globalThis.nightsail = { settings, scene, camera, renderer, controls, ocean, sky, pillar, boat, motes, load };

applyWaves();
applyColors();
resize();
tick();
