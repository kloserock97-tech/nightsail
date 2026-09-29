/* A curl-noise velocity field on the CPU.
 *
 * Three smooth scalar noises form a vector potential; the velocity is its curl, taken by central
 * differences. A curl has zero divergence by construction, so the flow has no sources and no sinks:
 * particles in it do not clump and do not drain away, they wind into threads like smoke. The technique
 * is well known (Bridson et al., 2007); this implementation is deliberately cheap: value noise over an
 * integer hash, good enough for a few thousand sparks a frame. */

const STEP = 0.6;
const INV = 1 / (2 * STEP);

const lerp = (a, b, t) => a + (b - a) * t;

// Hash Kit (our own hash, see shelf/items/hash-kit)
const SALT = 0xb31c96c9;

function hashU(x)
{
    x ^= x >>> 16; x = Math.imul(x, 0x3f9c86cb);
    x ^= x >>> 14; x = Math.imul(x, 0x1ae9dacf);
    x ^= x >>> 15;
    return x >>> 0;
}
const hash3U = (x, y, z) => hashU((x + hashU((y + hashU((z + SALT) >>> 0)) >>> 0)) >>> 0);
const hashUnit = (h) => (h >>> 8) / 16777216;

/* A lattice value in -1…1. The three channels of the potential are successive mixes of one cell hash,
   so they do not follow each other. */
function hash(i, j, k, channel)
{
    let h = hash3U(i, j, k);
    for(let c = 0; c < channel; c++) h = hashU(h);
    return hashUnit(h) * 2 - 1;
}

/* Smooth value noise. It has to be smooth: the curl is made of derivatives, and a raw hash has none. */
function noise(x, y, z, channel)
{
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const face = (k) => lerp(
        lerp(hash(xi, yi, k, channel), hash(xi + 1, yi, k, channel), u),
        lerp(hash(xi, yi + 1, k, channel), hash(xi + 1, yi + 1, k, channel), u),
        v,
    );

    return lerp(face(zi), face(zi + 1), w);
}

const potential = (x, y, z, axis) => noise(x, y, z, axis);

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
