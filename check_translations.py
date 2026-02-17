import re
import os

def parse_ts_file(path):
    keys = {}
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
        # Regex to find 'key': 'value'
        # Handles escaped quotes in value
        matches = re.findall(r"^\s*'([^']+)'\s*:\s*(['\"].*?['\"]),?$", content, re.MULTILINE)
        for key, val in matches:
            # strip quotes from val
            val_clean = val[1:-1]
            keys[key] = val_clean
    return keys

def check_file(lang, path, nl_keys):
    print(f"--- Checking {lang} ---")
    lang_keys = parse_ts_file(path)
    
    missing = []
    for k in nl_keys:
        if k not in lang_keys:
            missing.append(k)
            
    print(f"Missing keys: {len(missing)}")
    for m in missing:
        print(f"MISSING: {m} (NL: {nl_keys[m]})")
        
    # Check for Dutch values (heuristic)
    dutch_values = []
    for k, v in lang_keys.items():
        if k in nl_keys:
            nl_val = nl_keys[k]
            # specific check for Dutch words or exact match if long
            if v == nl_val and len(v) > 5 and not v.replace(' ','').isnumeric():
                 # Ignore some common ones or technical ones
                 if k not in ['app.title_prefix', 'ambient.bresser', 'bigben.inscription']:
                    dutch_values.append((k, v))
    
    print(f"Potential Dutch values: {len(dutch_values)}")
    for k, v in dutch_values:
        print(f"DUTCH?: {k} = {v}")

    # Check for Title Case
    title_case = []
    for k, v in lang_keys.items():
        words = v.split()
        if len(words) > 3:
            # Check if all words (except small ones) are capitalized
            capitalized_words = [w for w in words if w[0].isupper()]
            if len(capitalized_words) == len(words):
                 # Ignore ALL CAPS
                 if not v.isupper():
                    title_case.append((k, v))
    
    print(f"Title Case Strings: {len(title_case)}")
    for k, v in title_case:
        print(f"TITLE CASE: {k} = {v}")

nl_path = r'c:\Users\Edwin\Documents\Apps\weer\services\locales\nl.ts'
nl_keys = parse_ts_file(nl_path)

files = {
    'en': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\en.ts',
    # 'de': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\de.ts',
    # 'fr': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\fr.ts',
    # 'es': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\es.ts'
}

for lang, path in files.items():
    check_file(lang, path, nl_keys)
