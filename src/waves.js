/* The sea, defined once and used twice.
 *
 * The surface is a sum of Gerstner waves: points do not just move up and down, they also move
 * backwards along the direction of travel, which is what gives a swell its sharp crest and its long
 * flat trough. Trochoids, not sines.
 *
 * The same wave set has to be evaluated in two places — the vertex shader, for the water itself, and
 * plain JavaScript, so the boat can sit on the surface rather than float near it. Keeping two copies
 * of the formula in sync by hand is a losing game, so the wave train is data: a handful of vec4s
 * uploaded as a uniform and read by both the loop below and the identical loop in the shader. */

import * as THREE from "three";

export const WAVE_COUNT = 6;

/** Wave train derived from the wind: each step is shorter, slower and smaller than the one before. */
export function buildWaves({ wind, wavelength, amplitude, steepness, spread, speed })
{
    const waves = [];
    let length = wavelength;
    let height = amplitude;

    for(let i = 0; i < WAVE_COUNT; i++)
    {
        /* Directions fan out around the wind, alternating sides, so the swell never looks like a
           single corridor of parallel ridges. */
        const angle = wind + ((i % 2 === 0 ? 1 : -1) * spread * (i + 1)) / WAVE_COUNT;

        waves.push({
            direction: new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
            length,
            height,
            /* Deep water dispersion: long waves travel faster. Keeping this honest is most of the
               reason the sea reads as water and not as a wobbling sheet. */
            speed: speed * Math.sqrt(length / wavelength),
            steepness: steepness / WAVE_COUNT,
        });

        length *= 0.62;
        height *= 0.72;
    }

    return waves;
}

/** Packed for the shader: xy direction, z wavelength, w amplitude — plus a second vec4 for the rest. */
export function packWaves(waves)
{
    const a = [];
    const b = [];

    for(const wave of waves)
    {
        a.push(new THREE.Vector4(wave.direction.x, wave.direction.y, wave.length, wave.height));
        b.push(new THREE.Vector4(wave.speed, wave.steepness, 0, 0));
    }

    return { a, b };
}

/** Surface point and normal at a world xz, on the CPU. Mirrors `waveGlsl` line for line. */
export function sampleSurface(waves, x, z, time)
{
    let px = 0;
    let py = 0;
    let pz = 0;
    let nx = 0;
    let ny = 1;
    let nz = 0;

    for(const wave of waves)
    {
        const k = (Math.PI * 2) / wave.length;
        const c = Math.sqrt(9.81 / k) * wave.speed;
        const d = wave.direction;
        const f = k * (d.x * x + d.y * z - c * time);
        const a = wave.steepness / k;

        px += d.x * (a * Math.cos(f));
        pz += d.y * (a * Math.cos(f));
        py += wave.height * Math.sin(f);

        const wa = k * wave.height;
        const s = Math.sin(f);
        const cs = Math.cos(f);

        nx -= d.x * wa * cs;
        nz -= d.y * wa * cs;
        ny -= wave.steepness * s;
    }

    const length = Math.hypot(nx, ny, nz) || 1;

    return { x: x + px, y: py, z: z + pz, nx: nx / length, ny: ny / length, nz: nz / length };
}

/* The shader half. Included by the ocean material and by anything else that needs to sit on the
   water, so there is exactly one definition of what the surface is. */
export const waveGlsl = /* glsl */ `
uniform vec4 uWaveA[WAVE_COUNT];   // xy direction, z wavelength, w amplitude
uniform vec4 uWaveB[WAVE_COUNT];   // x speed, y steepness
uniform float uWaveTime;

struct Surface
{
    vec3 position;
    vec3 normal;
    float crest;                   // 0 in the troughs, 1 on the sharpest ridges
};

Surface sampleSurface(vec3 base)
{
    vec3 offset = vec3(0.0);
    vec3 normal = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;
    float weight = 0.0;

    for(int i = 0; i < WAVE_COUNT; i++)
    {
        vec2 direction = uWaveA[i].xy;
        float wavelength = uWaveA[i].z;
        float amplitude = uWaveA[i].w;
        float speed = uWaveB[i].x;
        float steepness = uWaveB[i].y;

        float k = 6.28318530718 / wavelength;
        float c = sqrt(9.81 / k) * speed;
        float f = k * (dot(direction, base.xz) - c * uWaveTime);
        float a = steepness / k;

        offset.x += direction.x * (a * cos(f));
        offset.z += direction.y * (a * cos(f));
        offset.y += amplitude * sin(f);

        float wa = k * amplitude;
        normal.x -= direction.x * wa * cos(f);
        normal.z -= direction.y * wa * cos(f);
        normal.y -= steepness * sin(f);

        crest += sin(f) * amplitude;
        weight += amplitude;
    }

    Surface surface;
    surface.position = base + offset;
    surface.normal = normalize(normal);
    surface.crest = clamp(crest / max(weight, 0.0001), -1.0, 1.0);

    return surface;
}
`;
