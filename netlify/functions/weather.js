export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Security: Check for custom header to prevent basic script abuse
  const appSource = event.headers['x-app-source'] || event.headers['X-App-Source'];
  if (appSource !== 'BaroWeatherApp') {
    return {
       statusCode: 403,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ error: 'Unauthorized source' })
    };
  }

  try {
    const qs = event.queryStringParameters || {};
    const { lat, lon, ...otherParams } = qs;

    if (!lat || !lon) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing lat/lon parameters' })
      };
    }

    const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), ...otherParams });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Upstream Error: ${response.statusText}`, details: text })
      };
    }

    const raw = await response.text();
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Upstream returned empty response' })
      };
    }

    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Upstream returned invalid JSON',
          details: trimmed.slice(0, 500)
        })
      };
    }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Proxy Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
