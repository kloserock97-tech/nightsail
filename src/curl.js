/* A curl-noise velocity field on the CPU.
 *
 * Three smooth scalar noises form a vector potential; the velocity is its curl, taken by central
 * differences. A curl has zero divergence by construction, so the flow has no sources and no sinks:
 * particles in it do not clump and do not drain away, they wind into threads like smoke. The technique
 * is well known (Bridson et al., 2007); this implementation is deliberately cheap: value noise over a
 * sine hash, good enough for a few thousand sparks a frame. */

const STEP = 0.6;
const INV = 1 / (2 * STEP);

const lerp = (a, b, t) => a + (b - a) * t;

function hash(i, j, k, seed)
{
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

/* Smooth value noise. It has to be smooth: the curl is made of derivatives, and a raw hash has none. */
function noise(x, y, z, seed)
{
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const face = (k) => lerp(
        lerp(hash(xi, yi, k, seed), hash(xi + 1, yi, k, seed), u),
        lerp(hash(xi, yi + 1, k, seed), hash(xi + 1, yi + 1, k, seed), u),
        v,
    );

    return lerp(face(zi), face(zi + 1), w);
}

const potential = (x, y, z, axis) => noise(x, y, z, axis * 137.13);

export function curl(x, y, z, out)
{
    const dPzdy = potential(x, y + STEP, z, 2) - potential(x, y - STEP, z, 2);
    const dPydz = potential(x, y, z + STEP, 1) - potential(x, y, z - STEP, 1);
    const dPxdz = potential(x, y, z + STEP, 0) - potential(x, y, z - STEP, 0);
    const dPzdx = potential(x + STEP, y, z, 2) - potential(x - STEP, y, z, 2);
    const dPydx = potential(x + STEP, y, z, 1) - potential(x - STEP, y, z, 1);
    const dPxdy = potential(x, y + STEP, z, 0) - potential(x, y - STEP, z, 0);

    return out.set((dPzdy - dPydz) * INV, (dPxdz - dPzdx) * INV, (dPydx - dPxdy) * INV);
}
