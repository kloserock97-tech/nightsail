import * as THREE from "three";

/* The light column.
 *
 * Three pieces, all additive and none of them lit: an open cylinder for the shaft, a billboard for
 * the bloom around it, and a small core at the waterline. The shaft fades at its silhouette instead
 * of at its centre — the trick is the same one that makes a glass tube look like a tube: alpha rises
 * where the surface turns away from the viewer, because that is where you are looking through more
 * of it. Facing you straight on you see the least material, so the middle is the faintest part. */

const shaftVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;

void main()
{
    vNormal = normalize(normalMatrix * normal);

    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vView = -view.xyz;
    vHeight = uv.y;

    gl_Position = projectionMatrix * view;
}
`;

const shaftFragment = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uIntensity;
uniform float uSoftness;

varying vec3 vNormal;
varying vec3 vView;
varying float vHeight;

void main()
{
    float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
    float body = pow(clamp(rim, 0.0, 1.0), uSoftness);

    /* Bright where it leaves the water, thinning out as it climbs. */
    float fade = pow(1.0 - clamp(vHeight, 0.0, 1.0), 1.6);

    gl_FragColor = vec4(uColor * uIntensity * body * fade, 1.0);
}
`;

const bloomVertex = /* glsl */ `
varying vec2 vUv;

void main()
{
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const bloomFragment = /* glsl */ `
precision highp float;

uniform vec3 uColor;
uniform float uIntensity;

varying vec2 vUv;

void main()
{
    vec2 offset = (vUv - 0.5) * 2.0;

    /* Squashed along x so the bloom hugs the shaft instead of sitting around it as a ball. */
    float distance = length(offset * vec2(2.2, 1.0));
    float glow = pow(clamp(1.0 - distance, 0.0, 1.0), 2.4);

    gl_FragColor = vec4(uColor * glow * uIntensity, 1.0);
}
`;

export function createPillar(settings)
{
    const group = new THREE.Group();

    const shaftUniforms = {
        uColor: { value: new THREE.Color(settings.pillarColor) },
        uIntensity: { value: settings.pillarIntensity },
        uSoftness: { value: 1.6 },
    };

    const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1, 1, 48, 1, true),
        new THREE.ShaderMaterial({
            vertexShader: shaftVertex,
            fragmentShader: shaftFragment,
            uniforms: shaftUniforms,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        }),
    );

    const bloomUniforms = {
        uColor: { value: new THREE.Color(settings.pillarColor) },
        uIntensity: { value: settings.pillarIntensity },
    };

    const bloom = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
            vertexShader: bloomVertex,
            fragmentShader: bloomFragment,
            uniforms: bloomUniforms,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }),
    );

    const core = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({ color: settings.pillarColor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );

    group.add(bloom, shaft, core);
    group.renderOrder = 4;

    /* The bloom is a flat card, so it has to keep turning to face the camera, and the shaft has to be
       re-sized rather than scaled, so its cap stays a circle. */
    function layout(camera)
    {
        const height = settings.pillarHeight;
        const radius = settings.pillarRadius;

        /* The shaft starts below the waterline. A beam that stops exactly at sea level reads as a
           tube hanging over the water instead of light standing in it. */
        const sunk = 4;
        shaft.scale.set(radius, height + sunk, radius);
        shaft.position.y = (height - sunk) / 2;

        bloom.scale.set(radius * 16, height * 1.15, 1);
        bloom.position.y = height * 0.42;

        /* Just a hot spot where the shaft meets the water, not a lamp sitting on the surface. */
        core.scale.set(radius * 0.62, radius * 0.3, radius * 0.62);
        core.position.y = radius * 0.05;

        if(camera)
        {
            bloom.quaternion.copy(camera.quaternion);
            /* Only the spin around the vertical matters: the card must stay upright. */
            bloom.rotation.x = 0;
            bloom.rotation.z = 0;
        }
    }

    function setColor(color)
    {
        shaftUniforms.uColor.value.set(color);
        bloomUniforms.uColor.value.set(color);
        core.material.color.set(color);
    }

    function setIntensity(intensity, pulse)
    {
        shaftUniforms.uIntensity.value = intensity * pulse;
        bloomUniforms.uIntensity.value = intensity * 0.55 * pulse;
        core.material.opacity = Math.min(1, 0.5 * pulse);
    }

    layout(null);

    return { group, layout, setColor, setIntensity, shaftUniforms };
}
