const fs = require('fs');
const path = require('path');

// 1. Read English source to get valid keys
const enPath = path.join(__dirname, '../services/locales/en.ts');
const enContent = fs.readFileSync(enPath, 'utf8');
const validKeys = new Set();
enContent.split('\n').forEach(line => {
    const match = line.match(/^\s*['"](.+?)['"]:/);
    if (match) validKeys.add(match[1]);
});

console.log(`Found ${validKeys.size} valid keys in en.ts`);

// 2. Define Translations
// Languages: it (Italian), pt (Portuguese), no (Norwegian), sv (Swedish), da (Danish), fi (Finnish), pl (Polish)

const translations = {
    // --- Navigation & General ---
    'nav.home': { it: 'Home', pt: 'Início', no: 'Hjem', sv: 'Hem', da: 'Hjem', fi: 'Koti', pl: 'Start' },
    'nav.forecast': { it: 'Previsioni', pt: 'Previsão', no: 'Værvarsel', sv: 'Prognos', da: 'Udsigt', fi: 'Ennuste', pl: 'Prognoza' },
    'nav.map': { it: 'Mappa', pt: 'Mapa', no: 'Kart', sv: 'Karta', da: 'Kort', fi: 'Kartta', pl: 'Mapa' },
    'nav.settings': { it: 'Impostazioni', pt: 'Configurações', no: 'Innstillinger', sv: 'Inställningar', da: 'Indstillinger', fi: 'Asetukset', pl: 'Ustawienia' },
    'nav.records': { it: 'Record', pt: 'Registros', no: 'Rekorder', sv: 'Rekord', da: 'Rekorder', fi: 'Ennätykset', pl: 'Rekordy' },
    'nav.historical': { it: 'Storico', pt: 'Histórico', no: 'Historikk', sv: 'Historik', da: 'Historik', fi: 'Historia', pl: 'Historia' },
    'nav.team': { it: 'Team', pt: 'Equipe', no: 'Team', sv: 'Team', da: 'Team', fi: 'Tiimi', pl: 'Zespół' },
    'nav.pricing': { it: 'Prezzi', pt: 'Preços', no: 'Priser', sv: 'Priser', da: 'Priser', fi: 'Hinnat', pl: 'Cennik' },
    'nav.trip_planner': { it: 'Pianificatore Viaggi', pt: 'Planejador de Viagem', no: 'Turplanlegger', sv: 'Reseplanerare', da: 'Rejseplanlægger', fi: 'Matkasuunnittelija', pl: 'Planer podróży' },
    'nav.current': { it: 'Attuale', pt: 'Atual', no: 'Nå', sv: 'Nuvarande', da: 'Nuværende', fi: 'Nykyinen', pl: 'Obecne' },
    'nav.model_info': { it: 'Modelli Meteo', pt: 'Modelos Meteorológicos', no: 'Værmodeller', sv: 'Vädermodeller', da: 'Vejrmodeller', fi: 'Säämallit', pl: 'Modele pogodowe' },
    
    // --- Months ---
    'month.jan': { it: 'Gennaio', pt: 'Janeiro', no: 'Januar', sv: 'Januari', da: 'Januar', fi: 'Tammikuu', pl: 'Styczeń' },
    'month.feb': { it: 'Febbraio', pt: 'Fevereiro', no: 'Februar', sv: 'Februari', da: 'Februar', fi: 'Helmikuu', pl: 'Luty' },
    'month.mar': { it: 'Marzo', pt: 'Março', no: 'Mars', sv: 'Mars', da: 'Marts', fi: 'Maaliskuu', pl: 'Marzec' },
    'month.apr': { it: 'Aprile', pt: 'Abril', no: 'April', sv: 'April', da: 'April', fi: 'Huhtikuu', pl: 'Kwiecień' },
    'month.may': { it: 'Maggio', pt: 'Maio', no: 'Mai', sv: 'Maj', da: 'Maj', fi: 'Toukokuu', pl: 'Maj' },
    'month.jun': { it: 'Giugno', pt: 'Junho', no: 'Juni', sv: 'Juni', da: 'Juni', fi: 'Kesäkuu', pl: 'Czerwiec' },
    'month.jul': { it: 'Luglio', pt: 'Julho', no: 'Juli', sv: 'Juli', da: 'Juli', fi: 'Heinäkuu', pl: 'Lipiec' },
    'month.aug': { it: 'Agosto', pt: 'Agosto', no: 'August', sv: 'Augusti', da: 'August', fi: 'Elokuu', pl: 'Sierpień' },
    'month.sep': { it: 'Settembre', pt: 'Setembro', no: 'September', sv: 'September', da: 'September', fi: 'Syyskuu', pl: 'Wrzesień' },
    'month.oct': { it: 'Ottobre', pt: 'Outubro', no: 'Oktober', sv: 'Oktober', da: 'Oktober', fi: 'Lokakuu', pl: 'Październik' },
    'month.nov': { it: 'Novembre', pt: 'Novembro', no: 'November', sv: 'November', da: 'November', fi: 'Marraskuu', pl: 'Listopad' },
    'month.dec': { it: 'Dicembre', pt: 'Dezembro', no: 'Desember', sv: 'December', da: 'December', fi: 'Joulukuu', pl: 'Grudzień' },

    // --- Weather Terms ---
    'forecast': { it: 'Previsione', pt: 'Previsão', no: 'Varsel', sv: 'Prognos', da: 'Udsigt', fi: 'Ennuste', pl: 'Prognoza' },
    'weather.today_label': { it: 'Oggi', pt: 'Hoje', no: 'I dag', sv: 'Idag', da: 'I dag', fi: 'Tänään', pl: 'Dzisiaj' },
    'trip_planner.tab_tomorrow': { it: 'Domani', pt: 'Amanhã', no: 'I morgen', sv: 'Imorgon', da: 'I morgen', fi: 'Huomenna', pl: 'Jutro' },
    
    'ambient.wind': { it: 'Vento', pt: 'Vento', no: 'Vind', sv: 'Vind', da: 'Vind', fi: 'Tuuli', pl: 'Wiatr' },
    'ambient.temperature': { it: 'Temperatura', pt: 'Temperatura', no: 'Temperatur', sv: 'Temperatur', da: 'Temperatur', fi: 'Lämpötila', pl: 'Temperatura' },
    'ambient.humidity': { it: 'Umidità', pt: 'Umidade', no: 'Fuktighet', sv: 'Luftfuktighet', da: 'Fugtighed', fi: 'Ilmankosteus', pl: 'Wilgotność' },
    'ambient.pressure': { it: 'Pressione', pt: 'Pressão', no: 'Trykk', sv: 'Tryck', da: 'Tryk', fi: 'Paine', pl: 'Ciśnienie' },
    'ambient.feels_like': { it: 'Percepita', pt: 'Sensação', no: 'Føles som', sv: 'Känns som', da: 'Føles som', fi: 'Tuntuu kuin', pl: 'Odczuwalna' },
    
    'month_stats.visual.sunny': { it: 'Soleggiato', pt: 'Ensolarado', no: 'Solrikt', sv: 'Soligt', da: 'Solrigt', fi: 'Aurinkoista', pl: 'Słonecznie' },
    'month_stats.visual.cloudy': { it: 'Nuvoloso', pt: 'Nublado', no: 'Skyet', sv: 'Molnigt', da: 'Skyet', fi: 'Pilvistä', pl: 'Pochmurno' },
    'month_stats.visual.rainy': { it: 'Piovoso', pt: 'Chuvoso', no: 'Regnfullt', sv: 'Regnigt', da: 'Regnfuldt', fi: 'Sateista', pl: 'Deszczowo' },
    'month_stats.visual.hot': { it: 'Caldo', pt: 'Quente', no: 'Varmt', sv: 'Varmt', da: 'Varmt', fi: 'Kuuma', pl: 'Gorąco' },
    'month_stats.visual.cold_night': { it: 'Notte Fredda', pt: 'Noite Fria', no: 'Kald natt', sv: 'Kall natt', da: 'Kold nat', fi: 'Kylmä yö', pl: 'Zimna noc' },

    // --- Trip Planner ---
    'trip_planner.cycling': { it: 'Ciclismo', pt: 'Ciclismo', no: 'Sykling', sv: 'Cykling', da: 'Cykling', fi: 'Pyöräily', pl: 'Kolarstwo' },
    'trip_planner.walking': { it: 'Camminata', pt: 'Caminhada', no: 'Gåtur', sv: 'Promenad', da: 'Gåtur', fi: 'Kävely', pl: 'Spacer' },
    'trip_planner.calculate': { it: 'Calcola', pt: 'Calcular', no: 'Beregn', sv: 'Beräkna', da: 'Beregn', fi: 'Laske', pl: 'Oblicz' },
    'trip_planner.summary': { it: 'Riepilogo', pt: 'Resumo', no: 'Sammendrag', sv: 'Sammanfattning', da: 'Oversigt', fi: 'Yhteenveto', pl: 'Podsumowanie' },

    // --- Settings ---
    'settings.language': { it: 'Lingua', pt: 'Idioma', no: 'Språk', sv: 'Språk', da: 'Sprog', fi: 'Kieli', pl: 'Język' },
    
    // --- Landing ---
    'landing.login_google': { it: 'Accedi con Google', pt: 'Entrar com Google', no: 'Logg inn med Google', sv: 'Logga in med Google', da: 'Log ind med Google', fi: 'Kirjaudu Googlella', pl: 'Zaloguj przez Google' },
    'landing.login_email_button': { it: 'Inviami un link di accesso', pt: 'Enviar link de login', no: 'Send meg en innloggingslenke', sv: 'Skicka inloggningslänk', da: 'Send mig et login-link', fi: 'Lähetä kirjautumislinkki', pl: 'Wyślij link logowania' },
    
    // --- Welcome ---
    'welcome.title': { it: 'Benvenuto in Baro!', pt: 'Bem-vindo ao Baro!', no: 'Velkommen til Baro!', sv: 'Välkommen till Baro!', da: 'Velkommen til Baro!', fi: 'Tervetuloa Baroon!', pl: 'Witaj w Baro!' },
    
    // --- Common ---
    'error': { it: 'Errore', pt: 'Erro', no: 'Feil', sv: 'Fel', da: 'Fejl', fi: 'Virhe', pl: 'Błąd' },
    'cancel': { it: 'Annulla', pt: 'Cancelar', no: 'Avbryt', sv: 'Avbryt', da: 'Annuller', fi: 'Peruuta', pl: 'Anuluj' },
    'save': { it: 'Salva', pt: 'Salvar', no: 'Lagre', sv: 'Spara', da: 'Gem', fi: 'Tallenna', pl: 'Zapisz' },
    'close': { it: 'Chiudi', pt: 'Fechar', no: 'Lukk', sv: 'Stäng', da: 'Luk', fi: 'Sulje', pl: 'Zamknij' }
};

const languages = ['it', 'pt', 'no', 'sv', 'da', 'fi', 'pl'];

languages.forEach(lang => {
    console.log(`Generating ${lang}.ts...`);
    const filePath = path.join(__dirname, `../services/locales/${lang}.ts`);
    
    let content = `import { Dictionary } from '../../types';\n\nexport const ${lang}: Dictionary = {\n`;
    
    let addedCount = 0;
    Object.entries(translations).forEach(([key, langs]) => {
        if (validKeys.has(key) && langs[lang]) {
            const val = langs[lang].replace(/'/g, "\\'");
            content += `    '${key}': '${val}',\n`;
            addedCount++;
        }
    });
    
    content += `};\n`;
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  -> Added ${addedCount} translations to ${lang}.ts`);
});

console.log('Done generating translations.');
