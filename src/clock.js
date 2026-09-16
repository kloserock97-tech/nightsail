import { uniform } from "three/tsl";

/* One clock for the whole scene.
 *
 * Two readings of the same time. `elapsed` is plain seconds and drives everything computed on the CPU
 * (particles, debris, the boat, the camera drift). `shader` runs twice as fast and feeds the GPU side
 * (waves, the beam texture, the flow heads): the look was tuned with that ratio and
 * halving it makes the sea read as syrup. The ocean's CPU sampler reads `shaderSeconds`, so the boat
 * and the water it rides always agree. */

export const SHADER_RATE = 2;

export function createClock()
{
    const clock = {
        elapsed: 0,
        delta: 0,
        shaderSeconds: 0,
        shader: uniform(0),
        speed: 1,
        paused: false,
        last: performance.now(),

        tick()
        {
            const now = performance.now();
            const raw = Math.min((now - clock.last) / 1000, 0.1);
            clock.last = now;

            clock.delta = clock.paused ? 0 : raw * clock.speed;
            clock.elapsed += clock.delta;
            clock.shaderSeconds = clock.elapsed * SHADER_RATE;
            clock.shader.value = clock.shaderSeconds;
        },
    };

    return clock;
}

