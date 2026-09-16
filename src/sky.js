import * as THREE from "three/webgpu";
import { equirectUV, positionWorldDirection, texture, uniform, vec3 } from "three/tsl";

/* The sky: an equirect panorama rendered once in Blender Cycles (a light column inside a height-falling
 * haze with torn cloud above it), used as the background and as the reflection in the water.
 *
 * Why a render and not a gradient: the glow around the column is scattering in haze, uneven and brighter
 * near the horizon. Cycles computes that in a minute; a shader would need a dozen hand-tuned terms and
 * still read as airbrush.
 *
 * Why HDR: the sky is one huge, soft ramp from near black to faint grey, and eight bits band it. The water
 * also needs the range, since the glint on a crest is taken straight from the sky.
 *
 * Half float rather than float: RGBA16F is filterable everywhere, RGBA32F only behind an optional
 * WebGPU feature, and without it the panorama silently turns blocky. */

export const SKY_WIDTH = 1024;
export const SKY_HEIGHT = 512;

export function createSky(url)
{
    const settings = {
        intensity: uniform(1),
        /* The panorama has its column at +X; rotation turns it onto the column in the scene. */
        rotation: uniform(0),
    };

    /* The texture exists from the start and stays black until the file arrives: shader nodes are built
       synchronously, the download is not. */
    const map = new THREE.DataTexture(new Uint16Array(SKY_WIDTH * SKY_HEIGHT * 4), SKY_WIDTH, SKY_HEIGHT, THREE.RGBAFormat, THREE.HalfFloatType);
    map.colorSpace = THREE.LinearSRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = false;
    map.needsUpdate = true;

    const sky = { settings, map, loaded: false };

    /* Rotation by hand, not by a matrix: one node, nothing to keep in sync. */
    const orient = (direction) =>
    {
        const cos = settings.rotation.cos();
        const sin = settings.rotation.sin();

        return vec3(direction.x.mul(cos).sub(direction.z.mul(sin)), direction.y, direction.x.mul(sin).add(direction.z.mul(cos)));
    };

    sky.sample = (direction) => texture(map, equirectUV(orient(direction))).rgb.mul(settings.intensity);
    sky.background = () => sky.sample(positionWorldDirection);

    sky.ready = fetch(url)
        .then((response) =>
        {
            if(!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return response.arrayBuffer();
        })
        .then((buffer) =>
        {
            const { width, height, data } = decodeRGBE(buffer);
            if(width !== SKY_WIDTH || height !== SKY_HEIGHT) throw new Error(`panorama is ${width}x${height}`);

            /* Blender writes the zenith in the first row, equirectUV counts v from the nadir: flip rows. */
            const target = map.image.data;

            for(let row = 0; row < height; row++)
            {
                const from = (height - 1 - row) * width * 3;
                const to = row * width * 4;

                for(let column = 0; column < width; column++)
                {
                    const i = from + column * 3;
                    const o = to + column * 4;

                    target[o] = THREE.DataUtils.toHalfFloat(data[i]);
                    target[o + 1] = THREE.DataUtils.toHalfFloat(data[i + 1]);
                    target[o + 2] = THREE.DataUtils.toHalfFloat(data[i + 2]);
                    target[o + 3] = THREE.DataUtils.toHalfFloat(1);
                }
            }

            map.needsUpdate = true;
            sky.loaded = true;
        })
        .catch((error) => console.warn(`Nightsail: the sky did not load (${error.message}), the background stays dark`));

    return sky;
}

/* Radiance .hdr (RGBE) reader.
 *
 * Header, a size line, then scanlines. Old scanlines are RGBE quadruples in a row; new ones (adaptive RLE)
 * start with 2, 2 and the width, and store each channel as its own run-length coded line: a byte over 128
 * is a run of (byte - 128) equal values, otherwise that many literal values follow. */
export function decodeRGBE(buffer)
{
    const bytes = new Uint8Array(buffer);
    let cursor = 0;

    const readLine = () =>
    {
        let line = "";

        while(cursor < bytes.length)
        {
            const byte = bytes[cursor++];
            if(byte === 0x0a) return line;
            line += String.fromCharCode(byte);
        }

        return line;
    };

    if(!readLine().startsWith("#?")) throw new Error("not a Radiance HDR file");

    let format = "";

    while(cursor < bytes.length)
    {
        const line = readLine();
        if(line === "") break;
        if(line.startsWith("FORMAT=")) format = line.slice(7).trim();
    }

    if(format && format !== "32-bit_rle_rgbe") throw new Error(`unsupported format ${format}`);

    const size = readLine().trim().match(/^-Y\s+(\d+)\s+\+X\s+(\d+)$/);
    if(!size) throw new Error("only -Y +X scanline order is supported");

    const height = Number.parseInt(size[1], 10);
    const width = Number.parseInt(size[2], 10);
    const data = new Float32Array(width * height * 3);
    const scanline = new Uint8Array(width * 4);

    for(let y = 0; y < height; y++)
    {
        const rle = width >= 8 && width < 32768 && bytes[cursor] === 2 && bytes[cursor + 1] === 2 && ((bytes[cursor + 2] << 8) | bytes[cursor + 3]) === width;

        if(rle)
        {
            cursor += 4;

            for(let channel = 0; channel < 4; channel++)
            {
                let x = 0;

                while(x < width)
                {
                    const count = bytes[cursor++];

                    if(count > 128)
                    {
                        const value = bytes[cursor++];
                        for(let i = 0; i < count - 128; i++) scanline[(x++) * 4 + channel] = value;
                    }
                    else
                    {
                        for(let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = bytes[cursor++];
                    }
                }
            }
        }
        else
        {
            scanline.set(bytes.subarray(cursor, cursor + width * 4));
            cursor += width * 4;
        }

        for(let x = 0; x < width; x++)
        {
            const exponent = scanline[x * 4 + 3];
            /* Exponent zero is black, not 2^-136. */
            const scale = exponent === 0 ? 0 : Math.pow(2, exponent - 136);
            const target = (y * width + x) * 3;

            data[target] = scanline[x * 4] * scale;
            data[target + 1] = scanline[x * 4 + 1] * scale;
            data[target + 2] = scanline[x * 4 + 2] * scale;
        }
    }

    return { width, height, data };
}
