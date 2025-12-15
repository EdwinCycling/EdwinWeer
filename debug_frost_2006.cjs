const https = require('https');

const lat = 52.10;
const lon = 5.18;
const start = '2006-01-01';
const end = '2006-12-31';

const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,daylight_duration&timezone=auto`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const daily = json.daily;
      if (!daily) {
        console.log('No daily data found');
        return;
      }
      
      const times = daily.time;
      const minTemps = daily.temperature_2m_min;
      const daylight = daily.daylight_duration;
      
      console.log(`Fetched ${times.length} days.`);
      
      // Find longest day
      let longestDayIndex = -1;
      let maxDaylight = -1;
      
      if (daylight) {
        for(let i=0; i<daylight.length; i++) {
          if (daylight[i] > maxDaylight) {
            maxDaylight = daylight[i];
            longestDayIndex = i;
          }
        }
        console.log(`Longest day index based on daylight: ${longestDayIndex} (${times[longestDayIndex]})`);
      } else {
        console.log('No daylight duration data.');
        // Fallback logic from app
        const target = '-06-21';
        const idx = times.findIndex(t => t.includes(target));
        if (idx !== -1) longestDayIndex = idx;
        else longestDayIndex = Math.floor(times.length / 2);
        console.log(`Longest day index based on date: ${longestDayIndex} (${times[longestDayIndex]})`);
      }
      
      // Find First Frost (first frost after longest day)
      let firstFrost = null;
      let lastFrost = null;
      
      for(let i=0; i<times.length; i++) {
        if (minTemps[i] < 0) {
          if (i > longestDayIndex) {
            if (!firstFrost) {
              firstFrost = times[i];
              console.log(`First frost found at index ${i}: ${times[i]} (Temp: ${minTemps[i]})`);
            }
          } else if (i < longestDayIndex) {
            lastFrost = times[i];
          }
        }
      }
      
      console.log('Summary:');
      console.log('Last Frost (Spring):', lastFrost);
      console.log('First Frost (Autumn):', firstFrost);
      
    } catch (e) {
      console.error('Error parsing JSON:', e);
    }
  });
}).on('error', (e) => {
  console.error('Error fetching data:', e);
});
