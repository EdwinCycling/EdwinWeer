import { Handler } from '@netlify/functions';
import * as turf from '@turf/turf';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ORS_API_KEY = process.env.ORS_API_KEY;

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { startLocation, returnLocation, distance, windStrategy, bending, bendingOutbound, bendingInbound, randomness, randomnessOutbound, randomnessInbound, options, dateTime, maximizeElevation, shape, waypoints } = body;

    // Logging for debug
    console.log("Calculate Route Request:", {
        start: startLocation,
        returnLoc: returnLocation,
        dist: distance,
        strategy: windStrategy,
        hasWaypoints: !!waypoints,
        shape,
        randomnessOut: randomnessOutbound,
        randomnessIn: randomnessInbound,
        maximizeElevation,
        dateTime,
        hasKey: !!ORS_API_KEY,
        keyLen: ORS_API_KEY ? ORS_API_KEY.length : 0
    });

    // startLocation expected as { lat: number, lng: number } from Leaflet
    if ((!startLocation || (!distance && !returnLocation)) && !waypoints) {
      return { 
        statusCode: 400, 
        headers: CORS_HEADERS, 
        body: JSON.stringify({ error: 'Missing parameters: startLocation and distance (or returnLocation) are required, or provide waypoints' }) 
      };
    }

    // 0. Handle Waypoints (Snap to Road / Edit Mode)
    if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
        // Determine ORS Profile
        let orsProfile = 'cycling-road';
        const { surfacePreference } = body;
        if (surfacePreference === 'unpaved') orsProfile = 'cycling-mountain';
        else if (surfacePreference === 'any') orsProfile = 'cycling-regular';

        const orsBody: any = { 
            coordinates: waypoints,
            elevation: true,
            extra_info: ["surface", "steepness", "waytype"]
        };
        
        if (options?.avoidFeatures && options.avoidFeatures.length > 0) {
            orsBody.options = { avoid_features: options.avoidFeatures };
        }
        if (maximizeElevation) orsBody.preference = 'shortest';

        console.log("Snap Route Request:", JSON.stringify(orsBody));

        const orsResponse = await fetch(`https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`, {
            method: 'POST',
            headers: {
                'Authorization': ORS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orsBody)
        });

        if (orsResponse.ok) {
             const routeData = await orsResponse.json();
             return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(routeData)
             };
        } else {
             const errText = await orsResponse.text();
             console.error("ORS Snap Error:", errText);
             return {
                statusCode: 200, // Return 200 but with warning/error in body to prevent frontend crash
                headers: CORS_HEADERS,
                body: JSON.stringify({ 
                    error: true,
                    message: `Could not snap to road: ${errText}` 
                })
             };
        }
    }

    // 1. Get Wind Data
    const windData = await getWindData(startLocation.lat, startLocation.lng, dateTime);
    const windDir = windData.wind_direction_10m;
    const windSpeed = windData.wind_speed_10m;

    // 2. Calculate Waypoints and Route with Retry
    // Turf uses [lon, lat]
    const startPoint = turf.point([startLocation.lng, startLocation.lat]);

    let attempt = 0;
    // Increased retries to try rotations
    const MAX_ATTEMPTS = 6;
    let currentDistance = distance * 1.05; // 5% extra margin per user request
    let rotationOffset = 0; // Degrees to rotate the whole route
    let finalResponse = null;
    let lastError = "";

    while (attempt < MAX_ATTEMPTS) {
        attempt++;
        
        // Strategy for Retries:
        // If returnLocation is provided, we don't rotate/shorten in the same way, 
        // effectively we try once (or maybe we could try bending variations if we wanted, but keep simple for now)
        if (returnLocation && attempt > 1) {
             break; // Don't retry for custom points for now
        }

        if (!returnLocation) {
            if (attempt === 2) currentDistance = distance * 0.8;
            if (attempt === 3) rotationOffset = 30;
            if (attempt === 4) rotationOffset = -30;
            if (attempt === 5) { currentDistance = distance * 0.6; rotationOffset = 0; }
            if (attempt === 6) rotationOffset = 90;
        }

        let turnaroundPoint;
        
        if (returnLocation) {
             turnaroundPoint = turf.point([returnLocation.lng, returnLocation.lat]);
             // Update currentDistance for calculations (approx round trip)
             const oneWay = turf.distance(startPoint, turnaroundPoint, { units: 'kilometers' });
             currentDistance = oneWay * 2;
        } else {
            // Determine bearing based on strategy
            let baseBearing = windDir; // Default: Headwind first (ride INTO wind)
            
            if (windStrategy === 'tailwind_first') {
                baseBearing = (windDir + 180) % 360;
            } else if (windStrategy === 'crosswind') {
                baseBearing = (windDir + 90) % 360;
            }

            // Apply rotation offset
            let bearing = (baseBearing + rotationOffset + 360) % 360;
            
            // Calculate turnaround point (Ideal)
            // Reduced factor from 0.7 to 0.55 to be more conservative with length
            // Dynamic Adjustment: If high randomness, reduce radius to compensate for wiggles
            const maxRandomness = Math.max(randomnessOutbound || 0, randomnessInbound || 0);
            const radiusFactor = 0.55 - (maxRandomness > 5 ? (maxRandomness - 5) * 0.02 : 0);
            const legDistance = (currentDistance / 2) * radiusFactor; 

            turnaroundPoint = turf.destination(startPoint, legDistance, bearing, { units: 'kilometers' });
        }
        
        // Waypoints array for ORS
        let waypoints = [startPoint];

        if (shape === 'square' && !returnLocation) {
             const side = (currentDistance / 4) * 0.67; 
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const p1 = turf.destination(startPoint, side, initialBearing, { units: 'kilometers' });
             const p2 = turf.destination(p1, side, (initialBearing + 90) % 360, { units: 'kilometers' });
             const p3 = turf.destination(p2, side, (initialBearing + 180) % 360, { units: 'kilometers' });
             
             waypoints.push(p1, p2, p3, startPoint);
        } else if (shape === 'triangle' && !returnLocation) {
             // Re-calc for equilateral
             const triSide = (currentDistance / 3) * 0.67;
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const t1 = turf.destination(startPoint, triSide, initialBearing - 30, { units: 'kilometers' });
             const t2 = turf.destination(t1, triSide, (initialBearing - 30 + 120) % 360, { units: 'kilometers' });
             
             waypoints.push(t1, t2, startPoint);
        } else if (shape === 'figure8' && !returnLocation) {
             const loopDist = (currentDistance / 2) * 0.26;
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             // Loop 1
             const cp1 = turf.destination(startPoint, loopDist * 0.7, initialBearing - 45, { units: 'kilometers' });
             const apex1 = turf.destination(startPoint, loopDist, initialBearing, { units: 'kilometers' });
             const cp2 = turf.destination(startPoint, loopDist * 0.7, initialBearing + 45, { units: 'kilometers' });
             waypoints.push(cp1, apex1, cp2, startPoint);
             
             // Loop 2
             const bearing2 = (initialBearing + 180) % 360;
             const cp3 = turf.destination(startPoint, loopDist * 0.7, bearing2 - 45, { units: 'kilometers' });
             const apex2 = turf.destination(startPoint, loopDist, bearing2, { units: 'kilometers' });
             const cp4 = turf.destination(startPoint, loopDist * 0.7, bearing2 + 45, { units: 'kilometers' });
             waypoints.push(cp3, apex2, cp4, startPoint);
        } else if (shape === 'hexagon' && !returnLocation) {
             const side = (currentDistance / 6) * 0.71;
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const p1 = turf.destination(startPoint, side, initialBearing - 60, { units: 'kilometers' });
             const p2 = turf.destination(p1, side, initialBearing, { units: 'kilometers' });
             const p3 = turf.destination(p2, side, initialBearing + 60, { units: 'kilometers' });
             const p4 = turf.destination(p3, side, initialBearing + 120, { units: 'kilometers' });
             const p5 = turf.destination(p4, side, initialBearing + 180, { units: 'kilometers' });
             
             waypoints.push(p1, p2, p3, p4, p5, startPoint);
        } else if (shape === 'star' && !returnLocation) {
             const R = (currentDistance / 5) * 0.51;
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const C = turf.destination(startPoint, R, initialBearing, { units: 'kilometers' });
             
             const v = [];
             for (let i = 0; i < 5; i++) {
                 const angle = initialBearing + 180 + (i * 72); 
                 v.push(turf.destination(C, R, angle, { units: 'kilometers' }));
             }
             // Star pattern: v[0] is near start. Path: v[0]->v[2]->v[4]->v[1]->v[3]->v[0]
             waypoints.push(v[2], v[4], v[1], v[3], startPoint);
        } else if (shape === 'zigzag' && !returnLocation) {
             const dist = currentDistance * 0.205;
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const width = dist * 0.2; 
             const seg = dist / 3;
             
             const c1 = turf.destination(startPoint, seg, initialBearing, { units: 'kilometers' });
             const p1 = turf.destination(c1, width, initialBearing - 90, { units: 'kilometers' });
             
             const c2 = turf.destination(startPoint, seg * 2, initialBearing, { units: 'kilometers' });
             const p2 = turf.destination(c2, width, initialBearing + 90, { units: 'kilometers' });
             
             const t = turnaroundPoint;
             const p3 = turf.destination(c2, width, initialBearing - 90, { units: 'kilometers' });
             const p4 = turf.destination(c1, width, initialBearing + 90, { units: 'kilometers' });
             
             waypoints.push(p1, p2, t, p3, p4, startPoint);
        } else if (shape === 'boomerang' && !returnLocation) {
             const dist = turf.distance(startPoint, turnaroundPoint, { units: 'kilometers' });
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const mid = turf.midpoint(startPoint, turnaroundPoint);
             
             // A curved shape: S -> Out -> T -> In -> S ? 
             // Let's do a simple heavy curve to one side
             const p1 = turf.destination(mid, dist * 0.55, initialBearing - 90, { units: 'kilometers' });
             waypoints.push(p1, turnaroundPoint, startPoint);
        } else {
            // Bending Logic & Randomness
            const midPoint = turf.midpoint(startPoint, turnaroundPoint);
            const distToTurnaround = turf.distance(startPoint, turnaroundPoint, { units: 'kilometers' });
            const bearingToTurnaround = turf.bearing(startPoint, turnaroundPoint);
            
            const perpBearingLeft = (bearingToTurnaround - 90 + 360) % 360;
            const perpBearingRight = (bearingToTurnaround + 90 + 360) % 360;
            
            // Use specific bending if provided, else fallback to global 'bending' or 0
            const bendOut = bendingOutbound !== undefined ? bendingOutbound : (bending || 0);
            const bendIn = bendingInbound !== undefined ? bendingInbound : (bending || 0);

            const offsetDistLeft = Math.max(0.1, distToTurnaround * (bendOut / 100));
            const offsetDistRight = Math.max(0.1, distToTurnaround * (bendIn / 100));

            const randOut = randomnessOutbound !== undefined ? randomnessOutbound : (randomness || 0);
            const randIn = randomnessInbound !== undefined ? randomnessInbound : (randomness || 0);
            
            const addJitter = (point: any, factor: number) => {
                if (factor <= 0) return point;
                // Increased jitter impact
                const jitterDist = (Math.random() * factor * 0.8); // 0.5 -> 0.8
                const jitterBearing = Math.random() * 360;
                return turf.destination(point, jitterDist, jitterBearing, { units: 'kilometers' });
            };

            // Create Main Curve Points
            let pointA = turf.destination(midPoint, offsetDistLeft, perpBearingLeft, { units: 'kilometers' });
            let pointB = turf.destination(midPoint, offsetDistRight, perpBearingRight, { units: 'kilometers' });
            
            // Apply jitter to main curve points
            pointA = addJitter(pointA, randOut);
            pointB = addJitter(pointB, randIn);
            
            // --- EXTRA RANDOMNESS LOGIC ---
            // If high randomness, add extra control points to force deviation
            const extraPointsOut = [];
            const extraPointsIn = [];

            if (randOut > 5) {
                // Add an extra point at 25% and 75% of the leg
                const q1 = turf.midpoint(startPoint, pointA);
                // Push it 'out' or 'in' randomly
                const dir = Math.random() > 0.5 ? 1 : -1;
                const dist = (distToTurnaround * 0.2) * (randOut / 10);
                const bearing = (bearingToTurnaround - (90 * dir) + 360) % 360;
                extraPointsOut.push(turf.destination(q1, dist, bearing, { units: 'kilometers' }));
            }

            if (randIn > 5) {
                const q3 = turf.midpoint(turnaroundPoint, pointB);
                const dir = Math.random() > 0.5 ? 1 : -1;
                const dist = (distToTurnaround * 0.2) * (randIn / 10);
                const bearing = (bearingToTurnaround + 180 - (90 * dir) + 360) % 360; // Backwards bearing
                extraPointsIn.push(turf.destination(q3, dist, bearing, { units: 'kilometers' }));
            }

            // Assemble Waypoints
            // Outbound
            if (extraPointsOut.length > 0) waypoints.push(...extraPointsOut);
            if (bendOut > 0 || randOut > 0) waypoints.push(pointA);
            
            // Turnaround
            waypoints.push(turnaroundPoint);
            
            // Inbound
            if (bendIn > 0 || randIn > 0) waypoints.push(pointB);
            if (extraPointsIn.length > 0) waypoints.push(...extraPointsIn);
            
            waypoints.push(startPoint); 
        } 

        // 3. Call ORS
        const coordinates = waypoints.map(p => p.geometry.coordinates);
        
        if (!ORS_API_KEY) {
             console.warn("No ORS_API_KEY provided. Returning geometric route (straight lines).");
             const line = turf.lineString(coordinates);
             return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        properties: {
                            summary: { duration: (currentDistance/25)*3600, distance: currentDistance * 1000 },
                            wind: { direction: windDir, speed: windSpeed, strategy: windStrategy },
                            warning: "Demo mode: No API Key configured. Showing straight lines."
                        },
                        geometry: line.geometry
                    }]
                })
             };
        }

        const orsBody: any = { 
            coordinates: coordinates,
            elevation: true,
            extra_info: ["surface", "steepness", "waytype"]
        };
        if (options?.avoidFeatures && options.avoidFeatures.length > 0) {
            orsBody.options = { avoid_features: options.avoidFeatures };
        }

        if (maximizeElevation) {
            orsBody.preference = 'shortest';
        }

    // Determine ORS Profile based on surfacePreference
    let orsProfile = 'cycling-road'; // Default (Verhard / Paved preference)
    
    // Check surfacePreference from body (assuming frontend sends it)
    // 'paved' | 'unpaved' | 'any'
    const { surfacePreference } = body;

    if (surfacePreference === 'unpaved') {
        orsProfile = 'cycling-mountain';
    } else if (surfacePreference === 'any') {
        orsProfile = 'cycling-regular';
    }

    console.log(`ORS Request (Attempt ${attempt}, Dist: ${currentDistance}, Rot: ${rotationOffset}, Profile: ${orsProfile}):`, JSON.stringify(orsBody));

    const orsResponse = await fetch(`https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`, {
        method: 'POST',
        headers: {
            'Authorization': ORS_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orsBody)
    });

        if (orsResponse.ok) {
            const routeData = await orsResponse.json();
            if (routeData.features && routeData.features.length > 0) {
                routeData.features[0].properties.wind = {
                    direction: windDir,
                    speed: windSpeed,
                    strategy: windStrategy
                };

                // Fix "dead ends" (spikes/spurs) in the route
                try {
                    const geometry = routeData.features[0].geometry;
                    const coords = geometry.coordinates;
                    
                    if (coords.length > 10) {
                        const newCoords = [];
                        let i = 0;
                        // Use a Set to avoid duplicates if needed, but the loop logic handles it
                        
                        while (i < coords.length) {
                            newCoords.push(coords[i]);
                            
                            let foundLoop = false;
                            // Look ahead for a return to this point (approx 30m tolerance)
                            // Limit lookahead to avoid O(N^2) on large routes, 50 points is usually enough for a spur
                            const lookAhead = Math.min(coords.length, i + 50); 
                            
                            for (let j = i + 2; j < lookAhead; j++) {
                                const p1 = turf.point(coords[i]);
                                const p2 = turf.point(coords[j]);
                                const d = turf.distance(p1, p2, { units: 'kilometers' });
                                
                                if (d < 0.03) { // 30 meters
                                    // Calculate path length of the loop
                                    let pathLen = 0;
                                    for (let k = i; k < j; k++) {
                                        pathLen += turf.distance(turf.point(coords[k]), turf.point(coords[k+1]), { units: 'kilometers' });
                                    }
                                    
                                    // If spur is less than 1km total (e.g. 500m out, 500m back)
                                    if (pathLen < 1.0) { 
                                        i = j; // Skip the spur
                                        foundLoop = true;
                                        break; 
                                    }
                                }
                            }
                            
                            if (!foundLoop) {
                                i++;
                            }
                        }
                        
                        if (newCoords.length < coords.length) {
                            console.log(`Cleaned route: reduced points from ${coords.length} to ${newCoords.length}`);
                            routeData.features[0].geometry.coordinates = newCoords;
                            
                            // Recalculate distance
                            const newLine = turf.lineString(newCoords);
                            const newDistKm = turf.length(newLine, { units: 'kilometers' });
                            routeData.features[0].properties.summary.distance = newDistKm * 1000;
                        }
                    }
                } catch (e) {
                    console.error("Error cleaning route:", e);
                }
                
                // If we retried, add a warning about shortened/rotated route
                if (attempt > 1) {
                    let warnText = "Route aangepast (zee/onbegaanbaar).";
                    if (currentDistance < distance) warnText += ` Ingekort tot ${(routeData.features[0].properties.summary.distance / 1000).toFixed(1)}km.`;
                    if (rotationOffset !== 0) warnText += ` Gedraaid met ${rotationOffset}°.`;
                    routeData.features[0].properties.warning = warnText;
                }
            }
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify(routeData)
            };
        } else {
            // Check error
            const errText = await orsResponse.text();
            console.error(`ORS Attempt ${attempt} Failed:`, orsResponse.status, errText);
            lastError = errText;
            
            // Loop continues to next attempt strategy
            
            if (attempt === MAX_ATTEMPTS) {
                // Final fallback after all retries
                 const line = turf.lineString(coordinates);
                 
                 let warningMsg = "Could not calculate road route.";
                 if (orsResponse.status === 403) warningMsg = "API Key Invalid or Quota Exceeded.";
                 if (orsResponse.status === 401) warningMsg = "API Key Unauthorized.";
                 
                 let detailedError = "";
                 try {
                     const errJson = JSON.parse(errText);
                     if (errJson.error && errJson.error.message) {
                         detailedError = errJson.error.message;
                     } else if (errJson.error) {
                         detailedError = JSON.stringify(errJson.error);
                     }
                 } catch (e) {
                     detailedError = errText.substring(0, 100);
                 }
         
                 return {
                     statusCode: 200, 
                     headers: CORS_HEADERS,
                     body: JSON.stringify({
                         type: 'FeatureCollection',
                         features: [{
                             type: 'Feature',
                             properties: {
                                 summary: { duration: (distance/25)*3600, distance: distance * 1000 },
                                 wind: { direction: windDir, speed: windSpeed, strategy: windStrategy },
                                 warning: `${warningMsg} (Status: ${orsResponse.status}) Details: ${detailedError}`
                             },
                             geometry: line.geometry
                         }]
                     })
                 };
            }
        }
    }

    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Unexpected loop exit" }) };

  } catch (error: any) {
    console.error('Error in calculate-route:', error);
    return { 
        statusCode: 500, 
        headers: CORS_HEADERS, 
        body: JSON.stringify({ error: error.message || 'Internal Server Error' }) 
    };
  }
};

async function getWindData(lat: number, lon: number, dateTime?: { date: string, time: string }) {
    let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m`;
    
    if (dateTime) {
        try {
            const targetDate = new Date();
            if (dateTime.date === 'tomorrow') {
                targetDate.setDate(targetDate.getDate() + 1);
            }
            const [h, m] = dateTime.time.split(':').map(Number);
            targetDate.setHours(h, m, 0, 0);

            const isoDate = targetDate.toISOString().split('T')[0];
            const hourIndex = targetDate.getHours();

            // Fetch hourly instead
            url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&start_date=${isoDate}&end_date=${isoDate}`;
            
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch wind data');
            const data = await res.json();
            
            if (data.hourly && data.hourly.wind_speed_10m) {
                return {
                    wind_speed_10m: data.hourly.wind_speed_10m[hourIndex],
                    wind_direction_10m: data.hourly.wind_direction_10m[hourIndex]
                };
            }
        } catch(e) {
            console.error("Error fetching specific time wind, falling back to current", e);
        }
    }

    // Fallback to current
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m`);
    if (!res.ok) throw new Error('Failed to fetch wind data');
    const data = await res.json();
    return data.current;
}
