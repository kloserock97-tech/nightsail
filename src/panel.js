/* The panel, the address bar and the presets, from one list.
 *
 * Every tunable value is one row: a path, the thing that holds it, a range. The panel is built from the
 * rows, presets are partial maps of paths, and whatever differs from the defaults goes into the hash, so a
 * night you liked can be sent as a link and comes back exactly. */

const PRESETS = {
    night: {},
    storm: {
        "sea.amplitude": 1.7, "sea.sharpness": 2.3, "sea.foamAmount": 0.85, "sea.glint": 1.2, "sea.mist": 0.22,
        "core.rate": 0.6, "core.flow": 4.2, "threads.amount": 0.75, "threads.speed": 0.34,
        "dust.speed": 0.05, "dust.swirl": 1.2, "shards.drift": 4.6, "column.intensity": 0.5, "sea.tideHeight": 2.3, "sea.tidePeriod": 11,
    },
    calm: {
        "sea.amplitude": 0.42, "sea.sharpness": 1.2, "sea.foamAmount": 0.08, "sea.ripple": 0.6, "sea.glint": 2.3, "sea.gloss": 170,
        "core.rate": 0.18, "core.flow": 1.4, "threads.amount": 0.28, "threads.speed": 0.08, "shards.drift": 1.1, "dust.speed": 0.008,
    },
    ember: {
        "light.color": "#ffb27a", "lens.tint": "#ffc9a0", "air.mistColor": "#c9a58c", "air.fogColor": "#0a0605",
        "air.skyTop": "#070403", "air.skyBottom": "#120a07", "air.panorama": 0.75,
        "sea.deep": "#0f0b09", "sea.crest": "#2a221d", "sea.sssColor": "#6b4a36", "sea.foam": "#e6d6c8",
    },
    ghost: {
        "column.intensity": 1, "halo.intensity": 0.35, "threads.amount": 1.2, "threads.spark": 1.8,
        "core.size": 0.34, "lens.bloom": 0.5, "lens.flare": 0.2, "shards.light": 0.5, "statue.brightness": 1.2,
    },
};

const LABELS = {
    time: "Time", statue: "Statue", light: "Light", column: "Column", halo: "Halo", core: "Core sparks", threads: "Threads",
    dust: "Dust", shards: "Shards", sea: "Sea", air: "Sky and air", lens: "Lens", view: "View",
};

export function buildPanel(ctx)
{
    const { gui, clock, lens, view, tuned, air, ocean, light, sparks, flow, debris, statue, post, controls, toast } = ctx;

    const u = (uniform) => ({ get: () => uniform.value, set: (v) => { uniform.value = v; } });
    const c = (uniform) => ({ get: () => `#${uniform.value.getHexString()}`, set: (v) => { uniform.value.set(v); }, color: true });
    const o = (object, key, after) => ({ get: () => object[key], set: (v) => { object[key] = v; after?.(); } });

    const st = statue.settings;
    const refit = () => statue.fit();

    /* folder, name, accessor, min, max, step */
    const rows = [
        ["time", "speed", o(clock, "speed"), 0, 3, 0.01],

        ["statue", "height", o(st, "height", refit), 5, 80, 0.5],
        ["statue", "top", o(st, "top"), -12, 20, 0.05],
        ["statue", "x", o(st, "x"), -40, 40, 0.1],
        ["statue", "z", o(st, "z"), -40, 40, 0.1],
        ["statue", "turn", o(st, "turn", refit), -180, 180, 1],
        ["statue", "lean", o(st, "lean", refit), -45, 45, 0.5],
        ["statue", "brightness", o(st, "brightness"), 0, 3, 0.01],
        ["statue", "wetDarken", u(statue.uniforms.wetDarken), 0, 1, 0.01],
        ["statue", "wetReach", o(st, "wetReach"), 0, 4, 0.01],
        ["statue", "dryTime", o(st, "dryTime"), 0.2, 30, 0.1],
        ["statue", "foam", u(statue.uniforms.foam), 0, 2, 0.01],

        ["light", "color", c(light.color)],
        ["light", "onStatue", o(tuned, "coreLight"), 0, 4000, 10],
        ["light", "moon", o(tuned, "moon"), 0, 6, 0.01],
        ["light", "ambient", o(tuned, "ambient"), 0, 3, 0.01],

        ["column", "intensity", o(tuned, "beam"), 0, 3, 0.01],
        ["column", "sharpness", u(light.beam.sharpness), 0.5, 12, 0.05],
        ["column", "groundWidth", u(light.beam.groundWidth), 0.05, 1, 0.005],
        ["column", "coreWidth", u(light.beam.coreWidth), 0.005, 0.4, 0.001],
        ["column", "topWidth", u(light.beam.topWidth), 0.005, 0.4, 0.001],
        ["column", "fallDown", u(light.beam.fallDown), 0, 8, 0.05],
        ["column", "fallUp", u(light.beam.fallUp), 0, 12, 0.05],
        ["column", "texture", u(light.beam.texture), 0, 1, 0.01],

        ["halo", "intensity", o(tuned, "halo"), 0, 3, 0.01],
        ["halo", "size", o(light.halo, "size"), 4, 120, 1],
        ["halo", "tight", u(light.halo.tight), 2, 80, 0.5],
        ["halo", "wide", u(light.halo.wide), 0.5, 20, 0.05],
        ["halo", "wideAmount", u(light.halo.wideAmount), 0, 1, 0.01],

        ["core", "rate", u(sparks.core.rate), 0.02, 2, 0.01],
        ["core", "radius", u(sparks.core.radius), 0.3, 8, 0.05],
        ["core", "expand", u(sparks.core.expand), 0, 4, 0.01],
        ["core", "burst", u(sparks.core.burst), 0, 30, 0.1],
        ["core", "sink", u(sparks.core.sink), 0, 30, 0.1],
        ["core", "size", u(sparks.core.size), 0.02, 1.5, 0.01],
        ["core", "stretch", u(sparks.core.stretch), 0.2, 3, 0.01],
        ["core", "ragged", u(sparks.core.ragged), 0, 2, 0.01],
        ["core", "flow", u(sparks.core.flow), 0, 10, 0.05],
        ["core", "flowScale", u(sparks.core.flowScale), 0.01, 1, 0.005],
        ["core", "flowSpeed", u(sparks.core.flowSpeed), 0, 3, 0.01],

        ["threads", "amount", u(flow.settings.amount), 0, 3, 0.01],
        ["threads", "width", u(flow.settings.width), 0.005, 0.2, 0.001],
        ["threads", "speed", u(flow.settings.speed), 0, 1.5, 0.005],
        ["threads", "spark", u(flow.settings.spark), 0, 4, 0.01],
        ["threads", "sharpness", u(flow.settings.sharpness), 1, 80, 0.5],
        ["threads", "base", u(flow.settings.base), 0, 0.5, 0.005],
        ["threads", "split", u(flow.settings.split), 0, 1.5, 0.01],

        ["dust", "speed", u(sparks.dust.speed), 0, 0.3, 0.001],
        ["dust", "radius", u(sparks.dust.radius), 1, 60, 0.5],
        ["dust", "waist", u(sparks.dust.waist), 0.2, 20, 0.1],
        ["dust", "height", u(sparks.dust.height), 5, 100, 0.5],
        ["dust", "base", u(sparks.dust.base), 0, 40, 0.5],
        ["dust", "size", u(sparks.dust.size), 0.02, 1.5, 0.01],
        ["dust", "swirl", u(sparks.dust.swirl), 0, 4, 0.01],
        ["dust", "reach", u(sparks.dust.reach), 2, 80, 0.5],

        ["shards", "drift", u(debris.settings.drift), 0, 8, 0.01],
        ["shards", "spin", u(debris.settings.spin), 0, 2, 0.01],
        ["shards", "light", u(debris.settings.light), 0, 2, 0.01],
        ["shards", "dark", u(debris.settings.dark), 0, 0.5, 0.005],

        ["sea", "tideHeight", o(ocean.tide, "height"), 0, 8, 0.05],
        ["sea", "tidePeriod", o(ocean.tide, "period"), 2, 60, 0.5],
        ["sea", "amplitude", u(ocean.settings.amplitude), 0, 3, 0.01],
        ["sea", "sharpness", u(ocean.settings.sharpness), 1, 5, 0.05],
        ["sea", "deep", c(ocean.settings.deep)],
        ["sea", "crest", c(ocean.settings.crest)],
        ["sea", "reflect", u(ocean.settings.reflect), 0, 1, 0.01],
        ["sea", "ripple", u(ocean.settings.ripple), 0, 4, 0.01],
        ["sea", "sss", u(ocean.settings.sss), 0, 3, 0.01],
        ["sea", "sssColor", c(ocean.settings.sssColor)],
        ["sea", "foam", c(ocean.settings.foam)],
        ["sea", "foamStart", u(ocean.settings.foamStart), 0, 2, 0.01],
        ["sea", "foamAmount", u(ocean.settings.foamAmount), 0, 1, 0.01],
        ["sea", "glint", u(ocean.settings.glint), 0, 4, 0.01],
        ["sea", "gloss", u(ocean.settings.gloss), 4, 300, 1],
        ["sea", "glow", u(ocean.settings.glow), 0, 1, 0.01],
        ["sea", "mist", u(ocean.settings.mist), 0, 1, 0.01],
        ["sea", "mistCeiling", u(ocean.settings.mistCeiling), 0.1, 6, 0.05],

        ["air", "panorama", o(tuned, "sky"), 0, 1, 0.01],
        ["air", "skyTop", c(air.skyTop)],
        ["air", "skyBottom", c(air.skyBottom)],
        ["air", "fogNear", u(air.fogNear), 0, 200, 1],
        ["air", "fogFar", u(air.fogFar), 10, 400, 1],
        ["air", "fogColor", c(air.fogColor)],
        ["air", "scatter", o(tuned, "scatter"), 0, 2, 0.01],
        ["air", "scatterRadius", u(air.scatterRadius), 2, 80, 0.5],
        ["air", "mistColor", c(air.mistColor)],
        ["air", "mistRadius", u(air.mistRadius), 5, 160, 1],

        ["lens", "bloom", u(post.bloom.strength), 0, 2, 0.01],
        ["lens", "bloomThreshold", u(post.bloom.threshold), 0, 2, 0.01],
        ["lens", "flare", o(lens, "flare"), 0, 1, 0.005],
        ["lens", "flareSpread", o(lens, "spread"), 0, 1, 0.01],
        ["lens", "tint", c(post.flare.tint)],
        ["lens", "bandStart", u(post.band.start), 0, 0.5, 0.005],
        ["lens", "bandEnd", u(post.band.end), 0.05, 1, 0.005],
        ["lens", "bandBlur", u(post.band.amount), 0, 0.02, 0.0001],

        ["view", "fov", o(view, "fov"), 10, 70, 0.5],
        ["view", "drift", o(view, "drift"), 0, 3, 0.01],
        ["view", "autoRotate", o(view, "autoRotate")],
        ["view", "rotateSpeed", o(controls, "autoRotateSpeed"), -3, 3, 0.01],
    ];

    const entries = rows.map(([folder, name, access, min, max, step]) => ({ path: `${folder}.${name}`, folder, name, access, min, max, step }));
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const defaults = new Map(entries.map((entry) => [entry.path, entry.access.get()]));

    const proxy = {};
    const folders = new Map();
    const state = { preset: "night" };

    const actions = {
        paused: clock.paused,
        copyLink: async () =>
        {
            try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
            catch { toast("Copy failed, the address bar has it"); }
        },
        copySettings: async () =>
        {
            const values = Object.fromEntries(entries.map((entry) => [entry.path, entry.access.get()]));
            try { await navigator.clipboard.writeText(JSON.stringify(values, null, 2)); toast("Settings copied"); }
            catch { toast("Copy failed"); }
        },
        resetView: () => { controls.target.set(0, 10, 8); ctx.camera.position.set(0, 22, -112); controls.update(); },
        reset: () => applyPreset("night"),
    };

    gui.add(state, "preset", Object.keys(PRESETS)).name("preset").onChange((name) => applyPreset(name));

    for(const entry of entries)
    {
        const label = LABELS[entry.folder];
        if(!folders.has(label)) folders.set(label, gui.addFolder(label).close());
        const folder = folders.get(label);

        proxy[entry.path] = entry.access.get();

        let controller;
        if(entry.access.color) controller = folder.addColor(proxy, entry.path);
        else if(entry.access.options) controller = folder.add(proxy, entry.path, entry.access.options);
        else if(typeof proxy[entry.path] === "boolean") controller = folder.add(proxy, entry.path);
        else controller = folder.add(proxy, entry.path, entry.min, entry.max, entry.step);

        controller.name(entry.name).onChange((value) =>
        {
            entry.access.set(value);
            saveSoon();
        });
    }

    gui.add(actions, "paused").name("freeze time").onChange((v) => { clock.paused = v; });
    gui.add(actions, "copyLink").name("copy link to this night");
    gui.add(actions, "copySettings").name("copy settings as JSON");
    gui.add(actions, "resetView").name("reset camera");
    gui.add(actions, "reset").name("reset everything");

    folders.get("Statue").open();

    function sync()
    {
        for(const entry of entries) proxy[entry.path] = entry.access.get();
        actions.paused = clock.paused;
        for(const controller of gui.controllersRecursive()) controller.updateDisplay();
    }

    function applyPreset(name)
    {
        for(const entry of entries) entry.access.set(defaults.get(entry.path));
        for(const [path, value] of Object.entries(PRESETS[name] ?? {})) byPath.get(path)?.access.set(value);
        state.preset = name;
        sync();
        saveSoon();
    }

    let timer = 0;
    function saveSoon()
    {
        clearTimeout(timer);
        timer = setTimeout(writeHash, 250);
    }

    function writeHash()
    {
        const params = new URLSearchParams();
        if(state.preset !== "night") params.set("preset", state.preset);

        const base = new Map(defaults);
        for(const [path, value] of Object.entries(PRESETS[state.preset] ?? {})) base.set(path, value);

        for(const entry of entries)
        {
            const value = entry.access.get();
            const reference = base.get(entry.path);

            if(typeof value === "number")
            {
                if(Math.abs(value - reference) > 1e-6) params.set(entry.path, String(Math.round(value * 10000) / 10000));
            }
            else if(typeof value === "boolean")
            {
                if(value !== reference) params.set(entry.path, value ? "1" : "0");
            }
            else if(String(value).toLowerCase() !== String(reference).toLowerCase())
            {
                params.set(entry.path, String(value).replace(/^#/, ""));
            }
        }

        if(/webgl/i.test(location.hash)) params.set("webgl", "1");

        const hash = params.toString();
        history.replaceState(null, "", hash ? `#${hash}` : location.pathname + location.search);
    }

    function readHash()
    {
        const params = new URLSearchParams(location.hash.replace(/^#/, ""));
        const preset = params.get("preset");
        if(preset && PRESETS[preset]) applyPreset(preset);

        for(const [path, raw] of params)
        {
            const entry = byPath.get(path);
            if(!entry) continue;

            const fallback = defaults.get(path);

            if(entry.access.color) { if(/^[0-9a-f]{6}$/i.test(raw)) entry.access.set(`#${raw}`); }
            else if(entry.access.options) { if(entry.access.options.includes(raw)) entry.access.set(raw); }
            else if(typeof fallback === "boolean") entry.access.set(raw === "1");
            else { const value = Number(raw); if(Number.isFinite(value)) entry.access.set(value); }
        }

        sync();
    }

    readHash();

    if(innerWidth < 720) gui.close();

    return { sync };
}
