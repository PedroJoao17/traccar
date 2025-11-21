const express = require("express");
const axios = require("axios");

const app = express();

// Captura JSON e texto cru
app.use(express.text({ type: "*/*" }));
app.use(express.json());

const PORT = 3000;

// ===== Funções auxiliares =====

function extractFromTemplate(str) {
    if (!str || typeof str !== "string") return {};
    const params = {};
    str.replace(/(?:\?|&)?([^=]+)=([^&]+)/g, (_, key, value) => {
        params[key] = value;
    });
    return params;
}

function normalizeSpeed(speed) {
    if (speed == null || isNaN(speed)) return 0;
    const s = parseFloat(speed);

    // TSLocationManager usa m/s quando < 20
    if (s < 20) return s * 1.94384;  // m/s → knots

    // acima disso é km/h
    return (s / 3.6) * 1.94384;      // km/h → knots
}

// == MIDDLEWARE PARA NGROK == //
app.use((req, res, next) => {
    res.setHeader("ngrok-skip-browser-warning", "true");
    next();
});

// ===== ROTA PRINCIPAL =====

app.post("/location", async (req, res) => {
    try {
        let data = {};

        // tenta JSON e texto cru
        if (typeof req.body === "string") {
            try { data = JSON.parse(req.body); } catch { data = {}; }
        } else {
            data = req.body;
        }

        // ---------- EXTRAÇÃO DO JSON DO TSLocationManager ----------
        let id =
            data?.params?.device_id ||
            data?.device_id ||
            data?.id ||
            null;

        let lat =
            data?.location?.coords?.latitude ||
            data?.latitude ||
            null;

        let lon =
            data?.location?.coords?.longitude ||
            data?.longitude ||
            null;

        let timestamp =
            data?.location?.timestamp ||
            data?.timestamp ||
            Math.floor(Date.now() / 1000);

        let speed =
            data?.location?.coords?.speed ||
            data?.speed ||
            0;

        let accuracy =
            data?.location?.coords?.accuracy ||
            data?.accuracy ||
            5;

        let altitude =
            data?.location?.coords?.altitude ||
            data?.altitude ||
            0;

        let heading =
            data?.location?.coords?.heading ||
            data?.heading ||
            0;

        // ---------- EXTRAÇÃO DO TEMPLATE "_" ----------
        if (data?.location?._) {
            const tpl = extractFromTemplate(data.location._);

            if (tpl.id && !id) id = tpl.id;
            if (tpl.lat && !lat) lat = tpl.lat;
            if (tpl.lon && !lon) lon = tpl.lon;
            if (tpl.timestamp && !timestamp) timestamp = tpl.timestamp;
            if (tpl.bearing && !heading) heading = tpl.bearing;
            if (tpl.speed && !speed) speed = tpl.speed;
        }

        // ---------- VALIDAÇÃO ----------
        if (!id || !lat || !lon) {
            return res.status(400).json({ error: "missing id/lat/lon" });
        }

        // ---------- NORMALIZAÇÃO ----------
        lat = Number(lat);
        lon = Number(lon);
        altitude = Number(altitude);
        accuracy = Number(accuracy);
        heading = Number(heading);
        speed = normalizeSpeed(speed);

        // timestamp vindo em ms → corrigir
        if (timestamp > 9999999999) {
            timestamp = Math.floor(timestamp / 1000);
        }

        // ---------- MONTAGEM DA URL OSMAND PARA TRACCAR ----------
        const traccarUrl =
            `http://traccar:5055/?id=${id}` +
            `&lat=${lat}` +
            `&lon=${lon}` +
            `&timestamp=${timestamp}` +
            `&speed=${speed}` +
            `&bearing=${heading}` +
            `&altitude=${altitude}` +
            `&accuracy=${accuracy}`;

        console.log("→ ENVIADO AO TRACCAR:", traccarUrl);

        // Envia para o Traccar
        const result = await axios.get(traccarUrl);

        return res.json({
            status: "ok",
            sentToTraccar: true,
            url: traccarUrl,
            traccar_response: result.data
        });

    } catch (err) {
        console.error("ERRO AO ENVIAR AO TRACCAR:", err);
        return res.status(500).json({
            error: "Proxy error",
            detail: err.message
        });
    }
});

// ===== START =====

app.listen(PORT, () =>
    console.log(`Proxy TSLocationManager → Traccar rodando na porta ${PORT}`)
);
