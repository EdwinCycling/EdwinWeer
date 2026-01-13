async function testAI() {
  const url = 'http://localhost:9998/.netlify/functions/ai-weather';
  const data = {
    location: 'Amsterdam',
    language: 'nl',
    weatherData: {
        current: { temp: 15, condition: 'Clear' },
        forecast: []
    }
  };

  try {
    console.log('Testing AI endpoint with model:', process.env.GEMINI_MODEL);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Source': 'BaroWeatherApp',
      },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAI();
