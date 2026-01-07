
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../services/locales');
const languages = ['en', 'fr', 'de', 'es']; // Target languages
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

// Casing function
function toSentenceCase(str) {
    if (!str) return str;
    
    // Mask placeholders like {hours}, tags like <br/>, entities like &nbsp;
    const placeholders = [];
    let masked = str.replace(/\{[^}]+\}|<[^>]+>|&[a-z]+;/g, (match) => {
        placeholders.push(match);
        return `%%${placeholders.length - 1}%%`;
    });
    
    // Lowercase the whole string
    masked = masked.toLowerCase();
    
    // Uppercase first character
    if (masked.length > 0) {
        masked = masked.charAt(0).toUpperCase() + masked.slice(1);
    }
    
    // Restore placeholders
    return masked.replace(/%%(\d+)%%/g, (match, index) => {
        return placeholders[parseInt(index)];
    });
}

// Main logic
console.log('Reading source file (nl.ts)...');
const nlPath = path.join(localesDir, 'nl.ts');
const nlContent = fs.readFileSync(nlPath, 'utf8');
const nlLines = nlContent.split('\n');

// Load existing values for targets
const targetValues = {};
languages.forEach(lang => {
    targetValues[lang] = loadValues(path.join(localesDir, `${lang}.ts`));
});

// 1. Fix NL casing and prepare new template lines
console.log('Fixing NL casing...');
const newNlLines = [];
let nlFixedCount = 0;

nlLines.forEach(line => {
    const match = line.match(/^(\s*['"])(.+?)(['"]:\s*)(['"`])(.*)\4(,?)(.*)$/);
    if (match) {
        const indentKey = match[1];
        const key = match[2];
        const separator = match[3];
        const quote = match[4]; 
        const rawValue = match[5];
        const comma = match[6];
        const trailing = match[7];
        
        // Unescape
        let val = rawValue;
        if (quote === "'") val = val.replace(/\\'/g, "'");
        else if (quote === '"') val = val.replace(/\\"/g, '"');
        
        // Fix casing
        const fixedVal = toSentenceCase(val);
        
        if (val !== fixedVal) nlFixedCount++;
        
        // Escape back
        let finalVal = fixedVal;
        if (quote === "'") finalVal = finalVal.replace(/'/g, "\\'");
        else if (quote === '"') finalVal = finalVal.replace(/"/g, '\\"');
        
        newNlLines.push(`${indentKey}${key}${separator}${quote}${finalVal}${quote}${comma}${trailing}`);
    } else {
        newNlLines.push(line);
    }
});

// Save fixed NL file
fs.writeFileSync(nlPath, newNlLines.join('\n'), 'utf8');
console.log(`Saved nl.ts with ${nlFixedCount} casing fixes.`);

// 2. Process each target language using the NEW NL structure
languages.forEach(lang => {
    console.log(`Processing ${lang}...`);
    const newLines = [];
    let addedKeys = 0;
    
    // Use newNlLines as template to ensure consistency
    newNlLines.forEach(line => {
        // Check if line is a key-value pair
        const match = line.match(/^(\s*['"])(.+?)(['"]:\s*)(['"`])(.*)\4(,?)(.*)$/);
        
        if (match) {
            const indentKey = match[1];
            const key = match[2];
            const separator = match[3];
            const quote = match[4]; // quote used in NL
            const nlRawValue = match[5]; // This is now the FIXED NL value
            const comma = match[6];
            const trailing = match[7];
            
            // Unescape NL value for fallback
             let nlVal = nlRawValue;
            if (quote === "'") {
                nlVal = nlVal.replace(/\\'/g, "'");
            } else if (quote === '"') {
                nlVal = nlVal.replace(/\\"/g, '"');
            }

            // Determine value
            let val = targetValues[lang].get(key);
            
            if (val === undefined) {
                // Missing key: Use NL value
                val = nlVal;
                addedKeys++;
            }
            
            // Apply casing
            const fixedVal = toSentenceCase(val);
            
            // Reconstruct line
            // Escape quotes in fixedVal based on NL quote
            let finalVal = fixedVal;
            if (quote === "'") {
                finalVal = finalVal.replace(/'/g, "\\'");
            } else if (quote === '"') {
                finalVal = finalVal.replace(/"/g, '\\"');
            }
            
            newLines.push(`${indentKey}${key}${separator}${quote}${finalVal}${quote}${comma}${trailing}`);
        } else {
            // Not a key-value line. Copy structure.
            const exportMatch = line.match(/export const nl: Dictionary/);
            if (exportMatch) {
                newLines.push(line.replace('export const nl:', `export const ${lang}:`));
            } else {
                newLines.push(line);
            }
        }
    });
    
    // Write file
    fs.writeFileSync(path.join(localesDir, `${lang}.ts`), newLines.join('\n'), 'utf8');
    console.log(`  Saved ${lang}.ts (Added ${addedKeys} missing keys)`);
});

console.log('Synchronization complete.');
