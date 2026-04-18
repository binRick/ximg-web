#!/usr/bin/env python3
"""Convert anchor-based single-page apps to multi-page HTML.

Each <div class="page-section" id="X"> becomes its own X.html file.
The first section becomes index.html (keeping the hero/stats that live above it).
Subnav hrefs change from #id to id.html (first section → index.html).
"""

import re, os, sys

APPS = [
    'aztec', 'babylon', 'bbs', 'british', 'civilwar', 'colonial',
    'commodore', 'communism', 'crusades', 'cuba', 'dos', 'egypt',
    'french', 'greece', 'industrial', 'medieval', 'modem', 'mongols',
    'napoleon', 'ottoman', 'pirates', 'renaissance', 'revolution',
    'rome', 'russianrev', 'samurai', 'silkroad', 'spacerace', 'vikings',
    'ww1', 'ww2'
]

ROUTING_INDICATORS = [
    'showSection', 'SECTIONS = [', 'page-section',
    'hashchange', "classList.toggle('visible')",
    "classList.add('visible')", "classList.remove('visible')",
    'location.hash', 'pushState', "getAttribute('href').slice(1)",
    'querySelectorAll(\'.sub-nav a\')', 'querySelectorAll(".sub-nav a")',
    'sub-nav a[href=',
]

def is_routing_code(text):
    return any(ind in text for ind in ROUTING_INDICATORS)

def get_elem_ids(text):
    return re.findall(r"""getElementById\(['"]([^'"]+)['"]\)""", text)

def balanced_iife_end(content, start):
    """Find the end of an IIFE starting at `start` (opening paren of (function(){...})())."""
    # Find the opening { of the function body
    brace_open = content.index('{', start)
    depth = 0
    i = brace_open
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                # Skip past })(); or })()
                rest = content[i:]
                m = re.match(r'\}(\s*\)\s*\(\s*\)\s*;?)', rest)
                if m:
                    return i + len(m.group(0))
                return i + 1
        i += 1
    return len(content)

def split_script_parts(script_content):
    """Return list of (code_text, is_routing) for each logical block in the script."""
    # Strip <script> tags
    content = re.sub(r'^<script[^>]*>\s*', '', script_content)
    content = re.sub(r'\s*</script>$', '', content)

    # Try splitting by // ── comment markers (they mark the start of each block)
    comment_split = re.split(r'(?=//\s*──)', content)
    comment_split = [c.strip() for c in comment_split if c.strip()]

    if len(comment_split) > 1:
        return [(c, is_routing_code(c)) for c in comment_split]

    # Try splitting by top-level (function(){ ... })();
    parts = []
    remaining = content
    offset = 0
    while True:
        m = re.search(r'\(function\s*\([^)]*\)\s*\{', remaining)
        if not m:
            tail = remaining.strip()
            if tail:
                parts.append((tail, is_routing_code(tail)))
            break
        pre = remaining[:m.start()].strip()
        if pre:
            parts.append((pre, is_routing_code(pre)))
        # Find end of this IIFE
        abs_start = m.start()
        end = balanced_iife_end(remaining, abs_start)
        iife_text = remaining[abs_start:end].strip()
        parts.append((iife_text, is_routing_code(iife_text)))
        remaining = remaining[end:].strip()

    if parts:
        return parts

    # Fallback: treat the whole thing as one block
    return [(content, is_routing_code(content))]


def build_page(head, bg_canvas_elem, subnav_html, hero_chunk,
               section_content, scripts_for_page, nav_js_tag,
               include_hero=False):
    """Assemble a complete HTML page."""
    parts = ['<!DOCTYPE html>\n<html lang="en">\n', head, '\n<body>']
    if bg_canvas_elem:
        parts.append('\n' + bg_canvas_elem)
    parts.append('\n' + subnav_html)
    parts.append('\n<div class="wrap">')
    if include_hero and hero_chunk.strip():
        parts.append('\n' + hero_chunk.rstrip())
    parts.append('\n' + section_content.strip())
    parts.append('\n</div>')
    for sc in scripts_for_page:
        parts.append('\n<script>\n' + sc.strip() + '\n</script>')
    parts.append('\n' + nav_js_tag)
    parts.append('\n</body>\n</html>\n')
    return ''.join(parts)


def convert_app(app):
    src = f'{app}-html/index.html'
    if not os.path.exists(src):
        print(f'  SKIP {app}: no index.html')
        return

    html = open(src, encoding='utf-8').read()

    # ── 1. Extract <head> ───────────────────────────────────────────────────
    head_m = re.search(r'<head>.*?</head>', html, re.DOTALL)
    if not head_m:
        print(f'  SKIP {app}: no <head>')
        return
    head = head_m.group(0)
    # Remove .page-section display:none / .page-section.visible rules
    head = re.sub(r'\s*\.page-section\s*\{[^}]*\}', '', head)
    head = re.sub(r'\s*\.page-section\.visible\s*\{[^}]*\}', '', head)

    # ── 2. Find background canvas element (fixed-position, outside .wrap) ──
    bg_canvas_m = re.search(
        r'<canvas\s+id="[^"]*-canvas"[^>]*></canvas>',
        html[:html.find('<div class="wrap"') if '<div class="wrap"' in html else len(html)]
    )
    bg_canvas_elem = bg_canvas_m.group(0) if bg_canvas_m else ''

    # ── 3. Extract subnav ────────────────────────────────────────────────────
    # Find the nav/div containing sub-nav links
    subnav_m = re.search(
        r'<nav[^>]*class="sub-nav-wrap"[^>]*>.*?</nav>',
        html, re.DOTALL
    )
    if not subnav_m:
        # Try alternate: <nav class="sub-nav"> directly
        subnav_m = re.search(r'<nav[^>]*class="sub-nav[^"]*"[^>]*>.*?</nav>', html, re.DOTALL)
    if not subnav_m:
        print(f'  SKIP {app}: no subnav found')
        return
    subnav_raw = subnav_m.group(0)

    # ── 4. Get section IDs in order ─────────────────────────────────────────
    # Match both orderings: class="page-section" id="x" and id="x" class="page-section"
    section_ids = re.findall(r'<div class="page-section[^"]*" id="([^"]+)"', html)
    if not section_ids:
        section_ids = re.findall(r'<div id="([^"]+)" class="page-section[^"]*"', html)
    if not section_ids:
        print(f'  SKIP {app}: no page-sections found')
        return

    first_id = section_ids[0]

    # ── 5. Build updated subnav (href="#x" → href="x.html" or "index.html") ─
    def rewrite_href(m):
        anchor_id = m.group(1)
        target = 'index.html' if anchor_id == first_id else f'{anchor_id}.html'
        return f'href="{target}"'
    subnav_html = re.sub(r'href="#([^"]+)"', rewrite_href, subnav_raw)
    # Add active-link JS snippet after the subnav
    active_js = (
        '\n<script>\n'
        'document.querySelectorAll(\'.sub-nav a\').forEach(function(a){\n'
        '  var h = a.getAttribute(\'href\');\n'
        '  var p = location.pathname;\n'
        '  if (p.endsWith(h) || (h===\'index.html\' && (p.endsWith(\'/\') || p.endsWith(\'/' + app + '\') || p.endsWith(\'index.html\')))) {\n'
        '    a.classList.add(\'active\');\n'
        '  }\n'
        '});\n'
        '</script>'
    )

    # ── 6. Extract hero (content in .wrap before first .page-section) ────────
    wrap_start = html.find('<div class="wrap">')
    m1 = html.find('<div class="page-section')
    m2 = html.find('<div id="' + section_ids[0] + '" class="page-section')
    first_section_start = min(x for x in [m1, m2] if x != -1) if any(x != -1 for x in [m1, m2]) else -1
    if wrap_start == -1 or first_section_start == -1:
        print(f'  SKIP {app}: cannot find .wrap or first page-section')
        return
    hero_chunk = html[wrap_start + len('<div class="wrap">'):first_section_start]

    # ── 7. Extract each section's content ────────────────────────────────────
    # Split html at page-section boundaries
    section_pattern = re.compile(
        r'<div class="page-section[^"]*" id="([^"]+)">(.*?)</div>\s*\n?\s*\n?\s*(?=<!--|\s*<div class="page-section|</div>\s*\n\s*\n\s*<script|\s*</div>)',
        re.DOTALL
    )
    # More robust: find each section by splitting the HTML
    sections = {}
    remaining = html[first_section_start:]
    sec_starts = [(m.start(), m.group(1) or m.group(2)) for m in re.finditer(
        r'<div class="page-section[^"]*" id="([^"]+)">|<div id="([^"]+)" class="page-section[^"]*">',
        remaining
    )]

    for idx, (start, sid) in enumerate(sec_starts):
        if idx + 1 < len(sec_starts):
            end = sec_starts[idx + 1][0]
            chunk = remaining[start:end]
        else:
            # Last section: ends before </div>\n</div>
            chunk = remaining[start:]
            # Remove the closing wrap div and everything after
            end_m = re.search(r'\n</div>\s*\n\s*\n\s*<script', chunk)
            if end_m:
                chunk = chunk[:end_m.start()]
            else:
                # Try to find the closing </div> of the page-section
                # Count nested divs
                pass
        # Strip the page-section wrapper div: remove first <div ...> and last </div>
        inner = re.sub(r'^<div(?:\s+class="page-section[^"]*"\s+id="[^"]+"|'
                       r'\s+id="[^"]+"\s+class="page-section[^"]*")>', '', chunk.strip())
        # Remove trailing </div> (the closing of page-section)
        inner = re.sub(r'</div>\s*$', '', inner.strip())
        sections[sid] = f'<section id="{sid}">\n{inner.strip()}\n</section>'

    # ── 8. Parse scripts ──────────────────────────────────────────────────────
    script_tags = re.findall(r'<script[^>]*>.*?</script>', html, re.DOTALL)
    nav_js_tag = ''
    inline_scripts = []
    for st in script_tags:
        if 'nav.js' in st or 'src=' in st:
            if 'nav.js' in st:
                nav_js_tag = st
        else:
            inline_scripts.append(st)

    # Parse inline script parts
    all_parts = []  # list of (code, is_routing)
    for st in inline_scripts:
        all_parts.extend(split_script_parts(st))

    # Separate routing from non-routing
    non_routing_parts = [(code, get_elem_ids(code)) for code, routing in all_parts if not routing]

    # Find which canvas IDs live in which section
    section_canvas_ids = {}  # section_id → set of canvas IDs
    for sid, content in sections.items():
        canvas_ids_in_section = re.findall(r'<canvas\s+id="([^"]+)"', content)
        if canvas_ids_in_section:
            for cid in canvas_ids_in_section:
                section_canvas_ids[cid] = sid

    # Background canvas ID (from bg_canvas_elem)
    bg_canvas_id = ''
    if bg_canvas_elem:
        m = re.search(r'id="([^"]+)"', bg_canvas_elem)
        if m:
            bg_canvas_id = m.group(1)

    def scripts_for_section(sid):
        """Return list of script code blocks to include on section sid's page."""
        result = []
        for code, elem_ids in non_routing_parts:
            # Determine if this script is relevant to this section
            section_specific_ids = [eid for eid in elem_ids if eid != bg_canvas_id and eid in section_canvas_ids]
            if section_specific_ids:
                # Only include if all section-specific canvases belong to this section
                if all(section_canvas_ids[eid] == sid for eid in section_specific_ids):
                    result.append(code)
                # else: skip this script for this section
            else:
                # No section-specific canvases → include on all pages
                result.append(code)
        return result

    # ── 9. Generate HTML files ────────────────────────────────────────────────
    for idx, sid in enumerate(section_ids):
        if sid not in sections:
            print(f'  WARN {app}: section {sid} not found in parsed sections')
            continue

        is_first = (idx == 0)
        filename = 'index.html' if is_first else f'{sid}.html'
        filepath = f'{app}-html/{filename}'

        page_scripts = scripts_for_section(sid)
        content = build_page(
            head=head,
            bg_canvas_elem=bg_canvas_elem,
            subnav_html=subnav_html + active_js,
            hero_chunk=hero_chunk,
            section_content=sections[sid],
            scripts_for_page=page_scripts,
            nav_js_tag=nav_js_tag,
            include_hero=is_first,
        )
        open(filepath, 'w', encoding='utf-8').write(content)
        print(f'  wrote {filepath}')

    print(f'  {app}: {len(section_ids)} sections → {len(section_ids)} files')


def main():
    apps = sys.argv[1:] if len(sys.argv) > 1 else APPS
    base = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base)
    for app in apps:
        print(f'Converting {app}...')
        try:
            convert_app(app)
        except Exception as e:
            import traceback
            print(f'  ERROR: {e}')
            traceback.print_exc()

if __name__ == '__main__':
    main()
