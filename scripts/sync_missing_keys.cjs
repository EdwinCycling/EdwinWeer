
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../services/locales');
const languages = ['fr', 'de', 'es']; 
const sourceLang = 'nl';

function loadValues(filePath) {
    if (!fs.existsSync(filePath)) return new Map();
    const content = fs.readFileSync(filePath, 'utf8');
    const map = new Map();
    const lines = content.split('\n');
    lines.forEach(line => {
        const match = line.match(/^\s*['"](.+?)['"]:\s*(['"`])(.*)\2,?\s*$/);
        if (match) {
            const quote = match[2];
            let val = match[3];
            if (quote === "'") val = val.replace(/\\'/g, "'");
            else if (quote === '"') val = val.replace(/\\"/g, '"');
            map.set(match[1], val);
        }
    });
    return map;
}

const nlValues = loadValues(path.join(localesDir, 'nl.ts'));

languages.forEach(lang => {
    const targetPath = path.join(localesDir, `${lang}.ts`);
    const targetValues = loadValues(targetPath);
    
    let content = fs.readFileSync(targetPath, 'utf8');
    // Remove last closing brace
    content = content.replace(/\s*};\s*$/, '');
    
    let addedCount = 0;
    
    nlValues.forEach((val, key) => {
        if (!targetValues.has(key)) {
            // Escape value for single quotes
            const escapedVal = val.replace(/'/g, "\\'");
            content += `\n    '${key}': '${escapedVal}',`;
            addedCount++;
        }
    });
    
    content += '\n};\n';
    
    if (addedCount > 0) {
        fs.writeFileSync(targetPath, content, 'utf8');
        console.log(`Added ${addedCount} missing keys to ${lang}.ts`);
    } else {
        console.log(`No missing keys in ${lang}.ts`);
    }
});
