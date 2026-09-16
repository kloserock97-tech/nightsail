/* The sea, defined once and used twice.
 *
 * The surface is a sum of trochoidal (Gerstner) waves: points do not only move up and down, they also
 * swing back and forth along the direction of travel, which is what gives a swell its sharp crest and
 * its long flat trough.
 *
 * The same wave train has to be evaluated in two places — the vertex shader, for the water, and plain
 * JavaScript, so the boat sits on the surface rather than near it. Keeping two copies of a formula in
 * sync by hand is a losing game, so the train is data: a few vec4s uploaded as uniforms and read by
 * the shader loop and by the identical loop in sampleSurface() below. */

import * as THREE from "three";

export const WAVE_COUNT = 6;
const GRAVITY = 9.81;

/* A fixed scatter of starting phases, so the waves never all peak at the origin at time zero. It is
   deterministic on purpose: the same settings always give the same sea. */
const PHASES = [0.0, 2.39, 4.71, 1.13, 5.52, 3.34];

/** Wave train derived from the wind: each step is shorter, slower and lower than the one before. */
export function buildWaves({ wind, wavelength, amplitude, steepness, spread, speed })
{
    const waves = [];
    let length = wavelength;
    let height = amplitude;

    for(let i = 0; i < WAVE_COUNT; i++)
    {
        /* Directions fan out around the wind, alternating sides, so the swell never lines up into
           corridors of parallel ridges. */
        const side = i % 2 === 0 ? 1 : -1;
        const angle = wind + (side * spread * (i + 1)) / WAVE_COUNT;
        const number = (Math.PI * 2) / length;

        waves.push({
            direction: new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
            number,
            height,
            /* Deep-water dispersion: angular frequency is sqrt(g·k), so long waves outrun short ones. */
            omega: Math.sqrt(GRAVITY * number) * speed,
            /* How far crests lean over, as a share of the most the wave can take before it loops.
               Split across the train so the sum never folds the surface over itself. */
            choppy: Math.min(steepness, 1.6) / (number * Math.max(height, 1e-4) * WAVE_COUNT),
            phase: PHASES[i],
        });

        length *= 0.62;
        height *= 0.72;
    }

    return waves;
}

/** Packed for the shader: xy direction, z wavenumber, w height; then omega, choppiness, phase. */
export function packWaves(waves)
{
    const a = [];
    const b = [];

    for(const wave of waves)
    {
        a.push(new THREE.Vector4(wave.direction.x, wave.direction.y, wave.number, wave.height));
        b.push(new THREE.Vector4(wave.omega, wave.choppy, wave.phase, 0));
    }

    return { a, b };
}

/**
 * Surface position and normal at a world xz, on the CPU. Mirrors the GLSL below term for term.
 *
 * The normal comes from the two tangent vectors of the displaced surface — its partial derivatives
 * along x and along z — crossed together.
 */
export function sampleSurface(waves, x, z, time)
{
    let ox = 0, oy = 0, oz = 0;
    let txx = 1, txy = 0, txz = 0;   // tangent along x
    let tzx = 0, tzy = 0, tzz = 1;   // tangent along z

    for(const w of waves)
    {
        const dx = w.direction.x;
        const dz = w.direction.y;
        const theta = w.number * (dx * x + dz * z) - w.omega * time + w.phase;
        const s = Math.sin(theta);
        const c = Math.cos(theta);
        const swing = w.choppy * w.height;
        const slope = w.number * w.height;
        const lean = w.number * swing;

        ox += dx * swing * c;
        oz += dz * swing * c;
        oy += w.height * s;

        txx -= lean * dx * dx * s;
        txy += slope * dx * c;
        txz -= lean * dx * dz * s;

        tzx -= lean * dx * dz * s;
        tzy += slope * dz * c;
        tzz -= lean * dz * dz * s;
    }

    /* normal = tangentZ × tangentX */
    let nx = tzy * txz - tzz * txy;
    let ny = tzz * txx - tzx * txz;
    let nz = tzx * txy - tzy * txx;
    const length = Math.hypot(nx, ny, nz) || 1;

    return { x: x + ox, y: oy, z: z + oz, nx: nx / length, ny: ny / length, nz: nz / length };
}

/* The shader half. Included by the ocean material, so there is exactly one definition on the GPU of
   what the surface is, and it matches sampleSurface() above. */
export const waveGlsl = /* glsl */ `
uniform vec4 uWaveA[WAVE_COUNT];   // xy direction, z wavenumber, w height
uniform vec4 uWaveB[WAVE_COUNT];   // x angular frequency, y choppiness, z phase
uniform float uWaveTime;

struct Surface
{
    vec3 position;
    vec3 normal;
    float crest;                   // -1 deep in a trough, 1 on the top of a ridge
};

Surface sampleSurface(vec3 base)
{
    vec3 offset = vec3(0.0);
    vec3 tangentX = vec3(1.0, 0.0, 0.0);
    vec3 tangentZ = vec3(0.0, 0.0, 1.0);
    float crest = 0.0;
    float total = 0.0;

    for(int i = 0; i < WAVE_COUNT; i++)
    {
        vec2 d = uWaveA[i].xy;
        float number = uWaveA[i].z;
        float height = uWaveA[i].w;
        float omega = uWaveB[i].x;
        float choppy = uWaveB[i].y;
        float phase = uWaveB[i].z;

        float theta = number * dot(d, base.xz) - omega * uWaveTime + phase;
        float s = sin(theta);
        float c = cos(theta);
        float swing = choppy * height;
        float slope = number * height;
        float lean = number * swing;

        offset += vec3(d.x * swing * c, height * s, d.y * swing * c);

        tangentX += vec3(-lean * d.x * d.x * s, slope * d.x * c, -lean * d.x * d.y * s);
        tangentZ += vec3(-lean * d.x * d.y * s, slope * d.y * c, -lean * d.y * d.y * s);

        crest += s * height;
        total += height;
    }

    Surface surface;
    surface.position = base + offset;
    surface.normal = normalize(cross(tangentZ, tangentX));
    surface.crest = clamp(crest / max(total, 0.0001), -1.0, 1.0);

    return surface;
}
`;
