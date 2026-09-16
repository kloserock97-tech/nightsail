import * as THREE from "three/webgpu";
import { float, Fn, mix, mx_fractal_noise_float, positionWorld, smoothstep, texture, uniform, uv, vec3 } from "three/tsl";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* A giant marble head, drowning under the light.
 *
 * "Marble Bust 01" by Rico Cilliers, Poly Haven (CC0). It stands right under the column, scaled up until
 * only the crown of the head clears the sea at low tide. The swell washes over it and the tide sinks it
 * whole, then pulls back and lets it surface.
 *
 * The stone knows where the water is. Its shader evaluates the same wave sum the sea draws, at its own
 * position, so the waterline on the marble is exact: a band of foam right at the surface, and dark,
 * glossy wet stone above it, up to the highest the water has reached lately. That wet line dries back
 * slowly on the CPU, which is what makes the head look like it has just come out of the sea. */

export function createStatue({ url, ocean, clock })
{
    const settings = {
        height: 46,       // height of the whole bust in world units
        top: 3.5,         // where the crown sits above the calm sea level
        x: 0,
        z: 0,
        turn: 180,        // degrees; 180 faces the default camera
        lean: -6,         // degrees, forward tilt of the head
        brightness: 1.6,
        wetReach: 0.6,    // how far above the waterline the stone is wet even at the lowest wave
        dryTime: 6,       // seconds for wet stone to dry by one unit
    };

    const uniforms = {
        brightness: uniform(settings.brightness),
        wetTop: uniform(0),
        foam: uniform(0.8),
        wetDarken: uniform(0.55),
        wetReach: uniform(0.6),
    };

    const group = new THREE.Group();
    const pivot = new THREE.Group();
    group.add(pivot);

    const statue = { group, settings, uniforms, loaded: false };

    let model = null;
    let peak = -Infinity;

    new GLTFLoader().load(url, (gltf) =>
    {
        model = gltf.scene;

        model.traverse((child) =>
        {
            if(!child.isMesh) return;

            const source = child.material;
            const material = new THREE.MeshStandardNodeMaterial({ normalMap: source.normalMap, metalness: 0 });

            const waterY = Fn(() => ocean.levelUniform.add(ocean.heightNode(positionWorld.xz)))();
            const above = positionWorld.y.sub(waterY).toVar();

            /* Wet from the waterline up to the recent high-water mark, drying out above it. */
            const wet = smoothstep(uniforms.wetTop, uniforms.wetTop.sub(0.8), positionWorld.y).max(smoothstep(uniforms.wetReach, 0, above)).toVar();

            /* Foam clings to the stone right at the surface, torn by noise so it is not a painted stripe. */
            const tear = mx_fractal_noise_float(vec3(positionWorld.x.mul(1.3), positionWorld.y.mul(0.6), positionWorld.z.mul(1.3).add(clock.shader.mul(0.3))), 2).mul(0.5).add(0.5);
            const band = smoothstep(0.45, 0, above.abs()).mul(tear.mul(1.4)).clamp(0, 1).mul(uniforms.foam);

            const albedo = source.map ? texture(source.map, uv()).rgb : vec3(0.8);
            const stone = albedo.mul(uniforms.brightness).mul(mix(float(1), uniforms.wetDarken, wet));

            material.colorNode = mix(stone, vec3(0.85, 0.9, 0.92), band);

            const rough = source.roughnessMap ? texture(source.roughnessMap, uv()).g : float(0.6);
            material.roughnessNode = mix(rough, float(0.12), wet).max(band);

            child.material = material;
            child.frustumCulled = false;
        });

        pivot.add(model);
        statue.loaded = true;
        statue.fit();
    });

    /* Scale to the height and hang it so the crown sits at `top` above the calm sea. */
    statue.fit = () =>
    {
        if(!model) return;

        model.scale.setScalar(1);
        model.position.set(0, 0, 0);

        /* Measure in the model's own space: attached, the box would include where the group stands. */
        const parent = model.parent;
        parent?.remove(model);
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        parent?.add(model);
        const scale = settings.height / (box.max.y - box.min.y);

        model.scale.setScalar(scale);
        model.position.set(-((box.max.x + box.min.x) / 2) * scale, -box.max.y * scale, -((box.max.z + box.min.z) / 2) * scale);

        pivot.rotation.set(THREE.MathUtils.degToRad(settings.lean), THREE.MathUtils.degToRad(settings.turn), 0, "YXZ");
        group.position.set(settings.x, ocean.level + settings.top, settings.z);
    };

    statue.update = (delta) =>
    {
        uniforms.brightness.value = settings.brightness;
        uniforms.wetReach.value = settings.wetReach;
        group.position.set(settings.x, ocean.level + settings.top, settings.z);

        /* The high-water mark jumps up with the sea and sinks back slowly as the stone dries. */
        const reach = ocean.levelNow + ocean.settings.amplitude.value * 1.3;
        peak = Math.max(reach, peak - delta / Math.max(settings.dryTime, 0.1));
        uniforms.wetTop.value = peak;
    };

    return statue;
}
