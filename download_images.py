#!/usr/bin/env python3
"""
Download Wikipedia/Fandom images for all ximg-web apps and create manifests.
"""

import re
import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

BASE = Path('/root/ximg-web')

APPS = [
    'butterfly', 'pizza', 'moto', 'kombat', 'monkey', 'guns', 'wargames',
    'chinese', 'computers', 'america', 'india', 'linux', 'doom', 'mario',
    'wood', 'florida', 'poker', 'tampa',
]

SAFE_RE = re.compile(r'[/\?%\*:|"<>]')

def safe_name(key):
    return SAFE_RE.sub('_', key)

def get_ext(url):
    path = urllib.parse.urlparse(url).path
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'):
        return ext
    return '.jpg'

def download_file(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': 'ximg-web-localizer/1.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return True
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 3 * (attempt + 1)
                print(f"    429 rate-limited, waiting {wait}s (attempt {attempt+1}/4)...")
                time.sleep(wait)
                continue
            print(f"    ERROR downloading {url}: HTTP {e.code}")
            return False
        except Exception as e:
            print(f"    ERROR downloading {url}: {e}")
            return False
    print(f"    FAILED after 4 attempts: {url}")
    return False

def wiki_api(key):
    """Get thumbnail URL from Wikipedia REST API. Returns (thumb_url, resolved_title) or (None, None)."""
    encoded = urllib.parse.quote(key, safe='')
    url = f'https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}'
    req = urllib.request.Request(url, headers={'User-Agent': 'ximg-web-localizer/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        thumb = data.get('thumbnail', {}).get('source')
        title = data.get('title', '')
        return thumb, title
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None, None
        print(f"    HTTP {e.code} for wiki key: {key}")
        return None, None
    except Exception as e:
        print(f"    ERROR wiki_api({key}): {e}")
        return None, None

def fandom_api(name):
    """Get thumbnail URL from Mortal Kombat fandom wiki."""
    fandom_title = name.replace(' ', '_')
    encoded = urllib.parse.quote(fandom_title, safe='')
    url = (f'https://mortalkombat.fandom.com/api.php?action=query&titles={encoded}'
           f'&prop=pageimages&format=json&pithumbsize=400&origin=*')
    req = urllib.request.Request(url, headers={'User-Agent': 'ximg-web-localizer/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        pages = data.get('query', {}).get('pages', {})
        for page in pages.values():
            thumb = page.get('thumbnail', {}).get('source')
            if thumb:
                return thumb
        return None
    except Exception as e:
        print(f"    ERROR fandom_api({name}): {e}")
        return None

def extract_wiki_keys(html_path):
    """Extract all unique wiki keys from an HTML file."""
    text = Path(html_path).read_text(encoding='utf-8')
    keys = set()
    # Match wiki:'...' and wiki:"..." in JS data objects (not template literals)
    for m in re.finditer(r"""wiki:\s*['"]([^'"${}]+)['"]""", text):
        k = m.group(1).strip()
        if k and '$' not in k and '{' not in k:
            keys.add(k)
    # Also match data-wiki="..." in HTML attributes (not template literal values)
    for m in re.finditer(r'data-wiki="([^"${}]+)"', text):
        k = m.group(1).strip()
        if k and '$' not in k and '{' not in k:
            keys.add(k)
    return sorted(keys)

def process_app(app, extra_downloads=None):
    html_path = BASE / f'{app}-html' / 'index.html'
    if not html_path.exists():
        print(f"  SKIP: no index.html for {app}")
        return {}

    images_dir = BASE / f'{app}-html' / 'images'
    images_dir.mkdir(parents=True, exist_ok=True)

    keys = extract_wiki_keys(html_path)
    print(f"\n{'='*60}")
    print(f"APP: {app} — {len(keys)} wiki keys")

    manifest = {}
    downloaded = 0
    failed = 0

    for key in keys:
        sname = safe_name(key)
        # Check if already downloaded (any extension)
        existing = list(images_dir.glob(f'{sname}.*'))
        if existing:
            # Already have it
            manifest[key] = existing[0].name
            downloaded += 1
            print(f"  [CACHED] {key} -> {existing[0].name}")
            continue

        thumb_url, resolved_title = wiki_api(key)
        time.sleep(0.5)

        if thumb_url:
            ext = get_ext(thumb_url)
            filename = sname + ext
            dest = images_dir / filename
            print(f"  [WIKI] {key} -> {filename}")
            if download_file(thumb_url, dest):
                manifest[key] = filename
                downloaded += 1
            else:
                failed += 1
        else:
            # For kombat, try fandom
            if app == 'kombat':
                # Extract first word of character name from wiki key
                char_name = urllib.parse.unquote(key).replace('_', ' ')
                # Remove (Mortal_Kombat) suffix etc
                char_name_clean = re.sub(r'\s*\(.*\)', '', char_name).strip()
                print(f"  [FANDOM] trying: {char_name_clean}")
                fandom_url = fandom_api(char_name_clean)
                time.sleep(0.5)
                if fandom_url:
                    ext = get_ext(fandom_url)
                    filename = sname + ext
                    dest = images_dir / filename
                    print(f"  [FANDOM] {key} -> {filename}")
                    if download_file(fandom_url, dest):
                        manifest[key] = filename
                        downloaded += 1
                    else:
                        failed += 1
                else:
                    print(f"  [MISS] {key}")
                    failed += 1
            else:
                print(f"  [MISS] {key}")
                failed += 1

    # Handle extra hardcoded downloads
    if extra_downloads:
        for url, dest_name in extra_downloads:
            dest = images_dir / dest_name
            if dest.exists():
                print(f"  [CACHED] hardcoded: {dest_name}")
            else:
                print(f"  [HARD] downloading {dest_name}")
                download_file(url, dest)

    # Write manifest
    manifest_path = images_dir / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\n  RESULT: {downloaded} downloaded, {failed} missing")
    print(f"  Manifest: {manifest_path}")
    return manifest

def main():
    results = {}

    for app in APPS:
        extra = None
        if app == 'kombat':
            extra = [
                ('https://upload.wikimedia.org/wikipedia/en/b/b4/KungLaoartwork.png',
                 'KungLaoartwork.png'),
            ]
        manifest = process_app(app, extra_downloads=extra)
        results[app] = manifest

    print("\n\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    for app in APPS:
        m = results[app]
        html_path = BASE / f'{app}-html' / 'index.html'
        if not html_path.exists():
            print(f"  {app}: SKIPPED (no HTML)")
            continue
        keys = extract_wiki_keys(html_path)
        hits = len(m)
        total = len(keys)
        print(f"  {app}: {hits}/{total} images")

if __name__ == '__main__':
    main()
