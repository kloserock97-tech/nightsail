import * as THREE from "three";

/* The boat, built by hand out of numbers.
 *
 * There is no model file anywhere in this project, which keeps it honest: nothing to license, nothing
 * to download, and the hull can be reshaped from a slider. The shape is generated the way a real one
 * is drawn — as stations along the length, each with a half-width and a depth — and then the surface
 * is stitched between neighbouring stations.
 *
 * Every vertex is duplicated per triangle so the normals stay flat. Faceted is the point: at this
 * size and against a light that strong, the boat is mostly a silhouette with a few catching planes. */

const STATIONS = 14;
const RINGS = 3;

function hullGeometry({ length, beam, draft, sheer })
{
    const positions = [];
    const rows = [];

    for(let s = 0; s <= STATIONS; s++)
    {
        const t = s / STATIONS;

        /* Fine at the bow, full amidships, cut off square at the stern. */
        const fullness = Math.pow(Math.sin(Math.PI * Math.min(t * 1.06, 1)), 0.62);
        const halfWidth = (beam / 2) * fullness * (t > 0.93 ? 0.82 : 1);
        const depth = draft * Math.pow(Math.sin(Math.PI * Math.min(t * 1.02, 1)), 0.5);

        /* Sheer: the deck line lifts towards bow and stern. It is the single line that stops a boat
           from looking like a bathtub. */
        const rise = sheer * (Math.pow(Math.abs(t - 0.45) * 2.1, 2) * 0.9);
        const x = (t - 0.5) * length;

        const row = [];

        for(let r = 0; r <= RINGS; r++)
        {
            const k = r / RINGS;
            /* From the keel out to the deck edge: the section starts as a V and rounds off at the top. */
            const width = halfWidth * Math.pow(k, 0.72);
            const y = -depth * (1 - k) + rise * k;

            row.push(new THREE.Vector3(x, y, width));
        }

        rows.push(row);
    }

    const push = (a, b, c) =>
    {
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    };

    for(let s = 0; s < STATIONS; s++)
    {
        for(let r = 0; r < RINGS; r++)
        {
            for(const side of [1, -1])
            {
                const p00 = rows[s][r].clone();
                const p10 = rows[s + 1][r].clone();
                const p01 = rows[s][r + 1].clone();
                const p11 = rows[s + 1][r + 1].clone();

                for(const p of [p00, p10, p01, p11]) p.z *= side;

                if(side > 0)
                {
                    push(p00, p10, p11);
                    push(p00, p11, p01);
                }
                else
                {
                    push(p00, p11, p10);
                    push(p00, p01, p11);
                }
            }
        }
    }

    /* Deck: a strip between the two deck edges, so the boat is not an open shell from above. */
    for(let s = 0; s < STATIONS; s++)
    {
        const a = rows[s][RINGS].clone();
        const b = rows[s + 1][RINGS].clone();
        const c = a.clone();
        const d = b.clone();
        c.z *= -1;
        d.z *= -1;

        push(a, b, d);
        push(a, d, c);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    return geometry;
}

export function createBoat(settings)
{
    const group = new THREE.Group();
    const hullMaterial = new THREE.MeshStandardMaterial({ color: settings.hullColor, roughness: 0.85, metalness: 0, flatShading: true });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: settings.trimColor, roughness: 0.6, flatShading: true });

    let hull = new THREE.Mesh(hullGeometry(settings), hullMaterial);
    group.add(hull);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1, 6), trimMaterial);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), trimMaterial);
    boom.rotation.z = Math.PI / 2;

    /* The sail is a single triangle with a bit of belly, which is enough at this distance and keeps
       the silhouette readable against the light. */
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.lineTo(0, 1);
    sailShape.quadraticCurveTo(-0.62, 0.42, -0.72, 0);
    sailShape.lineTo(0, 0);

    const sail = new THREE.Mesh(
        new THREE.ShapeGeometry(sailShape, 12),
        new THREE.MeshStandardMaterial({ color: settings.sailColor, roughness: 0.95, side: THREE.DoubleSide, flatShading: false }),
    );

    /* A lantern on the stern: a tiny additive sphere plus a card of glow, the only warm thing in the
       frame. It is what tells you the boat is crewed. */
    const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 8),
        new THREE.MeshBasicMaterial({ color: settings.lanternColor }),
    );

    const lanternGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: settings.lanternColor,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: glowTexture(),
    }));

    group.add(mast, boom, sail, lantern, lanternGlow);

    function layout()
    {
        const { length, mastHeight, sailSize } = settings;

        mast.scale.y = mastHeight;
        mast.position.set(length * 0.06, mastHeight / 2, 0);

        boom.scale.y = sailSize * 0.78;
        boom.position.set(length * 0.06 - sailSize * 0.36, mastHeight * 0.17, 0);

        sail.scale.set(sailSize, mastHeight * 0.82, 1);
        sail.position.set(length * 0.06, mastHeight * 0.16, 0);
        sail.rotation.y = -Math.PI / 2;

        lantern.position.set(-length * 0.42, 0.24, 0);
        lanternGlow.position.copy(lantern.position);
        lanternGlow.scale.setScalar(settings.lanternGlow);
    }

    function rebuild()
    {
        hull.geometry.dispose();
        hull.geometry = hullGeometry(settings);
        layout();
    }

    function setColors()
    {
        hullMaterial.color.set(settings.hullColor);
        trimMaterial.color.set(settings.trimColor);
        sail.material.color.set(settings.sailColor);
        lantern.material.color.set(settings.lanternColor);
        lanternGlow.material.color.set(settings.lanternColor);
    }

    layout();

    return { group, rebuild, layout, setColors };
}

/* A round gradient, drawn once into a small canvas: cheaper than shipping a PNG and it never 404s. */
function glowTexture()
{
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}
