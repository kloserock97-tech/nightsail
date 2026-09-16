import * as THREE from "three/webgpu";
import { float, Fn, mix, normalize, normalWorld, positionWorld, smoothstep, uniform, vec3 } from "three/tsl";
import { CORE } from "./light.js";

/* Rock shards hanging in the air. With the camera nearly still, the parallax between near and far shards
 * is what gives the frame its depth.
 *
 * The lighting is not real either: a face brightens when its normal points at the core. One line is
 * enough, because there is exactly one light and it is at a known point. */

export function createDebris({ clock, air })
{
    const settings = {
        drift: uniform(2.73),
        spin: uniform(0.15),
        light: uniform(0.29),
        dark: uniform(0.01),
    };

    const count = 150;

    /* A fifth of the shards live inside the core. A glowing cloud with nothing solid in it has no scale;
       a few dark pieces tumbling in it give it weight. */
    const inCore = Math.round(count * 0.2);

    const shards = Array.from({ length: count }, (_, i) =>
    {
        const near = Math.random();
        const atCore = i < inCore;

        return {
            radius: atCore ? 1.2 + Math.random() * 3.4 : 8 + Math.pow(near, 0.8) * 53,
            angle: Math.random() * Math.PI * 2,
            height: atCore ? CORE - 3 + Math.random() * 6 : 3 + Math.random() * 52,
            scale: new THREE.Vector3(0.2 + Math.random() * 0.8, 0.2 + Math.random() * 0.8, 0.2 + Math.random() * 0.8)
                .multiplyScalar(atCore ? 0.06 + Math.random() * 0.13 : 0.18 + near * 0.51),
            speed: atCore ? 0.12 + Math.random() * 0.3 : 0.4 + Math.random() * 1.2,
            spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
            spinPhase: Math.random() * Math.PI * 2,
        };
    });

    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const vertices = geometry.attributes.position;

    /* Dent the icosahedron once for the whole batch: a hundred and fifty identical silhouettes show at once. */
    for(let i = 0; i < vertices.count; i++)
    {
        const k = 0.62 + Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.7;
        vertices.setXYZ(i, vertices.getX(i) * k, vertices.getY(i) * k * 0.85, vertices.getZ(i) * k);
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = Fn(() =>
    {
        const toLight = normalize(vec3(positionWorld.x.negate(), float(CORE).sub(positionWorld.y), positionWorld.z.negate()));
        const facing = normalWorld.dot(toLight).max(0).pow(1.4);
        const fog = smoothstep(air.fogNear, air.fogFar, positionWorld.sub(vec3(0, 4, 0)).length());

        return mix(vec3(mix(settings.dark, settings.light, facing)), air.fogColor, fog);
    })();

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    function update()
    {
        const time = clock.elapsed;

        for(let i = 0; i < count; i++)
        {
            const shard = shards[i];

            /* Rise slowly and wrap back down: the scene is endless, the shards are not. */
            const rise = (shard.height + time * settings.drift.value * shard.speed) % 58;

            position.set(Math.cos(shard.angle) * shard.radius, rise + 2, Math.sin(shard.angle) * shard.radius);
            quaternion.setFromAxisAngle(shard.spin, shard.spinPhase + time * settings.spin.value * shard.speed);

            matrix.compose(position, quaternion, shard.scale);
            mesh.setMatrixAt(i, matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
    }

    return { mesh, settings, update };
}
