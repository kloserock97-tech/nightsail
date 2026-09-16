import * as THREE from "three/webgpu";
import { color, mix, uniform, viewportUV } from "three/tsl";
import GUI from "lil-gui";
import { createClock, smoothstep } from "./clock.js";
import { createSky } from "./sky.js";
import { createOcean } from "./ocean.js";
import { createLight, CORE } from "./light.js";
import { createSparks } from "./sparks.js";
import { createFlow } from "./flow.js";
import { createDebris } from "./debris.js";
import { createBubble } from "./bubble.js";
import { createBoat } from "./boat.js";
import { createPost } from "./post.js";
import { buildPanel } from "./panel.js";

/* Nightsail.
 *
 * The first screen is a bubble of points hanging in the dark. Scrolling sends it into the distance, where
 * it unwinds into threads and settles as the core of a column of light, while a night sea, a boat and a
 * figure assemble around it. Scroll back and it all comes apart again.
 *
 * The lighting is almost entirely fake, and that is the point: there is one light source at a known spot,
 * so every material brightens by "how much do I face the core" instead of asking a lighting system. */

const SEA_LEVEL = 3.6;
const SEA_SIZE = 300;
const BASE = import.meta.env.BASE_URL;

const canvas = document.getElementById("stage");
const clock = createClock();

const renderer = new THREE.WebGPURenderer({
    canvas,
    powerPreference: "high-performance",
    /* #webgl in the address forces the WebGL2 backend, the only way to check the fallback on a machine
       that has WebGPU. */
    forceWebGL: /webgl/i.test(location.hash),
    antialias: devicePixelRatio < 2,
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

try
{
    await renderer.init();
}
catch(error)
{
    document.getElementById("fallback").hidden = false;
    throw error;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(25, innerWidth / innerHeight, 0.1, 400);

/* The air: shared by the sea, the shards and the sky. */
const air = {
    skyTop: uniform(color("#030408")),
    skyBottom: uniform(color("#080b12")),
    fogNear: uniform(27),
    fogFar: uniform(89),
    fogColor: uniform(color("#04050a")),
    scatter: uniform(0.4),
    scatterRadius: uniform(16),
    mistColor: uniform(color("#aeb9c8")),
    mistRadius: uniform(46),
};

const sky = createSky(`${BASE}sky.hdr`);
const skyAmount = uniform(0);

/* The background is a mix, not a swap: replacing the node would recompile it. Before the sea assembles
   it is a dark corner-to-corner gradient; after, the rendered panorama. */
scene.backgroundNode = mix(mix(air.skyTop, air.skyBottom, viewportUV.length().smoothstep(0, 1)), sky.background(), skyAmount);

const light = createLight({ clock });
const ocean = createOcean({ size: SEA_SIZE, level: SEA_LEVEL, air, sky, clock, light });
const sparks = createSparks({ clock, light });
const flow = createFlow({ clock, light });
const debris = createDebris({ clock, air });
const bubble = createBubble({ clock, renderer, scene });
const boat = createBoat({ figureUrl: `${BASE}figure.glb` });

scene.add(ocean.mesh, light.group, sparks.mesh, flow.mesh, debris.mesh, boat.group);

/* The only real lights are for the boat and the figure: a weak steel moonlight from behind the column and
   the core itself, so the hull reads as a silhouette with a lit rim. */
const moon = new THREE.DirectionalLight("#8a96b8", 1.4);
moon.position.set(12, 50, 70);
const coreLight = new THREE.PointLight("#dfe8ff", 900, 0, 2);
coreLight.position.set(0, CORE, 0);
scene.add(moon, coreLight, new THREE.HemisphereLight("#1a2230", "#040608", 0.5));

const post = createPost({ renderer, scene, camera });

/* ── the frame ────────────────────────────────────────────────────────────── */

/* A wide shot from high and far back: the whole sea, the boat and the column fit at once. */
const view = {
    position: new THREE.Vector3(0, 34, -110),
    target: new THREE.Vector3(0, 8, 10),
    drift: 1,
};

sky.settings.rotation.value = -Math.atan2(-view.position.z, -view.position.x);

/* The flight. `target` is how far the visitor has scrolled, `progress` is where the bubble is; easing
   between them hides the steps of a mouse wheel. */
const intro = {
    target: 0,
    progress: 0,
    step: 0.04,
    ease: 0.05,
};

const frame = {
    distance: 12,     // how far in front of the camera the bubble hangs on the first screen
    radiusStart: 0.8,
    radiusEnd: 2.2,   // and how big it is once it has become the core
    focusShift: 0,
    opacity: 0.3,
};

const lens = { flare: 0.085, spread: 1, bandStart: 0.2 };

const titles = {
    hero: document.querySelector(".title-hero"),
    sea: document.querySelector(".title-sea"),
};

function advance(amount)
{
    intro.target = Math.min(1, Math.max(0, intro.target + amount));
    panel.sync();
}

addEventListener("wheel", (event) =>
{
    if(event.target.closest?.(".lil-gui")) return;
    event.preventDefault();
    advance(Math.sign(event.deltaY) * Math.min(1, Math.abs(event.deltaY) / 100) * intro.step);
}, { passive: false });

let touchY = 0;
addEventListener("touchstart", (event) => { touchY = event.touches[0].clientY; }, { passive: true });
addEventListener("touchmove", (event) =>
{
    if(event.target.closest?.(".lil-gui")) return;
    const y = event.touches[0].clientY;
    /* One swipe across the screen equals eight wheel clicks: the gesture is long, no need to slice it as fine. */
    advance(((touchY - y) / innerHeight) * intro.step * 8);
    touchY = y;
}, { passive: true });

const core = new THREE.Vector3(0, CORE, 0);
const look = new THREE.Vector3();
const bubblePoint = new THREE.Vector3();
const probe = new THREE.Vector3();

function updateCamera()
{
    const t = clock.elapsed;
    const d = view.drift;

    /* Slow drift on three sines that never line up. */
    camera.position.copy(view.position);
    camera.position.x += (Math.sin(t * 0.11) * 2.2 + Math.sin(t * 0.29) * 0.6) * d;
    camera.position.y += Math.sin(t * 0.17 + 1.3) * 1.1 * d;
    camera.position.z += Math.sin(t * 0.07 + 2.1) * 1.6 * d;

    look.copy(view.target);
    look.x += Math.sin(t * 0.13 + 0.7) * 1.4 * d;
    look.y += Math.sin(t * 0.23 + 2.6) * 0.7 * d;

    camera.lookAt(look);
    camera.updateMatrixWorld();
}

function updateIntro()
{
    intro.progress += (intro.target - intro.progress) * intro.ease;
    if(Math.abs(intro.target - intro.progress) < 1e-4) intro.progress = intro.target;

    const p = intro.progress;

    /* Position eases with a power: screen size falls as one over distance, so a linear flight would lurch
       at the start. Starting point is taken along the view direction, so the bubble breathes with the camera. */
    camera.getWorldDirection(probe);
    const start = camera.position.clone().addScaledVector(probe, frame.distance);
    bubblePoint.lerpVectors(start, core, Math.pow(p, 0.55));
    bubble.setPosition(bubblePoint);

    const s = bubble.settings;
    s.radius.value = frame.radiusStart + p * (frame.radiusEnd - frame.radiusStart);
    /* Focus rides with the bubble and sits in its middle: most points are near that plane, and they give
       the sharp grain. Move the plane to an edge and a hundred big soft discs merge into a white blot. */
    s.focus.value = camera.position.distanceTo(bubblePoint) + frame.focusShift * s.radius.value;
    s.dissolve.value = smoothstep(0.7, 1, p);
    s.opacity.value = frame.opacity * (1 - smoothstep(0.86, 1, p));
    bubble.setVisible(s.opacity.value > 0.001);

    /* The sea assembles only after the first turns of the wheel; the light rises with it, not after it. */
    const assembly = smoothstep(0.12, 0.92, p);
    const glow = smoothstep(0.22, 0.85, p);

    skyAmount.value = assembly;
    ocean.settings.appear.value = assembly;
    post.band.start.value = 0.5 + (lens.bandStart - 0.5) * assembly;

    for(const object of [light.group, sparks.mesh, flow.mesh, debris.mesh]) object.visible = glow > 0;
    boat.group.visible = glow > 0;
    ocean.mesh.visible = assembly > 0;

    light.beam.intensity.value = tuned.beam * glow;
    light.halo.intensity.value = tuned.halo * glow;
    air.scatter.value = tuned.scatter * glow;
    coreLight.intensity = 900 * glow;
    post.flare.intensity.value = lens.flare * glow;

    titles.hero.style.opacity = String(1 - smoothstep(0.04, 0.22, p));
    titles.sea.style.opacity = String(smoothstep(0.55, 0.9, p));
    document.documentElement.classList.toggle("is-sea", p > 0.5);
}

/* The panel edits the full-strength values; the intro scales them down on the way in. */
const tuned = { beam: 0.6, halo: 0, scatter: 0.4 };

function frameLoop()
{
    clock.tick();
    updateCamera();
    updateIntro();

    bubble.update();
    if(sparks.mesh.visible) sparks.update(camera);
    if(debris.mesh.visible) debris.update();

    boat.float(ocean, 0, 0, Math.PI * 0.06, clock.delta);
    if(boat.head) boat.head.rotation.x -= Math.sin(clock.elapsed * 0.4) * 0.04;

    light.face(camera);

    probe.copy(core).project(camera);
    post.flare.position.value.set(probe.x * 0.5 + 0.5, probe.y * 0.5 + 0.5);
    post.shapeFlare(lens.spread);

    post.pipeline.render();
    stats.tick();
}

/* ── the panel ────────────────────────────────────────────────────────────── */

const panel = buildPanel({
    gui: new GUI({ title: "Nightsail" }),
    clock, intro, frame, lens, view, tuned, air, sky, ocean, light, sparks, flow, debris, bubble, boat, post,
    replay()
    {
        intro.target = 0;
        intro.progress = 0;
    },
});

const stats = (() =>
{
    const element = document.querySelector(".stats");
    let frames = 0;
    let since = performance.now();

    return {
        tick()
        {
            frames++;
            const now = performance.now();
            if(now - since < 500) return;

            const backend = renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
            element.textContent = `${Math.round((frames * 1000) / (now - since))} fps · ${backend}`;
            frames = 0;
            since = now;
        },
    };
})();

addEventListener("resize", () =>
{
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.flare.aspect.value = innerWidth / innerHeight;
});
post.flare.aspect.value = innerWidth / innerHeight;

addEventListener("keydown", (event) =>
{
    if(event.target.closest?.("input, .lil-gui")) return;

    if(event.code === "ArrowDown" || event.code === "PageDown") advance(intro.step * 2);
    else if(event.code === "ArrowUp" || event.code === "PageUp") advance(-intro.step * 2);
    else if(event.code === "KeyH") document.documentElement.classList.toggle("is-clean");
    else if(event.code === "Space") { clock.paused = !clock.paused; panel.sync(); event.preventDefault(); }
    else if(event.code === "KeyR") panel.replay();
});

renderer.setAnimationLoop(frameLoop);

/* Exposed for screenshots and the curious. */
window.nightsail = { intro, frame, lens, view, clock, renderer, scene, camera, panel };
