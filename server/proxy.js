const express = require('express');
const rateLimit = require('express-rate-limit');
// Node.js 18+ has native fetch, otherwise npm install node-fetch
// const fetch = require('node-fetch'); 

const app = express();
const PORT = process.env.PORT || 3001;

// --- SECURITY RECOMMENDATION #1: Server-side Rate Limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests, please try again later." }
});

// Apply to all API requests
app.use('/api/', apiLimiter);

// --- SECURITY RECOMMENDATION #2: API Proxy Implementation ---
app.get('/api/weather', async (req, res) => {
  try {
    const { lat, lon, ...otherParams } = req.query;
    
    if (!lat || !lon) {
      return res.status(400).json({ error: "Missing lat/lon parameters" });
    }

    // Construct the upstream URL
    // We preserve other params to keep flexibility
    const queryParams = new URLSearchParams({ lat, lon, ...otherParams }).toString();
    const url = `https://api.open-meteo.com/v1/forecast?${queryParams}`;

    console.log(`Proxying request to: ${url}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Upstream API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch weather data" });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Security Proxy Server running on port ${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/api/weather?lat=52.37&lon=4.89`);
});
