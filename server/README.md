# Server-side Security Implementation

Deze map bevat de server-side code voor de beveiligingsaanbevelingen. Omdat de hoofdapplicatie een client-side React applicatie is, moeten deze componenten apart worden gedraaid of gedeployed.

## 1. Proxy Server (Rate Limiting & API Hiding)
Bestand: `server/proxy.js`

Deze Node.js Express server fungeert als een beveiligde gateway tussen de frontend en de OpenMeteo API.

### Installatie
Om de proxy server te gebruiken:

1. Installeer de benodigde packages:
   ```bash
   npm install express express-rate-limit
   ```

2. Start de server:
   ```bash
   node server/proxy.js
   ```

De server draait op poort 3001. Je kunt de frontend configureren om naar `http://localhost:3001/api/weather` te wijzen in plaats van direct naar OpenMeteo.

## 2. Firebase Cloud Functions (IP Tracking)
Bestand: `functions/security.ts`

Dit bestand bevat de logica voor IP-based tracking via Firebase.

### Deployment
Om dit te gebruiken moet je Firebase Cloud Functions configureren:

1. `firebase init functions`
2. Kopieer de code naar je functions map.
3. `firebase deploy --only functions`
