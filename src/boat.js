import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* The boat and the figure standing in it.
 *
 * The hull is built from numbers, the way a real one is drawn: stations along the length, each with a
 * half width and a depth, stitched into a surface. Flat normals on purpose: at this distance and against
 * a light this strong the boat is a silhouette with a few catching planes. A wheelhouse, a mast and a
 * dim lantern make it a working boat rather than a bathtub.
 *
 * The figure is "Hoodie Character" by Quaternius (CC0), trimmed to one idle clip. Its head is tipped up
 * towards the light on top of the animation every frame. */

const STATIONS = 14;
const RINGS = 3;

function hullGeometry({ length, beam, draft, sheer })
{
    const rows = [];

    for(let s = 0; s <= STATIONS; s++)
    {
        const t = s / STATIONS; // 0 at the stern, 1 at the bow

        /* Full at the stern and amidships, fine at the bow. */
        const fullness = Math.pow(Math.sin(Math.PI * Math.min(0.5 + t * 0.52, 1)), 0.55);
        const halfWidth = (beam / 2) * fullness * (t < 0.04 ? 0.86 : 1);
        const depth = draft * Math.pow(Math.sin(Math.PI * Math.min(0.5 + t * 0.51, 1)), 0.45);

        /* The deck line lifts towards the bow. One line, and the boat stops looking like a tub. */
        const rise = sheer * Math.pow(Math.max(t - 0.35, 0) / 0.65, 2);
        const z = (t - 0.5) * length;

        const row = [];

        for(let r = 0; r <= RINGS; r++)
        {
            const k = r / RINGS;
            row.push(new THREE.Vector3(halfWidth * Math.pow(k, 0.7), -depth * (1 - k) + rise * k, z));
        }

        rows.push(row);
    }

    const positions = [];
    const push = (...points) => { for(const p of points) positions.push(p.x, p.y, p.z); };

    for(let s = 0; s < STATIONS; s++)
    {
        for(let r = 0; r < RINGS; r++)
        {
            for(const side of [1, -1])
            {
                const [p00, p10, p01, p11] = [rows[s][r], rows[s + 1][r], rows[s][r + 1], rows[s + 1][r + 1]]
                    .map((p) => p.clone().setX(p.x * side));

                if(side > 0) push(p00, p11, p10, p00, p01, p11);
                else push(p00, p10, p11, p00, p11, p01);
            }
        }

        const a = rows[s][RINGS], b = rows[s + 1][RINGS];
        const c = a.clone().setX(-a.x), d = b.clone().setX(-b.x);
        push(a, b, d, a, d, c);
    }

    /* Transom: close the square stern. */
    const stern = rows[0];
    for(let r = 0; r < RINGS; r++)
    {
        const p0 = stern[r], p1 = stern[r + 1];
        const m0 = p0.clone().setX(-p0.x), m1 = p1.clone().setX(-p1.x);
        push(p0, m0, m1, p0, m1, p1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    return geometry;
}

export function createBoat({ figureUrl })
{
    const shape = { length: 8.4, beam: 3.1, draft: 1.5, sheer: 0.7 };
    const deck = 0.25;

    const group = new THREE.Group();
    group.rotation.order = "YXZ"; // heading first, then pitch and roll

    const hullMaterial = new THREE.MeshStandardMaterial({ color: "#1a1c1f", roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: "#2b2d30", roughness: 0.75, flatShading: true });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: "#0c0e10", roughness: 0.3, metalness: 0.2 });

    const hull = new THREE.Mesh(hullGeometry(shape), hullMaterial);
    group.add(hull);

    /* Wheelhouse towards the stern, with a dark band of windows and a flat roof. */
    const house = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, 2.1), trimMaterial);
    house.position.set(0, deck + 0.85, -1.4);
    const windows = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.42, 1.2), glassMaterial);
    windows.position.set(0, deck + 1.25, -0.95);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 2.5), trimMaterial);
    roof.position.set(0, deck + 1.76, -1.4);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.6, 6), trimMaterial);
    mast.position.set(0, deck + 1.8 + 2.3, -1.1);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 5), trimMaterial);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, deck + 5.2, -1.1);

    /* A lantern on the mast: barely warm, the only thing in the frame that is not the column's colour. */
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffc98a" }));
    lantern.position.set(0, deck + 3.4, -0.98);

    group.add(house, windows, roof, mast, yard, lantern);

    const boat = { group, draft: shape.draft, figure: null, head: null, mixer: null, headTilt: 0.34 };

    new GLTFLoader().load(figureUrl, (gltf) =>
    {
        const figure = gltf.scene;

        /* Scale to 2.4 units tall with the soles at zero. */
        const box = new THREE.Box3().setFromObject(figure);
        const height = box.max.y - box.min.y;
        figure.scale.setScalar(2.4 / height);
        figure.position.set(0, deck, 1.1);

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
        const clip = gltf.animations[0];
        if(clip) boat.mixer.clipAction(clip).play();

        group.add(figure);
        boat.figure = figure;
    });

    /* Float the boat at (x, z): height and tilt come from the same wave sum the shader draws. */
    boat.float = (ocean, x, z, yaw, delta) =>
    {
        const height = ocean.level + ocean.heightAt(x, z) + shape.draft * 0.42;
        const slope = ocean.slopeAt(x, z);

        group.position.set(x, height, z);
        group.rotation.set(-Math.atan(slope.z) * 0.85, yaw, Math.atan(slope.x) * 0.85);

        if(boat.mixer)
        {
            boat.mixer.update(delta);
            /* The mixer rewrites the bone every frame, so the tilt is added on top and never accumulates. */
            if(boat.head) boat.head.rotation.x -= boat.headTilt;
        }
    };

    return boat;
}
