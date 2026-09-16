import * as THREE from "three";
import { WAVE_COUNT, waveGlsl } from "./waves.js";

/* The water.
 *
 * One displaced plane, shaded by hand. There is no environment map and no reflection pass: at night
 * the sea is mostly a dark gradient with a fresnel rim, a hard specular glint and foam where the
 * crests get steep. Everything expensive about water — real reflections, refraction, screen-space
 * anything — buys very little in this kind of frame and costs a lot, so none of it is here.
 *
 * The one light that matters is the pillar. Its contribution is faked as a radial falloff around its
 * axis, plus a vertical streak that follows the viewer, which is what a light on water actually does:
 * the glitter path always points at you. */

const vertexShader = /* glsl */ `
#define WAVE_COUNT ${WAVE_COUNT}

${waveGlsl}

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

void main()
{
    Surface surface = sampleSurface(position);

    vWorld = surface.position;
    vNormal = surface.normal;
    vCrest = surface.crest;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(surface.position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSkyLow;
uniform vec3 uSkyTop;
uniform vec3 uFogColor;
uniform vec3 uPillarColor;
uniform vec3 uPillarPosition;
uniform float uPillarGlow;
uniform float uPillarReach;
uniform float uFoamAmount;
uniform float uGlossiness;
uniform float uFogDensity;
uniform float uReflection;
uniform vec3 uCamera;

varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main()
{
    vec3 normal = normalize(vNormal);
    vec3 toCamera = normalize(uCamera - vWorld);

    /* Deep in the troughs, lighter on the shoulders. Steepness, not height, drives the mix: it keeps
       the colour attached to the shape of the wave rather than to the sea level. */
    float lift = smoothstep(-0.6, 0.9, vCrest);
    vec3 color = mix(uDeep, uShallow, lift);

    /* Fresnel: at a grazing angle water turns into a mirror of the sky, straight down it is dark. */
    float fresnel = pow(1.0 - clamp(dot(normal, toCamera), 0.0, 1.0), 4.0);
    color = mix(color, uSkyLow, fresnel * 0.7 * uReflection);

    /* A tilted face sees more sky than a flat one; without this the water near the camera goes to a
       flat dark sheet, because fresnel is nearly zero when you look straight down. It also looks
       further up the sky, so it reflects something between the horizon and the zenith rather than the
       horizon itself. With a warm horizon that is the difference between a sea at dawn and a desert. */
    float tilt = 1.0 - clamp(normal.y, 0.0, 1.0);
    color = mix(color, mix(uSkyLow, uSkyTop, 0.6), tilt * 0.55 * uReflection);

    /* The pillar as a light. Radial falloff around its axis for the spill, and a streak along the
       line between the viewer and the light for the glitter path. */
    vec2 toPillar = vWorld.xz - uPillarPosition.xz;
    float spill = exp(-length(toPillar) / max(uPillarReach, 0.001));

    vec3 pillarDirection = normalize(uPillarPosition - vWorld);
    vec3 half3 = normalize(pillarDirection + toCamera);
    float glint = pow(clamp(dot(normal, half3), 0.0, 1.0), mix(12.0, 900.0, uGlossiness));

    color += uPillarColor * (spill * uPillarGlow * 0.5 + glint * uPillarGlow * 1.6 * (0.25 + spill));

    /* Foam where the crest is sharp, broken up so the line never reads as a contour. */
    float grain = valueNoise(vWorld.xz * 1.6) * 0.6 + valueNoise(vWorld.xz * 6.0) * 0.4;
    float foam = smoothstep(0.62 - uFoamAmount * 0.5, 0.98, vCrest * (0.55 + grain * 0.75));
    color = mix(color, uFoam, foam * uFoamAmount);

    /* Distance fog, so the sea meets the sky instead of ending at an edge. */
    float distanceToCamera = length(uCamera - vWorld);
    /* Squared exponential: the water near the boat stays water, and the haze gathers towards the
       horizon, where it has to match the sky exactly for the seam to disappear. */
    float fogDepth = distanceToCamera * uFogDensity;
    float fog = 1.0 - exp(-fogDepth * fogDepth);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
}
`;

export function createOcean({ size = 900, segments = 320, settings })
{
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const uniforms = {
        uWaveA: { value: [] },
        uWaveB: { value: [] },
        uWaveTime: { value: 0 },
        uDeep: { value: new THREE.Color(settings.deep) },
        uShallow: { value: new THREE.Color(settings.shallow) },
        uFoam: { value: new THREE.Color(settings.foam) },
        uSkyLow: { value: new THREE.Color(settings.horizon) },
        uSkyTop: { value: new THREE.Color(settings.skyTop) },
        uFogColor: { value: new THREE.Color(settings.horizon) },
        uPillarColor: { value: new THREE.Color(settings.pillarColor) },
        uPillarPosition: { value: new THREE.Vector3() },
        uPillarGlow: { value: settings.pillarGlow },
        uPillarReach: { value: settings.pillarReach },
        uFoamAmount: { value: settings.foamAmount },
        uGlossiness: { value: settings.glossiness },
        uFogDensity: { value: settings.fogDensity },
        uReflection: { value: settings.reflection },
        uCamera: { value: new THREE.Vector3() },
    };

    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;

    return { mesh, material, uniforms };
}
