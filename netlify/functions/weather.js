// netlify/functions/weather.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { lat, lon, ...otherParams } = event.queryStringParameters;

    if (!lat || !lon) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing lat/lon parameters" })
      };
    }

    // Construct upstream URL
    const params = new URLSearchParams({ lat, lon, ...otherParams });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

    // Simple IP logging (Serverless "Rate Limit" check placeholder)
    // Note: True rate limiting in serverless requires a database (Redis/Firebase)
    // because memory is not shared between function invocations.
    const clientIp = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'];
    console.log(`[Proxy] Request from ${clientIp} for ${lat},${lon}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: `Upstream Error: ${response.statusText}`
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 mins
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error("Proxy Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" })
    };
  }
};
