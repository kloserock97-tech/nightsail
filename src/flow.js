import * as THREE from "three/webgpu";
import { attribute, cameraPosition, cross, Fn, positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import { curl } from "./curl.js";
import { CORE } from "./light.js";

/* Threads around the core: the traces of the curl field.
 *
 * The sparks are already carried by the field, but it does not show: a spark lives a second and drifts a
 * fraction of a unit. Flow reads through a trace, the line a point has walked. So here the traces are
 * drawn, as a veil of many short ribbons: none of them is readable alone, together they show where the
 * field goes.
 *
 * The paths are integrated once at start-up and baked into ribbon geometry; a bright head runs along each
 * ribbon in the shader, and that head is all the motion. Re-tracing five hundred paths every frame would
 * cost ten thousand noise samples for a picture that does not change: the field stands still.
 *
 * Ribbons are turned to the camera in the vertex stage, not at bake time, because the camera breathes. */

const TRAILS = 520;
const STEPS = 26;
const STEP = 0.22;
const SHEETS = 9;

export function createFlow({ clock, light })
{
    const settings = {
        amount: uniform(0.4),
        width: uniform(0.032),
        speed: uniform(0.16),
        spark: uniform(1.1),
        sharpness: uniform(24),
        base: uniform(0.05),
        split: uniform(0.3),
    };

    const scale = 0.17;

    /* Bundles. Points released at random make even cotton; released close together they walk nearly
       the same path, and a film forms between them. The films are what make the veil a veil. */
    const sheets = [];

    for(let i = 0; i < SHEETS; i++)
    {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / SHEETS);
        const theta = i * 2.399963; // golden angle
        sheets.push(new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.55, Math.sin(phi) * Math.sin(theta)).normalize());
    }

    const vertices = TRAILS * STEPS * 2;
    const positions = new Float32Array(vertices * 3);
    const tangents = new Float32Array(vertices * 3);
    const sides = new Float32Array(vertices);
    const alongs = new Float32Array(vertices);
    const seeds = new Float32Array(vertices);
    const indices = new Uint32Array(TRAILS * (STEPS - 1) * 6);

    const point = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const previous = new THREE.Vector3();
    const radial = new THREE.Vector3();
    const tangent = new THREE.Vector3();

    let vertex = 0;
    let index = 0;

    for(let t = 0; t < TRAILS; t++)
    {
        const sheet = sheets[t % SHEETS];
        const seed = Math.random();

        point.copy(sheet)
            .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.42))
            .normalize()
            .multiplyScalar(1.9 + Math.random() * 3.1);

        direction.set(0, 0, 0);

        for(let s = 0; s < STEPS; s++)
        {
            previous.copy(point);

            curl(point.x * scale + 31.7, point.y * scale - 12.3, point.z * scale + 5.1, velocity);
            velocity.normalize();

            /* Left alone the field would carry threads anywhere. Two nudges keep the veil at the core:
               a lift towards the column and a soft return to a working distance from the centre. */
            radial.copy(point).normalize();
            velocity.y += 0.2;
            velocity.addScaledVector(radial, (3.6 - point.length()) * 0.17);
            velocity.normalize();

            /* Inertia, or the thread breaks at every step into a zigzag. */
            direction.lerp(velocity, s === 0 ? 1 : 0.35).normalize();
            point.addScaledVector(direction, STEP);

            if(s === 0) tangent.copy(direction);
            else tangent.copy(point).sub(previous).normalize();

            for(const side of [-1, 1])
            {
                const o = vertex * 3;

                positions[o] = point.x;
                positions[o + 1] = CORE + point.y;
                positions[o + 2] = point.z;
                tangents[o] = tangent.x;
                tangents[o + 1] = tangent.y;
                tangents[o + 2] = tangent.z;
                sides[vertex] = side;
                alongs[vertex] = s / (STEPS - 1);
                seeds[vertex] = seed;

                vertex++;
            }

            if(s > 0)
            {
                const a = vertex - 4;
                indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], index);
                index += 6;
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aTangent", new THREE.BufferAttribute(tangents, 3));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(sides, 1));
    geometry.setAttribute("aAlong", new THREE.BufferAttribute(alongs, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    material.blending = THREE.AdditiveBlending;

    const side = attribute("aSide", "float");
    const along = attribute("aAlong", "float");
    const trail = attribute("aSeed", "float");

    /* The cross piece is perpendicular to the thread and to the view ray, so the ribbon is always flat on. */
    material.positionNode = Fn(() =>
    {
        const toCamera = cameraPosition.sub(positionLocal).normalize();
        const across = cross(attribute("aTangent", "vec3"), toCamera).normalize();

        return positionLocal.add(across.mul(side.mul(settings.width)));
    })();

    material.colorNode = Fn(() =>
    {
        /* Each thread has its own running mark, or one wave would sweep the whole veil like road paint. */
        const head = along.sub(clock.shader.mul(settings.speed)).add(trail).fract();
        const spark = head.pow(settings.sharpness).mul(settings.spark);

        const taper = smoothstep(0, 0.14, along).mul(smoothstep(1, 0.7, along));
        const edge = side.abs().oneMinus().pow(1.5);
        const level = spark.add(settings.base).mul(taper).mul(edge).mul(settings.amount);

        /* The two sides of the ribbon get slightly different hues: a hint of dispersion at the edges. */
        const tint = vec3(0.66, 0.76, 1).add(vec3(0.3, -0.04, -0.28).mul(side.mul(settings.split)));

        return tint.mul(light.color).mul(level);
    })();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;

    return { mesh, settings };
}
