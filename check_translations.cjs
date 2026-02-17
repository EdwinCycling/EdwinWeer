const fs = require('fs');
const path = require('path');

function parseTsFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const keys = {};
    const lines = content.split('\n');
    // Regex for single or double quoted keys
    const regex = /^\s*['"]?([^'"]+)['"]?\s*:\s*(['"`].*?['"`]),?,?$/;
    
    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            let val = match[2];
            if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"')) || (val.startsWith('`') && val.endsWith('`'))) {
                val = val.substring(1, val.length - 1);
            }
            keys[match[1]] = val;
        }
    });
    return keys;
}

const basePath = 'c:\\Users\\Edwin\\Documents\\Apps\\weer\\services\\locales';
const nlPath = path.join(basePath, 'nl.ts');
let nlKeys = {};

try {
    nlKeys = parseTsFile(nlPath);
} catch (e) {
    console.error("Could not read nl.ts", e);
    process.exit(1);
}

const files = {
    'en': path.join(basePath, 'en.ts'),
    'de': path.join(basePath, 'de.ts'),
    'es': path.join(basePath, 'es.ts'),
    'fr': path.join(basePath, 'fr.ts')
};

const langToCheck = process.argv[2];
const filesToCheck = langToCheck ? {[langToCheck]: files[langToCheck]} : files;

const ignoreKeys = [
    'app.title_prefix', 'ambient.bresser', 'bigben.inscription', 'landing.login_google', 
    'share.template.insta', 'share.template.cinematic', 'share.template.minimal', 
    'share.template.classic', 'share.template.post', 'share.template.badge', 
    'share.template.frame', 'share.template.data', 'share.template.news', 
    'share.template.bubble', 'share.sticker.selected', 'share.sticker.remove',
    'share.sticker.position', 'share.sticker.size', 'share.text_options',
    'share.text_color', 'share.font_family', 'share.font_size', 'share.size.small',
    'share.size.normal', 'share.size.large', 'share.size.xl',
    'ambient.chromecast.status', 'ambient.chromecast.header', 'game.deadline',
    'baro_rit_advies.shape.zigzag', 'baro_rit_advies.shape.boomerang', 'planet.jupiter',
    'horizon.title', 'messenger.title', 'planner.score_perfect', 'forecast.view_compact',
    'faq.cat.account', 'landing.feature_ai', 'usage.status', 'activity.tennis',
    'footer.disclaimer_title', 'footer.cookies', 'settings.calendar.heatmap',
    'yourday.credits', 'history.min_lt_0', 'history.max_lt_0', 'history.table_max_temp',
    'history.table_min_temp', 'share.fields.uv_index', 'share.fields.temp_min',
    'share.fields.temp_max', 'share.stickers_title', 'month.dec', 'month.nov',
    'month.sep', 'trip_planner.gpx_start_country', 'trip_planner.gpx_import_country',
    'trip_planner.gpx_start_name', 'trip_planner.gpx_import_name', 'profile.schedule.lunch',
    'records.sequences.streak_max_above_35_desc', 'records.sequences.streak_max_above_30_desc',
    'records.sequences.streak_max_above_25_desc', 'records.sequences.streak_max_below_five_desc',
    'records.sequences.streak_min_below_zero_desc', 'records.sequences.streak_max_below_zero_desc',
    'min_temp', 'max_temp', 'pricing.baro_price', 'pricing.baro_powered', 'pricing.baro_credits',
    'pricing.weather_credits', 'records.dashboard', 'credits.baro', 'credits.weather',
    'max_wind', 'start_temp', 'warmer', 'tooltip.dashboard', 'temp_180m', 'temp_120m',
    'temp_80m', 'wind_180m', 'wind_120m', 'wind_80m', 'uv_max', 'details', 'uv_index',
    'info.card.ensembles_title', 'baro_rit_advies.download_gpx', 'baro_rit_advies.credits_remaining',
    'baro_rit_advies.title', 'finder.error_conflict', 'finder.scenario', 'finder.param.min_temp',
    'finder.param.max_temp', 'songwriter.title', 'menu.extra.song_writer_title',
    'favorites.compact', 'pdf', 'welcome.freemium_title', 'banned.support_email',
    'bigben.header.title', 'settings.bigben.station.label', 'settings.bigben.title',
    'ambient.settings.clock_station', 'ambient.modes.aquarium', 'nav.ensemble', 'nav.strava',
    'trip_planner.baro_index', 'trip_planner.stars', 'trip_planner.details', 'upload_gpx_short',
    'menu.extra.ambient_title', 'game.leaderboard.all_time'
];

for (const [lang, filePath] of Object.entries(filesToCheck)) {
    if (!filePath) continue;
    console.log(`\n--- Checking ${lang} ---`);
    let langKeys = {};
    try {
        langKeys = parseTsFile(filePath);
    } catch (e) {
        console.error(`Could not read ${lang} file`, e);
        continue;
    }
    
    const missing = [];
    for (const k in nlKeys) {
        if (!langKeys.hasOwnProperty(k)) {
            missing.push(k);
        }
    }
    
    console.log(`Missing keys: ${missing.length}`);
    if (missing.length > 0) {
        missing.forEach(m => console.log(`MISSING: ${m} (NL: ${nlKeys[m]})`));
    }
    
    const dutchValues = [];
    for (const k in langKeys) {
        if (nlKeys.hasOwnProperty(k)) {
            const val = langKeys[k];
            const nlVal = nlKeys[k];
            // Check if values are identical (potential untranslated)
            // Ignore short strings, numbers, and ignored keys
            if (val === nlVal && val.length > 3 && isNaN(val.replace(/ /g, '')) && !ignoreKeys.includes(k)) {
                dutchValues.push({key: k, val: val});
            }
        }
    }
    
    console.log(`Potential Dutch values: ${dutchValues.length}`);
    if (dutchValues.length > 0) {
        dutchValues.forEach(item => console.log(`DUTCH?: ${item.key} = ${item.val}`));
    }
    
    const titleCase = [];
    for (const k in langKeys) {
        const val = langKeys[k];
        if (typeof val === 'string') {
            const words = val.split(' ');
            if (words.length > 3) {
                // Check if ALL words start with uppercase (simplified check for Camel/Title Case)
                const capitalizedWords = words.filter(w => w.length > 0 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase());
                // Allow if the whole string is uppercase (titles like BIG BEN)
                if (capitalizedWords.length === words.length && val !== val.toUpperCase() && !ignoreKeys.includes(k)) {
                     titleCase.push({key: k, val: val});
                }
            }
        }
    }
    console.log(`Title Case Strings: ${titleCase.length}`);
    if (titleCase.length > 0) {
        titleCase.forEach(item => console.log(`TITLE CASE: ${item.key} = ${item.val}`));
    }
}
