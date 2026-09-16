import * as THREE from "three";

/* The sky is a box the camera sits inside, painted by hand: a vertical gradient, a soft bloom where
   the light column stands, and stars that fade out near the horizon where the haze is thickest.
   No texture, no cubemap — it is four colours and a couple of curves. */

const vertexShader = /* glsl */ `
varying vec3 vDirection;

void main()
{
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlowColor;
uniform vec3 uGlowDirection;
uniform float uGlow;
uniform float uStars;
uniform float uTime;

varying vec3 vDirection;

float hash(vec3 p)
{
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;

    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main()
{
    vec3 direction = normalize(vDirection);
    float height = clamp(direction.y, -1.0, 1.0);

    /* Most of the interesting colour lives in the first few degrees above the horizon, so the
       gradient is pushed hard into that band instead of spreading evenly across the dome. */
    vec3 color = mix(uHorizon, uTop, pow(clamp(height, 0.0, 1.0), 0.45));

    /* Below the horizon the sky keeps going, dimmer: the water reads its colour from here. */
    color = mix(color, uHorizon * 0.65, smoothstep(0.0, -0.25, height));

    float toGlow = max(dot(direction, normalize(uGlowDirection)), 0.0);
    color += uGlowColor * uGlow * (pow(toGlow, 18.0) * 0.55 + pow(toGlow, 3.0) * 0.12);

    /* Stars: a sparse hash on a coarse grid, twinkling slowly, gone near the horizon. */
    if(uStars > 0.001 && height > 0.02)
    {
        /* Finer grid, and the star is placed inside its cell rather than filling it, so they read as
           points instead of as pixels of a texture. */
        vec3 scaled = direction * 700.0;
        vec3 cell = floor(scaled);
        float star = hash(cell);

        vec3 jitter = vec3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 11.3));
        float distance = length(fract(scaled) - jitter);

        float spark = step(0.9988, star) * smoothstep(0.55, 0.0, distance);
        float twinkle = 0.65 + 0.35 * sin(uTime * 2.0 + star * 90.0);

        color += vec3(spark * twinkle * uStars * smoothstep(0.02, 0.35, height));
    }

    gl_FragColor = vec4(color, 1.0);
}
`;

export function createSky(settings)
{
    const uniforms = {
        uTop: { value: new THREE.Color(settings.skyTop) },
        uHorizon: { value: new THREE.Color(settings.horizon) },
        uGlowColor: { value: new THREE.Color(settings.pillarColor) },
        uGlowDirection: { value: new THREE.Vector3(0, 0.1, -1) },
        uGlow: { value: settings.pillarGlow },
        uStars: { value: settings.stars },
        uTime: { value: 0 },
    };

    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(2000, 32, 16),
        new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, side: THREE.BackSide, depthWrite: false }),
    );

    mesh.frustumCulled = false;
    mesh.renderOrder = -1;

    return { mesh, uniforms };
}
