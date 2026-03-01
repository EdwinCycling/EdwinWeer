export interface AppUpdate {
  version: string;
  date: string;
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
}

export const APP_UPDATES: AppUpdate[] = [
  {
    version: "1.260301.1",
    date: "2026-03-01",
    title: "Mobiel & Stripe Update 💳",
    description: "Verbeterde interface voor mobiele apparaten met een nieuwe scrollbare weergave. Stripe Checkout is vernieuwd voor een vlottere betaalervaring met automatische betaalmethoden.",
    link: "CURRENT",
    linkLabel: "Bekijk Dashboard"
  },
  {
    version: "2.2.0",
    date: "2026-02-21",
    title: "What's New & Records Update 🚀",
    description: "Blijf op de hoogte van de laatste updates met dit nieuwe notificatiesysteem. Daarnaast is de berekening van de maandamplitude in het jaaroverzicht verbeterd (Tmax fluctuatie).",
    link: "RECORDS",
    linkLabel: "Bekijk Records"
  },
  {
    version: "2.1.8",
    date: "2026-02-14",
    title: "Baro Weerman (AI) 🤖",
    description: "Jouw persoonlijke AI weerman! Ontvang dagelijkse, op maat gemaakte weerberichten gebaseerd op jouw profiel en voorkeuren.",
    link: "BARO_WEERMAN",
    linkLabel: "Ontmoet Baro"
  },
  {
    version: "2.1.5",
    date: "2026-02-07",
    title: "Nieuwe Abonnementen & Credits 💎",
    description: "Kies het pakket dat bij je past. Pro en Baro Credits geven je toegang tot meer data, hogere limieten en exclusieve AI functies.",
    link: "PRICING",
    linkLabel: "Bekijk Prijzen"
  },
  {
    version: "2.1.0",
    date: "2026-01-31",
    title: "Beat Baro Game! 🥊",
    description: "Daag onze AI en andere gebruikers uit. Voorspel de temperatuur voor hoofdsteden en win credits.",
    link: "game",
    linkLabel: "Speel Nu"
  },
  {
    version: "2.0.5",
    date: "2026-01-24",
    title: "Strava Integratie 🚴",
    description: "Koppel je Strava account en zie direct wat het weer deed tijdens je ritten. Analyseer wind, temperatuur en neerslag op je route.",
    link: "STRAVA",
    linkLabel: "Strava Connect"
  },
  {
    version: "2.0.0",
    date: "2026-01-15",
    title: "Immersive Forecast ✨",
    description: "Ervaar het weer fullscreen met prachtige achtergronden en animaties die zich aanpassen aan de huidige condities.",
    link: "IMMERSIVE_FORECAST",
    linkLabel: "Ervaar Het"
  },
  {
    version: "1.9.0",
    date: "2026-01-01",
    title: "Baro 2026 Kickoff 🎆",
    description: "We starten 2026 met een frisse update. Snellere laadtijden, bugfixes en een verbeterde interface voor mobiel.",
    link: "CURRENT",
    linkLabel: "Naar Dashboard"
  }
];
