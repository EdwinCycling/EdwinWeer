import os

files = {
    'es': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\es.ts',
    'fr': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\fr.ts',
    'de': r'c:\Users\Edwin\Documents\Apps\weer\services\locales\de.ts'
}

def fix_file(lang, path):
    print(f"Processing {lang}...")
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return
    
    # Identify the "Bottom Block"
    start_bottom = -1
    end_bottom = -1
    
    for i, line in enumerate(lines):
        if i > 1000 and "'comfort.modal.title':" in line:
            # Check if it's the bottom one (there might be one at top)
            # Top one is usually around 1100-1200. Bottom one is > 1300.
            # Let's find ALL occurrences and pick the last one.
            pass
            
    # Better approach: Find all indices of title start
    title_indices = [i for i, line in enumerate(lines) if "'comfort.modal.title':" in line]
    
    if not title_indices:
        print(f"No comfort.modal.title found in {lang}")
        return
        
    # The last one is the bottom block (duplicate)
    start_bottom = title_indices[-1]
    
    # Find end of bottom block
    # It ends at 'comfort.modal.summary'
    for i in range(start_bottom, len(lines)):
        if "'comfort.modal.summary':" in lines[i]:
            end_bottom = i
            break
            
    if end_bottom == -1:
        print(f"Could not find end of bottom block in {lang}")
        return
        
    print(f"Found bottom block at {start_bottom}-{end_bottom}")
    
    bottom_block = lines[start_bottom:end_bottom+1]
    
    if lang == 'es':
        # For es, we already inserted the top block (so there are 2 blocks).
        # We just need to remove the bottom one.
        # But wait, if I inserted it, there are 2 blocks.
        # If I didn't, there is 1 block (at bottom).
        # Check if there is a top block.
        if len(title_indices) > 1:
            # Two blocks. Remove the last one.
            new_lines = lines[:start_bottom] + lines[end_bottom+1:]
            print("Removing duplicate bottom block in es.ts")
        else:
            # Only one block (the bottom one). Move it to top?
            # Or assume I failed to insert top block?
            # My previous analysis said insertion SUCCEEDED.
            # So len(title_indices) should be 2.
            # If it is 1, it means insertion failed or I was wrong.
            # If 1, I should move it.
            print("Only 1 block found in es.ts. Moving to top...")
            
            # Find where to insert (// Comfort Score Modal)
            insert_idx = -1
            for i, line in enumerate(lines):
                if "// Comfort Score Modal" in line:
                    insert_idx = i + 1
                    break
            
            if insert_idx != -1:
                # Remove from bottom first (to not mess up indices if we insert first? No, list slicing is safe if we use original lines)
                # We want: [0...insert_idx] + bottom_block + [insert_idx...start_bottom] + [end_bottom+1...]
                # But start_bottom is AFTER insert_idx.
                
                # Check if bottom block lines have commas.
                # If moving, we need to ensure formatting.
                # Bottom block usually has commas.
                
                new_lines = lines[:insert_idx] + bottom_block + lines[insert_idx:start_bottom] + lines[end_bottom+1:]
            else:
                print("Could not find insertion point in es.ts")
                return

    else: # fr, de
        # Check if top block exists
        if len(title_indices) > 1:
            start_top = title_indices[0]
            # Find end of top block
            # It's likely short (2 lines) or long.
            # We want to replace it with bottom_block (which is definitely long/full).
            
            # Find where top block ends.
            # It ends when we hit an empty line or comment or next section.
            end_top = start_top
            while end_top < len(lines) and "forecast.activities" not in lines[end_top] and "// Forecast Buttons" not in lines[end_top] and lines[end_top].strip() != "":
                end_top += 1
            
            # Adjust end_top to not include empty lines?
            # Actually, we want to remove the lines that are part of the block.
            # If it's just title and intro, it's 2 lines.
            # Let's verify.
            
            print(f"Replacing top block at {start_top}-{end_top} with bottom block")
            
            new_lines = lines[:start_top] + bottom_block + lines[end_top:start_bottom] + lines[end_bottom+1:]
            
        else:
             # Only 1 block (bottom). Move to top.
             print(f"Only 1 block found in {lang}. Moving to top...")
             insert_idx = -1
             for i, line in enumerate(lines):
                if "// Comfort Score Modal" in line:
                    insert_idx = i + 1
                    break
             
             if insert_idx != -1:
                 new_lines = lines[:insert_idx] + bottom_block + lines[insert_idx:start_bottom] + lines[end_bottom+1:]
             else:
                 print(f"Could not find insertion point in {lang}")
                 return

    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print(f"Fixed {lang}.ts")

for lang, path in files.items():
    fix_file(lang, path)
