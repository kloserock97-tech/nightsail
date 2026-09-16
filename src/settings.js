/* Everything that makes the scene look the way it looks, in one object.
 *
 * The panel writes whatever differs from these defaults into the address bar, so a version of the
 * night you liked can be sent as a link and it will come back exactly. */

export const DEFAULTS = {
    /* sea */
    wind: 0.6,
    wavelength: 16,
    amplitude: 0.55,
    steepness: 0.9,
    spread: 0.55,
    waveSpeed: 1,

    /* water surface */
    deep: "#040d16",
    shallow: "#0d2b3d",
    foam: "#cfe6f2",
    foamAmount: 0.45,
    glossiness: 0.72,
    reflection: 1,
    fogDensity: 0.012,

    /* sky */
    skyTop: "#04070f",
    horizon: "#132234",
    stars: 0.55,

    /* the light */
    pillarColor: "#8fd0ff",
    pillarHeight: 42,
    pillarRadius: 1.5,
    pillarIntensity: 1.5,
    pillarGlow: 1.05,
    pillarReach: 26,
    pillarPulse: 0.12,

    /* the boat */
    length: 5.2,
    beam: 1.7,
    draft: 0.75,
    sheer: 0.55,
    mastHeight: 4.2,
    sailSize: 2.3,
    hullColor: "#191b1f",
    trimColor: "#2c2a26",
    sailColor: "#cdd3d8",
    lanternColor: "#ffb469",
    lanternGlow: 1.6,
    boatSpeed: 0.055,
    pathRadius: 26,

    /* the air */
    moteCount: 1200,
    moteSize: 0.03,
    moteDrift: 1.4,
    moteColor: "#bfe4ff",
    moteOpacity: 0.5,

    /* the view */
    exposure: 1.15,
    autoOrbit: true,
    orbitSpeed: 0.18,
    paused: false,
};

export const PRESETS = {
    night: {},
    dawn: {
        skyTop: "#1d4a73", horizon: "#d4977a", deep: "#0b1a2a", shallow: "#24475f", foam: "#ffe6cf",
        pillarColor: "#ffe2b8", stars: 0.08, fogDensity: 0.011, reflection: 0.3, moteColor: "#ffd9b0", exposure: 0.95,
    },
    storm: {
        skyTop: "#0a0d12", horizon: "#2b3440", deep: "#06090d", shallow: "#1b2730", foam: "#e6eef3",
        amplitude: 1.15, wavelength: 13, steepness: 1.25, waveSpeed: 1.5, foamAmount: 0.85,
        pillarColor: "#a8c4e8", pillarIntensity: 1.1, stars: 0.05, moteCount: 1600, moteDrift: 3.2,
    },
    beacon: {
        pillarColor: "#ff7a4d", pillarIntensity: 2.2, pillarRadius: 2.2, pillarReach: 30,
        deep: "#0a0a12", shallow: "#221a26", horizon: "#241a22", skyTop: "#06060c",
        moteColor: "#ffb894", lanternColor: "#ffe0a8",
    },
    ice: {
        pillarColor: "#c9fff2", deep: "#061418", shallow: "#14424a", horizon: "#1d3b44",
        skyTop: "#030a0c", foam: "#ffffff", foamAmount: 0.7, moteColor: "#dffffa", stars: 0.75,
    },
};

const KEYS = {
    wind: "wd", wavelength: "wl", amplitude: "am", steepness: "st", spread: "sr", waveSpeed: "ws",
    deep: "dp", shallow: "sh", foam: "fm", foamAmount: "fa", glossiness: "gl", reflection: "rf", fogDensity: "fd",
    skyTop: "sk", horizon: "hz", stars: "sa",
    pillarColor: "pc", pillarHeight: "ph", pillarRadius: "pr", pillarIntensity: "pi", pillarGlow: "pg",
    pillarReach: "pe", pillarPulse: "pp",
    length: "bl", beam: "bb", draft: "bd", sheer: "bs", mastHeight: "bm", sailSize: "bz",
    hullColor: "hc", trimColor: "tc", sailColor: "sc", lanternColor: "lc", lanternGlow: "lg",
    boatSpeed: "bv", pathRadius: "bp",
    moteCount: "mc", moteSize: "ms", moteDrift: "md", moteColor: "mo", moteOpacity: "mp",
    exposure: "ex", autoOrbit: "ao", orbitSpeed: "os", paused: "pa",
};

const FROM_KEY = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [key, name]));

export function readUrl()
{
    const out = {};
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));

    for(const [key, raw] of params)
    {
        const name = FROM_KEY[key];
        if(name === undefined) continue;

        const fallback = DEFAULTS[name];

        if(typeof fallback === "number") { const value = Number(raw); if(Number.isFinite(value)) out[name] = value; }
        else if(typeof fallback === "boolean") out[name] = raw === "1";
        else if(/^#?[0-9a-f]{3,8}$/i.test(raw)) out[name] = raw.startsWith("#") ? raw : `#${raw}`;
    }

    return out;
}

export function writeUrl(settings)
{
    const params = new URLSearchParams();

    for(const [name, key] of Object.entries(KEYS))
    {
        const value = settings[name];
        if(value === DEFAULTS[name]) continue;

        if(typeof value === "boolean") params.set(key, value ? "1" : "0");
        else if(typeof value === "number") params.set(key, String(Math.round(value * 1000) / 1000));
        else params.set(key, String(value).replace(/^#/, ""));
    }

    const hash = params.toString();
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
}
