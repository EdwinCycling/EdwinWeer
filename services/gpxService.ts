export interface GPXPoint {
    lat: number;
    lon: number;
    ele: number;
    time: Date | null;
    distFromStart: number; // in km
}

export const parseGpx = (gpxText: string): GPXPoint[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    
    // Handle GPX namespaces - try standard 'trkpt' first, then 'rtept'
    let points = Array.from(xmlDoc.getElementsByTagName('trkpt'));
    if (points.length === 0) {
        points = Array.from(xmlDoc.getElementsByTagName('rtept'));
    }
    
    if (points.length === 0) {
        throw new Error("No track points found in GPX");
    }

    const parsedPoints: GPXPoint[] = [];
    let totalDist = 0;

    for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const lat = parseFloat(pt.getAttribute('lat') || '0');
        const lon = parseFloat(pt.getAttribute('lon') || '0');
        const ele = parseFloat(pt.getElementsByTagName('ele')[0]?.textContent || '0');
        const timeStr = pt.getElementsByTagName('time')[0]?.textContent;
        const time = timeStr ? new Date(timeStr) : null;

        let distFromStart = 0;
        if (i > 0) {
            const prev = parsedPoints[i - 1];
            const dist = getDistance(prev.lat, prev.lon, lat, lon);
            totalDist += dist;
            distFromStart = totalDist;
        }

        parsedPoints.push({
            lat,
            lon,
            ele,
            time,
            distFromStart
        });
    }

    return parsedPoints;
};

export const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    const θ = Math.atan2(y, x);
    const brng = (θ * 180 / Math.PI + 360) % 360; // in degrees
    return brng;
};

export const generateGpx = (geoJson: any, name: string): string => {
    if (!geoJson || !geoJson.features || !geoJson.features[0] || !geoJson.features[0].geometry || !geoJson.features[0].geometry.coordinates) {
        throw new Error("Invalid GeoJSON data");
    }

    const coordinates = geoJson.features[0].geometry.coordinates; // [lon, lat]
    
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BaroApp" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${name}</name>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
`;

    for (const coord of coordinates) {
        // GeoJSON is [lon, lat, ele?], GPX needs lat=".." lon=".."
        const lon = coord[0];
        const lat = coord[1];
        const ele = coord[2] !== undefined ? `<ele>${coord[2]}</ele>` : '';
        gpx += `      <trkpt lat="${lat}" lon="${lon}">${ele}</trkpt>\n`;
    }

    gpx += `    </trkseg>
  </trk>
</gpx>`;

    return gpx;
};
