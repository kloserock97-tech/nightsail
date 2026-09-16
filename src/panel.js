/* The panel, the address bar and the presets, from one list.
 *
 * Every tunable number is one row: a path, the object that holds it, a range. The panel is built from the
 * rows, presets are partial maps of paths, and whatever differs from the defaults is written into the
 * hash, so a night you liked can be sent as a link and comes back exactly. */

const PRESETS = {
    night: {},
    storm: {
        "sea.amplitude": 1.7, "sea.sharpness": 2.3, "sea.foamAmount": 0.85, "sea.glint": 1.2, "sea.mist": 0.22,
        "core.rate": 0.6, "core.flow": 4.2, "threads.amount": 0.75, "threads.speed": 0.34,
        "dust.speed": 0.05, "dust.swirl": 1.2, "debris.drift": 4.6, "beam.intensity": 0.5,
    },
    calm: {
        "sea.amplitude": 0.42, "sea.sharpness": 1.2, "sea.foamAmount": 0.08, "sea.ripple": 0.6, "sea.glint": 2.3, "sea.gloss": 170,
        "core.rate": 0.18, "core.flow": 1.4, "threads.amount": 0.28, "threads.speed": 0.08, "debris.drift": 1.1, "dust.speed": 0.008,
    },
    ember: {
        "light.color": "#ffb27a", "lens.tint": "#ffc9a0", "air.mistColor": "#c9a58c", "air.fogColor": "#0a0605",
        "air.skyTop": "#070403", "air.skyBottom": "#120a07", "sky.intensity": 0.75,
        "sea.deep": "#0f0b09", "sea.crest": "#2a221d", "sea.sssColor": "#6b4a36", "sea.foam": "#e6d6c8",
    },
    ghost: {
        "beam.intensity": 1, "halo.intensity": 0.35, "threads.amount": 1.2, "threads.spark": 1.8,
        "core.size": 0.34, "lens.bloom": 0.5, "lens.flare": 0.2, "debris.light": 0.5,
    },
};

export function buildPanel(ctx)
{
    const { gui, clock, intro, frame, lens, view, tuned, air, sky, ocean, light, sparks, flow, debris, bubble, boat, post } = ctx;

    const u = (uniform) => ({ get: () => uniform.value, set: (v) => { uniform.value = v; } });
    const c = (uniform) => ({ get: () => `#${uniform.value.getHexString()}`, set: (v) => { uniform.value.set(v); }, color: true });
    const o = (object, key) => ({ get: () => object[key], set: (v) => { object[key] = v; } });

    /* folder, name, accessor, min, max, step */
    const rows = [
        ["journey", "progress", o(intro, "target"), 0, 1, 0.001],
        ["journey", "wheelStep", o(intro, "step"), 0.005, 0.2, 0.005],
        ["journey", "smoothing", o(intro, "ease"), 0.01, 0.3, 0.005],
        ["journey", "timeScale", o(clock, "speed"), 0, 3, 0.01],

        ["bubble", "frequency", u(bubble.settings.frequency), 0.05, 1.2, 0.005],
        ["bubble", "speed", u(bubble.settings.speed), 0, 60, 0.1],
        ["bubble", "spray", u(bubble.settings.spray), -0.8, 1.2, 0.01],
        ["bubble", "fstop", u(bubble.settings.fstop), 0.8, 16, 0.05],
        ["bubble", "grain", u(bubble.settings.grain), 0.0005, 0.02, 0.0001],
        ["bubble", "opacity", o(frame, "opacity"), 0, 1.5, 0.01],
        ["bubble", "distance", o(frame, "distance"), 3, 25, 0.1],
        ["bubble", "radiusStart", o(frame, "radiusStart"), 0.2, 3, 0.01],
        ["bubble", "radiusEnd", o(frame, "radiusEnd"), 0.3, 6, 0.01],
        ["bubble", "focusShift", o(frame, "focusShift"), -1.5, 1.5, 0.01],

        ["light", "color", c(light.color)],
        ["beam", "intensity", o(tuned, "beam"), 0, 3, 0.01],
        ["beam", "sharpness", u(light.beam.sharpness), 0.5, 12, 0.05],
        ["beam", "groundWidth", u(light.beam.groundWidth), 0.05, 1, 0.005],
        ["beam", "coreWidth", u(light.beam.coreWidth), 0.005, 0.4, 0.001],
        ["beam", "topWidth", u(light.beam.topWidth), 0.005, 0.4, 0.001],
        ["beam", "fallDown", u(light.beam.fallDown), 0, 8, 0.05],
        ["beam", "fallUp", u(light.beam.fallUp), 0, 12, 0.05],
        ["beam", "texture", u(light.beam.texture), 0, 1, 0.01],
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

        ["debris", "drift", u(debris.settings.drift), 0, 8, 0.01],
        ["debris", "spin", u(debris.settings.spin), 0, 2, 0.01],
        ["debris", "light", u(debris.settings.light), 0, 2, 0.01],
        ["debris", "dark", u(debris.settings.dark), 0, 0.5, 0.005],

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

        ["air", "skyTop", c(air.skyTop)],
        ["air", "skyBottom", c(air.skyBottom)],
        ["sky", "intensity", u(sky.settings.intensity), 0, 3, 0.01],
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
        ["lens", "bandStart", o(lens, "bandStart"), 0, 0.5, 0.005],
        ["lens", "bandEnd", u(post.band.end), 0.05, 1, 0.005],
        ["lens", "bandBlur", u(post.band.amount), 0, 0.02, 0.0001],

        ["camera", "drift", o(view, "drift"), 0, 3, 0.01],
        ["camera", "headTilt", o(boat, "headTilt"), -1.2, 1.2, 0.01],
    ];

    const entries = rows.map(([folder, name, access, min, max, step]) => ({ path: `${folder}.${name}`, folder, name, access, min, max, step }));
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const defaults = new Map(entries.map((entry) => [entry.path, entry.access.get()]));

    const proxy = {};
    const controllers = [];
    const folders = new Map();
    const LABELS = { journey: "Journey", bubble: "Bubble", light: "Light", beam: "Column", halo: "Halo", core: "Core sparks", threads: "Threads", dust: "Dust", debris: "Shards", sea: "Sea", air: "Air", sky: "Air", lens: "Lens", camera: "Camera" };

    const state = { preset: "night" };
    const actions = {
        replay: () => { ctx.replay(); sync(); },
        toSea: () => { intro.target = 1; sync(); },
        paused: clock.paused,
        copyLink: () => navigator.clipboard?.writeText(location.href).then(() => toast("Link copied")),
        reset: () => applyPreset("night"),
    };

    const top = gui;
    top.add(state, "preset", Object.keys(PRESETS)).name("preset").onChange((name) => applyPreset(name));
    top.add(actions, "replay").name("replay the bubble");
    top.add(actions, "toSea").name("skip to the sea");
    top.add(actions, "paused").name("freeze time").onChange((v) => { clock.paused = v; });
    top.add(actions, "copyLink").name("copy link to this look");
    top.add(actions, "reset").name("reset");

    for(const entry of entries)
    {
        const label = LABELS[entry.folder];
        if(!folders.has(label)) folders.set(label, top.addFolder(label).close());
        const folder = folders.get(label);

        proxy[entry.path] = entry.access.get();

        const controller = entry.access.color
            ? folder.addColor(proxy, entry.path)
            : folder.add(proxy, entry.path, entry.min, entry.max, entry.step);

        controller.name(entry.folder === "sky" ? "skyIntensity" : entry.name).onChange((value) =>
        {
            entry.access.set(value);
            saveSoon();
        });

        controllers.push(controller);
    }

    folders.get("Journey").open();

    function sync()
    {
        for(const entry of entries) proxy[entry.path] = entry.access.get();
        actions.paused = clock.paused;
        for(const controller of top.controllersRecursive()) controller.updateDisplay();
    }

    function applyPreset(name)
    {
        for(const entry of entries) if(entry.path !== "journey.progress") entry.access.set(defaults.get(entry.path));
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
            if(entry.path === "journey.progress") continue;
            const value = entry.access.get();
            const reference = base.get(entry.path);

            if(typeof value === "number")
            {
                if(Math.abs(value - reference) > 1e-6) params.set(entry.path, String(Math.round(value * 10000) / 10000));
            }
            else if(String(value).toLowerCase() !== String(reference).toLowerCase())
            {
                params.set(entry.path, String(value).replace(/^#/, ""));
            }
        }

        if(intro.target >= 0.999) params.set("sea", "1");
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

            if(entry.access.color) { if(/^[0-9a-f]{6}$/i.test(raw)) entry.access.set(`#${raw}`); }
            else { const value = Number(raw); if(Number.isFinite(value)) entry.access.set(value); }
        }

        if(params.get("sea") === "1") { intro.target = 1; intro.progress = 1; }
        sync();
    }

    const toastElement = document.querySelector(".toast");
    function toast(text)
    {
        toastElement.textContent = text;
        toastElement.classList.add("is-on");
        setTimeout(() => toastElement.classList.remove("is-on"), 1400);
    }

    readHash();

    /* Scrolling moves the journey slider, so the hash follows it with the same delay. */
    let lastTarget = intro.target;
    setInterval(() =>
    {
        if(intro.target !== lastTarget) { lastTarget = intro.target; saveSoon(); }
    }, 400);

    if(innerWidth < 720) gui.close();

    return { sync, replay: actions.replay };
}
