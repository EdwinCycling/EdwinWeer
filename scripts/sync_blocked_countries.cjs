const fs = require('fs');
const path = require('path');

const tsFilePath = path.join(__dirname, '../src/config/blockedCountries.ts');
const tomlFilePath = path.join(__dirname, '../netlify.toml');

function sync() {
    console.log('Synchronizing blocked countries...');

    // 1. Read the TS file
    const tsContent = fs.readFileSync(tsFilePath, 'utf8');
    
    // 2. Extract the array using regex
    // Clean up comments first
    const cleanTsContent = tsContent.replace(/\/\/.*$/gm, '');
    const arrayMatch = cleanTsContent.match(/BLOCKED_COUNTRIES\s*=\s*\[([\s\S]*?)\]/);
    
    if (!arrayMatch) {
        console.error('Could not find BLOCKED_COUNTRIES array in ' + tsFilePath);
        process.exit(1);
    }

    // Clean up the extracted string to get just the codes
    const codes = arrayMatch[1]
        .split(',')
        .map(code => code.trim().replace(/['"\s]/g, ''))
        .filter(code => code.length === 2); // ISO codes are 2 chars

    if (codes.length === 0) {
        console.warn('No blocked countries found in the list.');
    }

    console.log('Found blocked countries:', codes.join(', '));

    // 3. Read the TOML file
    let tomlContent = fs.readFileSync(tomlFilePath, 'utf8');

    // 4. Replace the Country list in netlify.toml
    // Looks for: conditions = {Country = [...]}
    const tomlRegex = /(conditions\s*=\s*\{Country\s*=\s*\[)([\s\S]*?)(\]\})/;
    
    const formattedCodes = codes.map(c => `"${c}"`).join(', ');
    const newTomlContent = tomlContent.replace(tomlRegex, `$1${formattedCodes}$3`);

    if (tomlContent === newTomlContent) {
        if (!tomlContent.match(tomlRegex)) {
            console.error('Could not find the [redirects] section with Country conditions in netlify.toml');
            process.exit(1);
        }
        console.log('netlify.toml is already up to date.');
    } else {
        // 5. Write the updated TOML file
        fs.writeFileSync(tomlFilePath, newTomlContent, 'utf8');
        console.log('Successfully updated netlify.toml with the new blocked countries list.');
    }
}

try {
    sync();
} catch (err) {
    console.error('Error during synchronization:', err.message);
    process.exit(1);
}
