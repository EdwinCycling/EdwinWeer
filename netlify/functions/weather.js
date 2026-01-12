export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Security: Check for custom header to prevent basic script abuse
  // This header is set by the frontend code
  const appSource = event.headers['x-app-source'] || event.headers['X-App-Source'];
  if (appSource !== 'BaroWeatherApp') {
    return {
       statusCode: 403,
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ error: 'Unauthorized source' })
    };
  }

  // Security: Origin/Referer Check
  // Prevent other websites from embedding/using our API via AJAX
  const origin = event.headers['origin'] || event.headers['Origin'];
  const referer = event.headers['referer'] || event.headers['Referer'];
  
  // Logic: If called from a browser, Origin or Referer is usually present.
  // We allow:
  // 1. Localhost (Development)
  // 2. Netlify Preview/Production URLs (.netlify.app)
  // 3. Custom domain (askbaro.com)
  
  const isLocal = (origin && origin.includes('localhost')) || (referer && referer.includes('localhost'));
  const isNetlify = (origin && origin.includes('.netlify.app')) || (referer && referer.includes('.netlify.app'));
  const isCustom = (origin && (origin.includes('askbaro.com') || origin.includes('www.askbaro.com'))) || 
                   (referer && (referer.includes('askbaro.com') || referer.includes('www.askbaro.com')));

  const isAllowed = isLocal || isNetlify || isCustom || (!origin && !referer); // Allow empty for strict server-side calls if needed, but App-Source covers that.

  if (!isAllowed) {
      console.warn(`Blocked request from unauthorized origin: ${origin || referer}`);
      return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Forbidden Origin' })
      };
  }

  // Security: Rate Limiting (Simple IP-based)
  const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  if (clientIp !== 'unknown') {
      if (!global.rateLimitCache) global.rateLimitCache = new Map();
      
      const now = Date.now();
      const windowMs = 15 * 60 * 1000; // 15 minutes
      const limit = 200; // 200 requests per 15 min per IP

      // Clean old entries occasionally
      if (global.rateLimitCache.size > 10000) global.rateLimitCache.clear();

      const record = global.rateLimitCache.get(clientIp) || { count: 0, startTime: now };
      
      if (now - record.startTime > windowMs) {
          // Reset window
          record.count = 1;
          record.startTime = now;
      } else {
          record.count++;
      }
      
      global.rateLimitCache.set(clientIp, record);

      if (record.count > limit) {
          console.warn(`Rate limit exceeded for IP: ${clientIp}`);
          return {
              statusCode: 429,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ error: 'Too Many Requests' })
          };
      }
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
