import { Handler } from '@netlify/functions';
import * as turf from '@turf/turf';
import { initFirebase, admin } from './config/firebaseAdmin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ORS_API_KEY = process.env.ORS_API_KEY;

// Rate Limit Helper
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const db = initFirebase();
    if (!db) {
        console.error("Firebase DB not initialized");
        return { allowed: true }; // Fail open if DB config is missing
    }

    const today = new Date().toISOString().split('T')[0];
    const docRef = db.collection('route_limits').doc(`${userId}_${today}`);

    try {
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            if (data.count >= 10) {
                return { allowed: false, message: 'Dagelijkse limiet van 10 routes bereikt.' };
            }
            await docRef.update({ count: admin.firestore.FieldValue.increment(1) });
        } else {
            await docRef.set({ 
                count: 1, 
                userId, 
                date: today,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        return { allowed: true };
    } catch (e) {
        console.error("Rate limit check failed:", e);
        return { allowed: true }; // Fail open on error
    }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  // Security Check: Verify User
  let userId = null;
  try {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return {
              statusCode: 401,
              headers: CORS_HEADERS,
              body: JSON.stringify({ error: 'Niet geautoriseerd. Log in om routes te berekenen.' })
          };
      }
      
      const token = authHeader.split('Bearer ')[1];
      // Init firebase if not already done (checkRateLimit does it too, but we need admin.auth here)
      initFirebase(); 
      const decodedToken = await admin.auth().verifyIdToken(token);
      userId = decodedToken.uid;

      // Credit Check
      const db = initFirebase();
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      const baroCredits = userData?.usage?.baroCredits || 0;

      if (baroCredits <= 0) {
          return {
              statusCode: 403,
              headers: CORS_HEADERS,
              body: JSON.stringify({ error: 'Baro credits nodig om routes te berekenen.' })
          };
      }

      // Rate Limit Check
      const limitCheck = await checkRateLimit(userId);
      if (!limitCheck.allowed) {
          return {
              statusCode: 429,
              headers: CORS_HEADERS,
              body: JSON.stringify({ error: limitCheck.message })
          };
      }

  } catch (e) {
      console.error("Auth/RateLimit Error:", e);
      return {
          statusCode: 401,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Authenticatie mislukt of sessie verlopen.' })
      };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { startLocation, returnLocation, distance, windStrategy, bending, bendingOutbound, bendingInbound, randomness, randomnessOutbound, randomnessInbound, options, dateTime, maximizeElevation, shape, waypoints } = body;

    const hasValidLatLng = (loc: any) => loc && typeof loc.lat === 'number' && typeof loc.lng === 'number' && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
    const hasWaypoints = Array.isArray(waypoints) && waypoints.length > 0;

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
    if (!hasWaypoints) {
        if (!hasValidLatLng(startLocation)) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Error: Invalid startLocation' })
            };
        }

        if (returnLocation && !hasValidLatLng(returnLocation)) {
            return {
                statusCode: 400,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Error: Invalid returnLocation' })
            };
        }

        if (!returnLocation) {
            if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ error: 'Error: Invalid distance' })
                };
            }
        }
    }

    // 0. Handle Waypoints (Snap to Road / Edit Mode)
    if (hasWaypoints) {
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
    let windData;
    try {
        windData = await getWindData(startLocation.lat, startLocation.lng, dateTime);
    } catch (e) {
        console.error("Wind data fetch failed, using defaults:", e);
        windData = { wind_speed_10m: 0, wind_direction_10m: 0 };
    }
    
    const windDir = windData?.wind_direction_10m ?? 0;
    const windSpeed = windData?.wind_speed_10m ?? 0;

    // 2. Calculate Waypoints and Route with Retry
    // Turf uses [lon, lat]
    const startPoint = turf.point([startLocation.lng, startLocation.lat]);

    let attempt = 0;
    // Increased retries to try rotations
    const MAX_ATTEMPTS = 6;
    const baseDistance = typeof distance === 'number' && Number.isFinite(distance) ? distance : 0;
    let currentDistance = baseDistance * 1.05; // 5% extra margin per user request
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
            if (attempt === 2) currentDistance = baseDistance * 0.8;
            if (attempt === 3) rotationOffset = 30;
            if (attempt === 4) rotationOffset = -30;
            if (attempt === 5) { currentDistance = baseDistance * 0.6; rotationOffset = 0; }
            if (attempt === 6) rotationOffset = 90;
        }

        let turnaroundPoint;
        let figureStartPoint = startPoint;
        const connectorDist = currentDistance * 0.05; // 5% connector
        
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
            const maxRandomness = Math.max(randomnessOutbound || 0, randomnessInbound || 0);
            const radiusFactor = 0.55 - (maxRandomness > 5 ? (maxRandomness - 5) * 0.02 : 0);
            const legDistance = (currentDistance / 2) * radiusFactor; 

            turnaroundPoint = turf.destination(startPoint, legDistance, bearing, { units: 'kilometers' });
            
            // Figure Start Point (after connector)
            figureStartPoint = turf.destination(startPoint, connectorDist, bearing, { units: 'kilometers' });
        }
        
        // Waypoints array for ORS
        let waypoints = [startPoint];

        if (shape === 'square' && !returnLocation) {
             const side = (currentDistance / 4) * 0.38; // 15% larger than 0.33
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const p1 = turf.destination(figureStartPoint, side, initialBearing, { units: 'kilometers' });
             const p2 = turf.destination(p1, side, (initialBearing + 90) % 360, { units: 'kilometers' });
             const p3 = turf.destination(p2, side, (initialBearing + 180) % 360, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint, p1, p2, p3, figureStartPoint, startPoint);
        } else if (shape === 'triangle' && !returnLocation) {
             const triSide = (currentDistance / 3) * 0.38; // 15% larger than 0.33
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const t1 = turf.destination(figureStartPoint, triSide, initialBearing - 30, { units: 'kilometers' });
             const t2 = turf.destination(t1, triSide, (initialBearing - 30 + 120) % 360, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint, t1, t2, figureStartPoint, startPoint);
        } else if (shape === 'figure8' && !returnLocation) {
             const loopDist = (currentDistance / 2) * 0.15; // 15% larger than 0.13
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             // Loop 1
             const cp1 = turf.destination(figureStartPoint, loopDist * 0.7, initialBearing - 45, { units: 'kilometers' });
             const apex1 = turf.destination(figureStartPoint, loopDist, initialBearing, { units: 'kilometers' });
             const cp2 = turf.destination(figureStartPoint, loopDist * 0.7, initialBearing + 45, { units: 'kilometers' });
             waypoints.push(figureStartPoint, cp1, apex1, cp2, figureStartPoint);
             
             // Loop 2
             const bearing2 = (initialBearing + 180) % 360;
             const cp3 = turf.destination(figureStartPoint, loopDist * 0.7, bearing2 - 45, { units: 'kilometers' });
             const apex2 = turf.destination(figureStartPoint, loopDist, bearing2, { units: 'kilometers' });
             const cp4 = turf.destination(figureStartPoint, loopDist * 0.7, bearing2 + 45, { units: 'kilometers' });
             waypoints.push(cp3, apex2, cp4, figureStartPoint, startPoint);
        } else if (shape === 'hexagon' && !returnLocation) {
             const side = (currentDistance / 6) * 0.40; // 15% larger than 0.35
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const p1 = turf.destination(figureStartPoint, side, initialBearing - 60, { units: 'kilometers' });
             const p2 = turf.destination(p1, side, initialBearing, { units: 'kilometers' });
             const p3 = turf.destination(p2, side, initialBearing + 60, { units: 'kilometers' });
             const p4 = turf.destination(p3, side, initialBearing + 120, { units: 'kilometers' });
             const p5 = turf.destination(p4, side, initialBearing + 180, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint, p1, p2, p3, p4, p5, figureStartPoint, startPoint);
        } else if (shape === 'star' && !returnLocation) {
             const R = (currentDistance / 5) * 0.29; // 15% larger than 0.25
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const C = turf.destination(figureStartPoint, R, initialBearing, { units: 'kilometers' });
             
             const v = [];
             for (let i = 0; i < 5; i++) {
                 const angle = initialBearing + 180 + (i * 72); 
                 v.push(turf.destination(C, R, angle, { units: 'kilometers' }));
             }
             waypoints.push(figureStartPoint, v[2], v[4], v[1], v[3], figureStartPoint, startPoint);
        } else if (shape === 'zigzag' && !returnLocation) {
             const dist = currentDistance * 0.115; // 15% larger than 0.1
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const width = dist * 0.2; 
             const seg = dist / 3;
             
             const c1 = turf.destination(figureStartPoint, seg, initialBearing, { units: 'kilometers' });
             const p1 = turf.destination(c1, width, initialBearing - 90, { units: 'kilometers' });
             
             const c2 = turf.destination(figureStartPoint, seg * 2, initialBearing, { units: 'kilometers' });
             const p2 = turf.destination(c2, width, initialBearing + 90, { units: 'kilometers' });
             
             const t = turf.destination(figureStartPoint, dist, initialBearing, { units: 'kilometers' });
             const p3 = turf.destination(c2, width, initialBearing - 90, { units: 'kilometers' });
             const p4 = turf.destination(c1, width, initialBearing + 90, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint, p1, p2, t, p3, p4, figureStartPoint, startPoint);
        } else if (shape === 'boomerang' && !returnLocation) {
             const dist = turf.distance(startPoint, turnaroundPoint, { units: 'kilometers' }) * 0.575; // 15% larger than 0.5
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const miniTurnaround = turf.destination(figureStartPoint, dist, initialBearing, { units: 'kilometers' });
             const mid = turf.midpoint(figureStartPoint, miniTurnaround);
             
             const p1 = turf.destination(mid, dist * 0.55, initialBearing - 90, { units: 'kilometers' });
             waypoints.push(figureStartPoint, p1, miniTurnaround, figureStartPoint, startPoint);
        } else if (shape === 'kerstboom' && !returnLocation) {
             const h = (currentDistance / 17); // 20% larger than /20
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             
             const p1 = turf.destination(figureStartPoint, h * 1.5, initialBearing - 45, { units: 'kilometers' });
             const p2 = turf.destination(p1, h * 0.8, initialBearing + 90, { units: 'kilometers' });
             const p3 = turf.destination(p2, h * 1.2, initialBearing - 45, { units: 'kilometers' });
             const p4 = turf.destination(p3, h * 0.6, initialBearing + 90, { units: 'kilometers' });
             const p5 = turf.destination(p4, h * 1.0, initialBearing - 45, { units: 'kilometers' });
             const top = turf.destination(p5, h * 0.5, initialBearing + 90, { units: 'kilometers' });
             
             const p6 = turf.destination(top, h * 0.5, initialBearing + 90, { units: 'kilometers' });
             const p7 = turf.destination(p6, h * 1.0, initialBearing + 225, { units: 'kilometers' });
             const p8 = turf.destination(p7, h * 0.6, initialBearing + 90, { units: 'kilometers' });
             const p9 = turf.destination(p8, h * 1.2, initialBearing + 225, { units: 'kilometers' });
             const p10 = turf.destination(p9, h * 0.8, initialBearing + 90, { units: 'kilometers' });
             const p11 = turf.destination(p10, h * 1.5, initialBearing + 225, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint, p1, p2, p3, p4, p5, top, p6, p7, p8, p9, p10, p11, figureStartPoint, startPoint);
        } else if (shape === 'kerstman' && !returnLocation) {
             const R = (currentDistance / 20); // 20% larger than /24
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const center = turf.destination(figureStartPoint, R * 2, initialBearing, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint);
             for (let i = 0; i <= 360; i += 60) {
                 waypoints.push(turf.destination(center, R, initialBearing + i, { units: 'kilometers' }));
             }
             const headTop = turf.destination(center, R, initialBearing, { units: 'kilometers' });
             const hatTip = turf.destination(headTop, R * 1.2, initialBearing, { units: 'kilometers' });
             const hatLeft = turf.destination(headTop, R * 0.4, initialBearing - 90, { units: 'kilometers' });
             const hatRight = turf.destination(headTop, R * 0.4, initialBearing + 90, { units: 'kilometers' });
             waypoints.push(hatLeft, hatTip, hatRight, headTop, figureStartPoint, startPoint);
        } else if (shape === 'pashaas' && !returnLocation) {
             const R = (currentDistance / 25); // 20% larger than /30
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const center = turf.destination(figureStartPoint, R * 2, initialBearing, { units: 'kilometers' });
             
             waypoints.push(figureStartPoint);
             for (let i = 0; i <= 360; i += 72) {
                 waypoints.push(turf.destination(center, R, initialBearing + i, { units: 'kilometers' }));
             }
             const earBase = turf.destination(center, R, initialBearing, { units: 'kilometers' });
             const ear1 = turf.destination(earBase, R * 2.5, initialBearing - 15, { units: 'kilometers' });
             const ear2 = turf.destination(earBase, R * 2.5, initialBearing + 15, { units: 'kilometers' });
             waypoints.push(ear1, earBase, ear2, figureStartPoint, startPoint);
        } else if (shape === 'dieren' && !returnLocation) {
             const L = (currentDistance / 13); // 20% larger than /16
             const initialBearing = turf.bearing(startPoint, turnaroundPoint);
             const bodyMid = turf.destination(figureStartPoint, L/2, initialBearing, { units: 'kilometers' });
             const bodyTop = turf.destination(bodyMid, L/3, initialBearing - 90, { units: 'kilometers' });
             const nose = turf.destination(figureStartPoint, L, initialBearing, { units: 'kilometers' });
             const bodyBottom = turf.destination(bodyMid, L/3, initialBearing + 90, { units: 'kilometers' });
             const tail1 = turf.destination(figureStartPoint, L/2, initialBearing + 160, { units: 'kilometers' });
             const tail2 = turf.destination(figureStartPoint, L/2, initialBearing + 200, { units: 'kilometers' });
             waypoints.push(figureStartPoint, bodyTop, nose, bodyBottom, figureStartPoint, tail1, tail2, figureStartPoint, startPoint);
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

        // --- Apply Avontuur (Randomness) and Bending to Shapes ---
        if (shape !== 'loop' && !returnLocation) {
            const randOut = randomnessOutbound !== undefined ? randomnessOutbound : (randomness || 0);
            const bendOut = bendingOutbound !== undefined ? bendingOutbound : (bending || 0);
            
            // Apply modifications to all points EXCEPT startPoint and the final return to startPoint
            // waypoints[0] is startPoint, waypoints[1] is figureStartPoint, waypoints[last] is startPoint
            for (let i = 1; i < waypoints.length - 1; i++) {
                let p = waypoints[i];
                
                // 1. Randomness (Avontuur)
                if (randOut > 0) {
                    const jitterDist = (Math.random() * (randOut / 10) * (currentDistance * 0.05)); 
                    const jitterBearing = Math.random() * 360;
                    p = turf.destination(p, jitterDist, jitterBearing, { units: 'kilometers' });
                }
                
                // 2. Bending (Rotate shape points slightly around figureStartPoint if bend > 0)
                if (bendOut > 0 && i > 1) {
                    const distToCenter = turf.distance(figureStartPoint, p, { units: 'kilometers' });
                    const bearingToPoint = turf.bearing(figureStartPoint, p);
                    // Shift bearing based on bending
                    const newBearing = (bearingToPoint + (bendOut * 0.5)) % 360;
                    p = turf.destination(figureStartPoint, distToCenter, newBearing, { units: 'kilometers' });
                }
                
                waypoints[i] = p;
            }
        }

        // 3. Request from ORS
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
                            // Look ahead for a return to this point (approx 50m tolerance)
                            // Increased lookahead to catch larger dead ends
                            const lookAhead = Math.min(coords.length, i + 200); 
                            
                            for (let j = i + 2; j < lookAhead; j++) {
                                const p1 = turf.point(coords[i]);
                                const p2 = turf.point(coords[j]);
                                const d = turf.distance(p1, p2, { units: 'kilometers' });
                                
                                if (d < 0.05) { // 50 meters
                                    // Calculate path length of the loop
                                    let pathLen = 0;
                                    for (let k = i; k < j; k++) {
                                        pathLen += turf.distance(turf.point(coords[k]), turf.point(coords[k+1]), { units: 'kilometers' });
                                    }
                                    
                                    // If spur is less than 5km total (e.g. 2.5km out, 2.5km back)
                                    if (pathLen < 5.0) { 
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
                    if (currentDistance < baseDistance) warnText += ` Ingekort tot ${(routeData.features[0].properties.summary.distance / 1000).toFixed(1)}km.`;
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
                                 summary: { duration: (baseDistance/25)*3600, distance: baseDistance * 1000 },
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

    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: "Error: Unexpected loop exit" }) };

  } catch (error: any) {
    console.error('Error in calculate-route:', error);
    return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Error: ${error.message || 'Internal Server Error'}` })
    };
  }
};

async function getWindData(lat: number, lon: number, dateTime?: { date: string, time: string }) {
    let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&timezone=auto`;
    
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
            url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m,wind_direction_10m&start_date=${isoDate}&end_date=${isoDate}&timezone=auto`;
            
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
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&timezone=auto`);
    if (!res.ok) throw new Error('Failed to fetch wind data');
    const data = await res.json();
    return data.current;
}
