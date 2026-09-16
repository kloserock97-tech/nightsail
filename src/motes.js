import * as THREE from "three";

/* Whatever it is that drifts over water at night — spray, insects, ash from somewhere. Points in a
   box that follows the camera, nudged by a few sine terms rather than by noise: at this size nobody
   can tell the difference, and it costs a tenth as much.
 *
 * The box wraps. A mote that leaves through one wall comes back through the opposite one, so a
 * hundred of them can stand in for a whole sky full. */

const vertexShader = /* glsl */ `
attribute vec3 aSeed;
attribute float aPhase;

uniform float uTime;
uniform float uDrift;
uniform float uSize;
uniform vec3 uBox;
uniform vec3 uCenter;
uniform float uScreenScale;

varying float vFade;

void main()
{
    vec3 wander = vec3(
        sin(uTime * 0.31 + aPhase * 6.28) + sin(uTime * 0.17 + aPhase * 3.1) * 0.6,
        sin(uTime * 0.23 + aPhase * 4.7) * 0.5,
        cos(uTime * 0.27 + aPhase * 5.3) + cos(uTime * 0.13 + aPhase * 2.2) * 0.6
    );

    vec3 position = aSeed + wander * uDrift;
    position.x += uTime * uDrift * 0.35;

    /* Wrap inside the box, keeping the box centred on the viewer. */
    vec3 local = mod(position - uCenter + uBox * 0.5, uBox) - uBox * 0.5;
    vec3 world = uCenter + local;

    vec4 view = modelViewMatrix * vec4(world, 1.0);
    float depth = -view.z;

    /* Fade at the walls of the box so nothing pops in or out, and again far away so the motes do not
       turn into a grey wash on the horizon. */
    vec3 edge = 1.0 - smoothstep(vec3(0.3), vec3(0.5), abs(local) / uBox);
    vFade = edge.x * edge.y * edge.z * (1.0 - smoothstep(20.0, 90.0, depth));

    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(uSize * uScreenScale / max(depth, 0.001), 1.0, 40.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uOpacity;

varying float vFade;

void main()
{
    vec2 offset = gl_PointCoord * 2.0 - 1.0;
    float disc = smoothstep(1.0, 0.35, length(offset));
    float alpha = disc * vFade * uOpacity;

    if(alpha <= 0.002) discard;

    gl_FragColor = vec4(uColor, alpha);
}
`;

export function createMotes(settings)
{
    const uniforms = {
        uTime: { value: 0 },
        uDrift: { value: settings.moteDrift },
        uSize: { value: settings.moteSize },
        uBox: { value: new THREE.Vector3(70, 26, 70) },
        uCenter: { value: new THREE.Vector3() },
        uScreenScale: { value: 1 },
        uColor: { value: new THREE.Color(settings.moteColor) },
        uOpacity: { value: settings.moteOpacity },
    };

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    let points = null;

    function build(count)
    {
        if(points) points.geometry.dispose();

        const box = uniforms.uBox.value;
        const seeds = new Float32Array(count * 3);
        const phases = new Float32Array(count);

        for(let i = 0; i < count; i++)
        {
            seeds[i * 3] = (Math.random() - 0.5) * box.x;
            seeds[i * 3 + 1] = Math.random() * box.y * 0.5;
            seeds[i * 3 + 2] = (Math.random() - 0.5) * box.z;
            phases[i] = Math.random();
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
        geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

        if(points) points.geometry = geometry;
        else
        {
            points = new THREE.Points(geometry, material);
            points.frustumCulled = false;
            points.renderOrder = 6;
        }
    }

    build(Math.round(settings.moteCount));

    return { points, build, uniforms, material };
}
