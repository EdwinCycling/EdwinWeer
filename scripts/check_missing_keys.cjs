
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../services/locales');
const languages = ['fr', 'de', 'es']; // Target languages
const sourceLang = 'nl';

// Helper to load current values from a file into a Map
function loadValues(filePath) {
    if (!fs.existsSync(filePath)) return new Map();
    const content = fs.readFileSync(filePath, 'utf8');
    const map = new Map();
    const lines = content.split('\n');
    lines.forEach(line => {
        // Regex to capture key and value. 
        // Handles: 'key': 'value',
        const match = line.match(/^\s*['"](.+?)['"]:\s*(['"`])(.*)\2,?\s*$/);
        if (match) {
            const quote = match[2];
            let val = match[3];
            // Unescape quotes if they match the wrapper
            if (quote === "'") {
                val = val.replace(/\\'/g, "'");
            } else if (quote === '"') {
                val = val.replace(/\\"/g, '"');
            }
            map.set(match[1], val);
        }
    });
    return map;
}

const nlValues = loadValues(path.join(localesDir, 'nl.ts'));

languages.forEach(lang => {
    console.log(`\nChecking ${lang}...`);
    const targetValues = loadValues(path.join(localesDir, `${lang}.ts`));
    
    const missingKeys = [];
    const untranslatedKeys = [];

    nlValues.forEach((nlVal, key) => {
        if (!targetValues.has(key)) {
            missingKeys.push(key);
        } else {
            const targetVal = targetValues.get(key);
            if (targetVal === nlVal && nlVal.length > 2 && !/^\d+$/.test(nlVal)) {
                // If values are identical, it MIGHT be untranslated.
                // We ignore very short strings or numbers as they might be the same.
                untranslatedKeys.push({key, val: nlVal});
            }
        }
    });

    if (missingKeys.length > 0) {
        console.log(`Missing keys in ${lang}:`);
        missingKeys.forEach(k => console.log(`  - ${k}`));
    } else {
        console.log(`No missing keys in ${lang}.`);
    }

    if (untranslatedKeys.length > 0) {
        console.log(`Potentially untranslated keys (same as NL) in ${lang}:`);
        untranslatedKeys.forEach(item => console.log(`  - ${item.key}: "${item.val}"`));
    } else {
        console.log(`No potentially untranslated keys in ${lang}.`);
    }
});
