
export interface City {
    name: string;
    lat: number;
    lon: number;
}

export const MAJOR_CITIES: City[] = [
    // --- Europe ---
    // Netherlands
    { name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
    { name: "Rotterdam", lat: 51.9225, lon: 4.4792 },
    { name: "Utrecht", lat: 52.0907, lon: 5.1214 },
    { name: "Eindhoven", lat: 51.4416, lon: 5.4697 },
    { name: "Groningen", lat: 53.2194, lon: 6.5665 },
    { name: "Maastricht", lat: 50.8514, lon: 5.6910 },
    { name: "Zwolle", lat: 52.5168, lon: 6.0830 },
    { name: "Arnhem", lat: 51.9851, lon: 5.8987 },
    { name: "Vlissingen", lat: 51.4425, lon: 3.5736 },
    { name: "Texel", lat: 53.0542, lon: 4.7972 },
    
    // Belgium
    { name: "Brussels", lat: 50.8503, lon: 4.3517 },
    { name: "Antwerp", lat: 51.2194, lon: 4.4025 },
    { name: "Ghent", lat: 51.0543, lon: 3.7174 },
    { name: "Liège", lat: 50.6326, lon: 5.5797 },
    { name: "Bruges", lat: 51.2093, lon: 3.2247 },

    // UK & Ireland
    { name: "London", lat: 51.5074, lon: -0.1278 },
    { name: "Manchester", lat: 53.4808, lon: -2.2426 },
    { name: "Birmingham", lat: 52.4862, lon: -1.8904 },
    { name: "Edinburgh", lat: 55.9533, lon: -3.1883 },
    { name: "Glasgow", lat: 55.8642, lon: -4.2518 },
    { name: "Belfast", lat: 54.5973, lon: -5.9301 },
    { name: "Dublin", lat: 53.3498, lon: -6.2603 },
    { name: "Cork", lat: 51.8985, lon: -8.4756 },

    // France
    { name: "Paris", lat: 48.8566, lon: 2.3522 },
    { name: "Lyon", lat: 45.7640, lon: 4.8357 },
    { name: "Marseille", lat: 43.2965, lon: 5.3698 },
    { name: "Bordeaux", lat: 44.8378, lon: -0.5792 },
    { name: "Toulouse", lat: 43.6045, lon: 1.4442 },
    { name: "Nice", lat: 43.7102, lon: 7.2620 },
    { name: "Nantes", lat: 47.2184, lon: -1.5536 },
    { name: "Strasbourg", lat: 48.5734, lon: 7.7521 },

    // DACH (Germany, Austria, Switzerland)
    { name: "Berlin", lat: 52.5200, lon: 13.4050 },
    { name: "Munich", lat: 48.1351, lon: 11.5820 },
    { name: "Hamburg", lat: 53.5511, lon: 9.9937 },
    { name: "Frankfurt", lat: 50.1109, lon: 8.6821 },
    { name: "Cologne", lat: 50.9375, lon: 6.9603 },
    { name: "Vienna", lat: 48.2082, lon: 16.3738 },
    { name: "Salzburg", lat: 47.8095, lon: 13.0550 },
    { name: "Innsbruck", lat: 47.2692, lon: 11.4041 },
    { name: "Zurich", lat: 47.3769, lon: 8.5417 },
    { name: "Geneva", lat: 46.2044, lon: 6.1432 },
    { name: "Bern", lat: 46.9480, lon: 7.4474 },

    // Southern Europe
    { name: "Madrid", lat: 40.4168, lon: -3.7038 },
    { name: "Barcelona", lat: 41.3851, lon: 2.1734 },
    { name: "Seville", lat: 37.3891, lon: -5.9845 },
    { name: "Valencia", lat: 39.4699, lon: -0.3763 },
    { name: "Lisbon", lat: 38.7223, lon: -9.1393 },
    { name: "Porto", lat: 41.1579, lon: -8.6291 },
    { name: "Rome", lat: 41.9028, lon: 12.4964 },
    { name: "Milan", lat: 45.4642, lon: 9.1900 },
    { name: "Naples", lat: 40.8518, lon: 14.2681 },
    { name: "Venice", lat: 45.4408, lon: 12.3155 },
    { name: "Athens", lat: 37.9838, lon: 23.7275 },
    { name: "Thessaloniki", lat: 40.6401, lon: 22.9444 },

    // Nordic & Baltic
    { name: "Copenhagen", lat: 55.6761, lon: 12.5683 },
    { name: "Stockholm", lat: 59.3293, lon: 18.0686 },
    { name: "Gothenburg", lat: 57.7089, lon: 11.9746 },
    { name: "Oslo", lat: 59.9139, lon: 10.7522 },
    { name: "Bergen", lat: 60.3913, lon: 5.3221 },
    { name: "Helsinki", lat: 60.1699, lon: 24.9384 },
    { name: "Reykjavik", lat: 64.1265, lon: -21.8174 },
    { name: "Tallinn", lat: 59.4370, lon: 24.7536 },
    { name: "Riga", lat: 56.9496, lon: 24.1052 },

    // Eastern Europe
    { name: "Warsaw", lat: 52.2297, lon: 21.0122 },
    { name: "Krakow", lat: 50.0647, lon: 19.9450 },
    { name: "Prague", lat: 50.0755, lon: 14.4378 },
    { name: "Budapest", lat: 47.4979, lon: 19.0402 },
    { name: "Bucharest", lat: 44.4268, lon: 26.1025 },
    { name: "Sofia", lat: 42.6977, lon: 23.3219 },
    { name: "Kiev", lat: 50.4501, lon: 30.5234 },
    { name: "Lviv", lat: 49.8397, lon: 24.0297 },
    { name: "Moscow", lat: 55.7558, lon: 37.6173 },
    { name: "St Petersburg", lat: 59.9343, lon: 30.3351 },

    // --- North America ---
    // USA East
    { name: "New York", lat: 40.7128, lon: -74.0060 },
    { name: "Boston", lat: 42.3601, lon: -71.0589 },
    { name: "Washington DC", lat: 38.9072, lon: -77.0369 },
    { name: "Atlanta", lat: 33.7490, lon: -84.3880 },
    { name: "Miami", lat: 25.7617, lon: -80.1918 },
    { name: "Orlando", lat: 28.5383, lon: -81.3792 },
    
    // USA Central
    { name: "Chicago", lat: 41.8781, lon: -87.6298 },
    { name: "Houston", lat: 29.7604, lon: -95.3698 },
    { name: "Dallas", lat: 32.7767, lon: -96.7970 },
    { name: "Denver", lat: 39.7392, lon: -104.9903 },
    { name: "Minneapolis", lat: 44.9778, lon: -93.2650 },
    
    // USA West
    { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
    { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
    { name: "Seattle", lat: 47.6062, lon: -122.3321 },
    { name: "Las Vegas", lat: 36.1699, lon: -115.1398 },
    { name: "Phoenix", lat: 33.4484, lon: -112.0740 },

    // Canada
    { name: "Toronto", lat: 43.6510, lon: -79.3470 },
    { name: "Montreal", lat: 45.5017, lon: -73.5673 },
    { name: "Vancouver", lat: 49.2827, lon: -123.1207 },
    { name: "Calgary", lat: 51.0447, lon: -114.0719 },

    // Mexico
    { name: "Mexico City", lat: 19.4326, lon: -99.1332 },
    { name: "Cancún", lat: 21.1619, lon: -86.8515 },

    // --- South America ---
    { name: "São Paulo", lat: -23.5505, lon: -46.6333 },
    { name: "Rio de Janeiro", lat: -22.9068, lon: -43.1729 },
    { name: "Buenos Aires", lat: -34.6037, lon: -58.3816 },
    { name: "Santiago", lat: -33.4489, lon: -70.6693 },
    { name: "Lima", lat: -12.0464, lon: -77.0428 },
    { name: "Bogotá", lat: 4.7110, lon: -74.0721 },
    { name: "Caracas", lat: 10.4806, lon: -66.9036 },
    { name: "Quito", lat: -0.1807, lon: -78.4678 },

    // --- Asia ---
    { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
    { name: "Osaka", lat: 34.6937, lon: 135.5023 },
    { name: "Seoul", lat: 37.5665, lon: 126.9780 },
    { name: "Beijing", lat: 39.9042, lon: 116.4074 },
    { name: "Shanghai", lat: 31.2304, lon: 121.4737 },
    { name: "Hong Kong", lat: 22.3193, lon: 114.1694 },
    { name: "Taipei", lat: 25.0330, lon: 121.5654 },
    { name: "Bangkok", lat: 13.7563, lon: 100.5018 },
    { name: "Singapore", lat: 1.3521, lon: 103.8198 },
    { name: "Hanoi", lat: 21.0285, lon: 105.8542 },
    { name: "Manila", lat: 14.5995, lon: 120.9842 },
    { name: "Jakarta", lat: -6.2088, lon: 106.8456 },
    { name: "Bali", lat: -8.4095, lon: 115.1889 },
    { name: "New Delhi", lat: 28.6139, lon: 77.2090 },
    { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
    { name: "Bangalore", lat: 12.9716, lon: 77.5946 },
    { name: "Dubai", lat: 25.2048, lon: 55.2708 },
    { name: "Riyadh", lat: 24.7136, lon: 46.6753 },
    { name: "Tehran", lat: 35.6892, lon: 51.3890 },
    { name: "Istanbul", lat: 41.0082, lon: 28.9784 },
    { name: "Novosibirsk", lat: 55.0084, lon: 82.9357 },

    // --- Africa ---
    { name: "Cairo", lat: 30.0444, lon: 31.2357 },
    { name: "Lagos", lat: 6.5244, lon: 3.3792 },
    { name: "Nairobi", lat: -1.2921, lon: 36.8219 },
    { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
    { name: "Johannesburg", lat: -26.2041, lon: 28.0473 },
    { name: "Casablanca", lat: 33.5731, lon: -7.5898 },
    { name: "Marrakech", lat: 31.6295, lon: -7.9811 },
    { name: "Tunis", lat: 36.8065, lon: 10.1815 },
    { name: "Addis Ababa", lat: 9.0300, lon: 38.7400 },

    // --- Oceania ---
    { name: "Sydney", lat: -33.8688, lon: 151.2093 },
    { name: "Melbourne", lat: -37.8136, lon: 144.9631 },
    { name: "Brisbane", lat: -27.4698, lon: 153.0251 },
    { name: "Perth", lat: -31.9505, lon: 115.8605 },
    { name: "Auckland", lat: -36.8485, lon: 174.7633 },
    { name: "Christchurch", lat: -43.5320, lon: 172.6362 }
];
