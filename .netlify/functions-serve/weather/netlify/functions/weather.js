var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/weather.js
var weather_exports = {};
__export(weather_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(weather_exports);
var handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const appSource = event.headers["x-app-source"] || event.headers["X-App-Source"];
  if (appSource !== "EdwinWeerApp") {
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized source" })
    };
  }
  try {
    const qs = event.queryStringParameters || {};
    const { lat, lon, ...otherParams } = qs;
    if (!lat || !lon) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing lat/lon parameters" })
      };
    }
    const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), ...otherParams });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const clientIp = event.headers?.["x-nf-client-connection-ip"] || event.headers?.["client-ip"];
    console.log(`[Proxy] Request from ${clientIp || "unknown"} for ${lat},${lon}`);
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Upstream Error: ${response.statusText}`, details: text })
      };
    }
    const raw = await response.text();
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Upstream returned empty response" })
      };
    }
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Upstream returned invalid JSON",
          details: trimmed.slice(0, 500)
        })
      };
    }
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Proxy Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=weather.js.map
