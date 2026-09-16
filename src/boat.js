import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* The boat and the figure standing in it.
 *
 * Boats are low-poly models from Kenney's Pirate Kit (CC0), switchable from the panel. Each model gets a
 * length it is scaled to and how deep it sits, so a rowboat and a small ship both float right. The figure
 * is "Hoodie Character" by Quaternius (CC0), trimmed to one idle clip; it is placed by casting a ray down
 * onto the deck, so it stands on whatever model is loaded, and its head is tipped towards the light on top
 * of the animation every frame. */

export const BOATS = {
    rowboat: { file: "boat-row-large.glb", length: 5.8, sink: 0.3, stand: -0.2 },
    sloop: { file: "ship-small.glb", length: 11, sink: 1.0, stand: -0.05 },
    ship: { file: "ship-medium.glb", length: 14, sink: 1.0, stand: -0.1 },
};

export function createBoat({ base })
{
    const settings = {
        model: "rowboat",
        x: 0,
        z: 0,
        heading: 11,     // degrees
        size: 1,         // on top of the model's own length
        sink: 1,         // on top of the model's own draft
        tilt: 0.85,      // how willingly it lies on the slope of a wave
        brightness: 0.55,
        figure: true,
        headTilt: 0.34,
    };

    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch and roll

    const hull = new THREE.Group();
    group.add(hull);

    const loader = new GLTFLoader();
    const cache = new Map();
    const raycaster = new THREE.Raycaster();

    const boat = { group, settings, figure: null, head: null, mixer: null, model: null, deck: 0 };

    let figureRoot = null;
    const materials = [];

    const load = (url) =>
    {
        if(!cache.has(url)) cache.set(url, new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject)));
        return cache.get(url);
    };

    const applyBrightness = () =>
    {
        for(const { material, original } of materials) material.color.copy(original).multiplyScalar(settings.brightness);
    };

    /* Stand the figure on the deck: a ray straight down at the chosen spot finds the top surface. */
    const placeFigure = () =>
    {
        if(!figureRoot || !boat.model) return;

        const spec = BOATS[settings.model];
        const length = spec.length * settings.size;
        const z = spec.stand * length;

        hull.updateMatrixWorld(true);
        group.updateMatrixWorld(true);

        const origin = new THREE.Vector3(0, 50, z);
        const hits = [];
        raycaster.set(hull.localToWorld(origin.clone()), new THREE.Vector3(0, -1, 0).transformDirection(hull.matrixWorld));
        raycaster.intersectObject(boat.model, true, hits);

        /* Skip sails, yards and roofs: the deck is the first upward-facing surface low on the hull. */
        const deck = hits.find((hit) =>
        {
            const up = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y : 1;
            return up > 0.6 && hull.worldToLocal(hit.point.clone()).y < length * 0.35;
        });
        const top = deck ? hull.worldToLocal(deck.point.clone()).y : 0;
        figureRoot.position.set(0, top, z);
        figureRoot.visible = settings.figure;
    };

    boat.setModel = async (name) =>
    {
        const spec = BOATS[name] ?? BOATS.rowboat;
        settings.model = BOATS[name] ? name : "rowboat";

        const gltf = await load(`${base}boats/${spec.file}`);
        if(settings.model !== name && BOATS[name]) return; // switched again while loading

        if(boat.model) hull.remove(boat.model);

        const model = gltf.scene;
        materials.length = 0;
        model.traverse((child) =>
        {
            if(!child.isMesh) return;
            child.castShadow = false;
            const material = child.material;
            if(!material.userData.original) material.userData.original = material.color.clone();
            materials.push({ material, original: material.userData.original });
        });

        hull.add(model);
        boat.model = model;
        boat.fit();
        applyBrightness();
    };

    /* Scale to the model's length and sink it to its waterline. */
    boat.fit = () =>
    {
        if(!boat.model) return;

        const spec = BOATS[settings.model];
        boat.model.scale.setScalar(1);
        boat.model.position.set(0, 0, 0);

        /* Measure in the model's own space: attached, the box would include where the sea put the boat. */
        const parent = boat.model.parent;
        parent?.remove(boat.model);
        boat.model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(boat.model);
        parent?.add(boat.model);
        const nativeLength = box.max.z - box.min.z;
        const scale = (spec.length * settings.size) / nativeLength;

        boat.model.scale.setScalar(scale);
        boat.model.position.set(-((box.max.x + box.min.x) / 2) * scale, -box.min.y * scale, -((box.max.z + box.min.z) / 2) * scale);

        const hullHeight = Math.min(box.max.y - box.min.y, 2.2) * scale;
        hull.position.y = -hullHeight * spec.sink * settings.sink;

        placeFigure();
    };

    boat.applyBrightness = applyBrightness;
    boat.placeFigure = placeFigure;

    load(`${base}figure.glb`).then((gltf) =>
    {
        const figure = gltf.scene;
        figure.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(figure);
        figure.scale.setScalar(2.4 / (box.max.y - box.min.y));

        figure.traverse((child) =>
        {
            if(child.isMesh)
            {
                child.frustumCulled = false;
                child.material.color?.multiplyScalar(0.55); // under this light the figure is mostly shape
            }
            if(child.isBone && !boat.head && /head/i.test(child.name)) boat.head = child;
        });

        boat.mixer = new THREE.AnimationMixer(figure);
        if(gltf.animations[0]) boat.mixer.clipAction(gltf.animations[0]).play();

        figureRoot = new THREE.Group();
        figureRoot.add(figure);
        hull.add(figureRoot);
        boat.figure = figure;
        placeFigure();
    });

    /* Float at (x, z): height and tilt come from the same wave sum the shader draws. */
    boat.float = (ocean, delta, time) =>
    {
        const { x, z } = settings;
        const slope = ocean.slopeAt(x, z);

        group.position.set(x, ocean.level + ocean.heightAt(x, z), z);
        group.rotation.set(-Math.atan(slope.z) * settings.tilt, THREE.MathUtils.degToRad(settings.heading), Math.atan(slope.x) * settings.tilt);

        if(boat.mixer)
        {
            boat.mixer.update(delta);
            /* The mixer rewrites the bone every frame, so the tilt goes on top and never accumulates. */
            if(boat.head) boat.head.rotation.x -= settings.headTilt + Math.sin(time * 0.4) * 0.04;
        }
    };

    boat.setModel(settings.model);

    return boat;
}
