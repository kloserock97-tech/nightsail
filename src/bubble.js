import * as THREE from "three/webgpu";
import { attribute, cross, float, Fn, If, instancedArray, instanceIndex, Loop, max, modelViewMatrix, mx_noise_float, mx_noise_vec3, normalize, select, uniform, uv, varying, vec2, vec3, vec4 } from "three/tsl";

/* The bubble on the first screen: a cloud of points in a curl-noise field.
 *
 * Nothing accumulates. Every frame a point's position is recomputed as a pure function of its seed and
 * time: no integration, no state, nothing to drift apart, and freezing time freezes the cloud exactly as
 * it was. The same property gives the fallback for free. With compute shaders (WebGPU) the field is
 * evaluated once per point in a compute pass; without them it runs in the vertex stage from a seed
 * attribute. Both branches call the one `place` function.
 *
 * Where the shape comes from:
 * 1. Landing. The field direction at the seed, normalised, is a point on the unit sphere. That
 *    normalisation is the only reason the cloud is round.
 * 2. Tracing. From there the point follows the field for a few shrinking strides at a finer scale, like a
 *    streamline. Neighbours that land close walk the same path, which draws threads instead of noise.
 * 3. Spray. A slow noise over the sphere decides how far each patch sits from the shell, unclamped, so the
 *    silhouette tears instead of staying a ball. `dissolve` lengthens the strides and lifts the spray:
 *    the bubble unwinds into threads on its way into the light.
 *
 * The lens is fake and almost free: the blur disc grows with distance from the plane of focus and the
 * light a point carries is spread over that disc, so points in focus are tight bright grains and the rest
 * are faint wide circles. Distances are measured in radii of the cloud, so the look holds while the
 * bubble changes size fivefold on its flight. */

const COUNT = 262144;
const COUNT_WITHOUT_COMPUTE = 20000;
const TRACE = 3;

export function createBubble({ clock, renderer, scene })
{
    const settings = {
        frequency: uniform(0.8),  // field scale: low is broad sheets, high is fine tangles
        speed: uniform(9.8),
        spray: uniform(0.05),
        fstop: uniform(8),        // like a lens: small numbers blur more
        grain: uniform(0.0035),   // size of a point in perfect focus, in radii
        radius: uniform(1),
        focus: uniform(5),
        opacity: uniform(1),
        dissolve: uniform(0),
    };

    /* Curl of a vector noise, collected in a loop: sum over three axes and two signs of
       sign * cross(axis, noise(p + sign * h * axis)). These are the central differences of the curl
       formula, with the 1/2h dropped because the result is normalised anyway.
       The loop matters for compile time, not frame time: HLSL inlines every call, and noise written out
       six times per curl turned into a shader that froze the page for tens of seconds on Intel graphics. */
    const curl = Fn(([p]) =>
    {
        const sum = vec3(0).toVar();

        Loop({ start: 0, end: 6, type: "int", name: "probe" }, ({ probe }) =>
        {
            const a = probe.div(2);
            const axis = vec3(float(a.equal(0)), float(a.equal(1)), float(a.equal(2))).toVar();
            const sign = select(probe.mod(2).equal(1), float(1), float(-1)).toVar();

            sum.addAssign(cross(axis, mx_noise_vec3(p.add(axis.mul(sign.mul(0.1))))).mul(sign));
        });

        return normalize(sum);
    });

    const place = Fn(([seed]) =>
    {
        const t = clock.shader.mul(settings.speed).mul(0.015);
        const flow = vec3(t.mul(0.61), t, t.mul(-0.37)).toVar();

        const landing = curl(seed.mul(settings.frequency).add(flow)).toVar();
        const p = landing.toVar();
        const stride = float(0.34).mul(settings.dissolve.mul(1.5).add(1)).toVar();
        const scale = float(1.7).toVar();

        Loop({ start: 0, end: TRACE, type: "int", name: "step" }, ({ step }) =>
        {
            const v = curl(p.mul(settings.frequency).mul(scale).add(flow.mul(0.5)).add(float(step).mul(4.1)));
            p.addAssign(v.mul(stride));
            stride.mulAssign(0.57);
            scale.mulAssign(1.9);
        });

        const lift = mx_noise_float(landing.mul(2.3).add(flow.mul(0.3)));
        const reach = max(0.02, lift.add(settings.spray).add(settings.dissolve.mul(1.2)).mul(0.65).add(1));

        return normalize(p).mix(p, settings.dissolve).mul(reach);
    });

    /* Seeds uniformly inside a ball by rejection, pushed out to radius 128: the radius is not the size of
       the cloud, it is how far apart neighbours sit in noise space. */
    const makeSeeds = (count) =>
    {
        const seeds = new Float32Array(count * 3);
        const point = new THREE.Vector3();

        for(let i = 0; i < count; i++)
        {
            do point.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
            while(point.lengthSq() > 1 || point.lengthSq() < 1e-6);

            point.normalize().multiplyScalar(128).toArray(seeds, i * 3);
        }

        return seeds;
    };

    const bubble = { settings, mesh: null, compute: null, pending: new THREE.Vector3() };

    bubble.build = () =>
    {
        if(bubble.mesh) return;

        const hasCompute = !!renderer.backend?.isWebGPUBackend;
        const count = hasCompute ? COUNT : COUNT_WITHOUT_COMPUTE;
        const seeds = makeSeeds(count);

        let source;
        let seedAttribute;

        if(hasCompute)
        {
            const seedBuffer = instancedArray(seeds, "vec3");
            const positionBuffer = instancedArray(count, "vec3");

            bubble.compute = Fn(() =>
            {
                positionBuffer.element(instanceIndex).assign(place(seedBuffer.element(instanceIndex)));
            })().compute(count);

            source = positionBuffer.toAttribute();
        }
        else
        {
            seedAttribute = new THREE.InstancedBufferAttribute(seeds, 3);
            source = place(attribute("aSeed", "vec3"));
        }

        /* Alpha blending, not additive: fifty faint discs stacked add up to solid white, while alpha
           saturates below 1, so soft circles and sharp grains can live in the same cloud. */
        const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
        material.blending = THREE.NormalBlending;

        const local = source.mul(settings.radius).toVar();
        const depth = modelViewMatrix.mul(vec4(local, 1)).z.negate();
        const defocus = depth.sub(settings.focus).abs().div(settings.radius).toVar();

        const blur = defocus.div(settings.fstop).mul(0.064);
        const sharp = settings.grain;

        material.positionNode = local;
        material.scaleNode = vec2(sharp.add(blur).mul(settings.radius).mul(3.2));

        /* The light of a point is fixed; spread over a larger disc it dims by the ratio of the areas. */
        const light = varying(sharp.div(sharp.add(blur)).pow(2).mul(1.15).clamp(0.035, 1), "bubbleLight");

        material.colorNode = vec3(1);
        material.opacityNode = Fn(() =>
        {
            const offset = uv().sub(0.5).mul(2);
            const disc = offset.length().smoothstep(1, 0.86);

            return disc.mul(light).mul(settings.opacity);
        })();

        if(hasCompute)
        {
            bubble.mesh = new THREE.Sprite(material);
            bubble.mesh.count = count;
        }
        else
        {
            const plane = new THREE.PlaneGeometry(1, 1);
            const geometry = new THREE.InstancedBufferGeometry();
            geometry.index = plane.index;
            geometry.setAttribute("position", plane.getAttribute("position"));
            geometry.setAttribute("uv", plane.getAttribute("uv"));
            geometry.setAttribute("aSeed", seedAttribute);
            geometry.instanceCount = count;

            bubble.mesh = new THREE.Mesh(geometry, material);
        }

        bubble.mesh.frustumCulled = false;
        bubble.mesh.renderOrder = 20;
        bubble.mesh.position.copy(bubble.pending);
        bubble.count = count;
        scene.add(bubble.mesh);
    };

    bubble.setPosition = (position) =>
    {
        bubble.pending.copy(position);
        bubble.mesh?.position.copy(position);
    };

    bubble.setVisible = (visible) =>
    {
        if(visible) bubble.build();
        if(bubble.mesh) bubble.mesh.visible = visible;
    };

    bubble.update = () =>
    {
        if(bubble.compute && bubble.mesh?.visible) renderer.compute(bubble.compute);
    };

    return bubble;
}
