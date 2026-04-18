#!/usr/bin/env python3
"""Convert anchor-based and tab-button single-page apps to multi-page HTML.

Pattern 1 (anchor): <a href="#section-id"> + <div class="page-section" id="X">
Pattern 2 (tab-btn): <button data-tab="X"> + <div id="tab-X" class="section">
"""

import re, os, sys, glob

# ── Pattern 1 apps (already converted, kept for re-running) ─────────────────
ANCHOR_APPS = [
    'aztec', 'babylon', 'bbs', 'british', 'civilwar', 'colonial',
    'commodore', 'communism', 'crusades', 'cuba', 'dos', 'egypt',
    'french', 'greece', 'industrial', 'medieval', 'modem', 'mongols',
    'napoleon', 'ottoman', 'pirates', 'renaissance', 'revolution',
    'rome', 'russianrev', 'samurai', 'silkroad', 'spacerace', 'vikings',
    'ww1', 'ww2'
]

# ── Pattern 2 apps (tab-button pattern) ─────────────────────────────────────
TAB_APPS = [
    'agents', 'algorithms', 'ascii', 'baking', 'bash', 'bbq', 'beer',
    'binary', 'bsd', 'cell', 'chaos', 'chess', 'circuit', 'cnc', 'color',
    'compound', 'computers', 'database', 'dna', 'dns', 'embeddings',
    'epidemic', 'epoch', 'ferment', 'fidonet', 'gentoo', 'gravity',
    'grilling', 'ids', 'immune', 'jwt', 'kart', 'knife', 'kombat',
    'linux', 'mac', 'mainframe', 'market', 'nagios', 'os', 'passwords',
    'pasta', 'playground', 'poker', 'protocol', 'quantum', 'ramen',
    'regex', 'sandbox', 'security', 'simcity', 'smoker', 'sushi',
    'synth', 'tacos', 'templeos', 'thai', 'timespan', 'tmux', 'tokens',
    'unix', 'vt101', 'waves', 'wine', 'world', 'zsh',
]

ROUTING_INDICATORS = [
    # Anchor-pattern routing
    'showSection', 'SECTIONS = [', 'page-section',
    'hashchange', "classList.toggle('visible')",
    "classList.add('visible')", "classList.remove('visible')",
    'location.hash', 'pushState', "getAttribute('href').slice(1)",
    "querySelectorAll('.sub-nav a')", 'querySelectorAll(".sub-nav a")',
    'sub-nav a[href=',
    # Tab-button routing
    'dataset.tab', '.data-tab', "btn.dataset", 'data-tab',
    "querySelectorAll('.section')", 'querySelectorAll(".section")',
    "querySelectorAll('.tab-panel')", 'querySelectorAll(".tab-panel")',
    "querySelectorAll('.snav-btn')", "querySelectorAll('.subnav-btn')",
    "querySelectorAll('.tab-btn')", "querySelectorAll('.tab ')",
    '.classList.add(\'active\')', '.classList.remove(\'active\')',
    "classList.toggle('hidden')", "classList.toggle('active')",
    "classList.toggle(\"active\")", "classList.toggle(\"hidden\")",
    'showTab', 'setTab', 'switchTab', 'activateTab',
]

def is_routing_code(text):
    # Specific patterns that only appear in tab routing code
    specific = [
        "getElementById('tab-' + ",
        'getElementById("tab-" + ',
        "getElementById('section-' + ",
        'getElementById("section-" + ',
        "getElementById('page-' + ",
        "querySelectorAll('.section')",
        'querySelectorAll(".section")',
        "querySelectorAll('.tab-panel')",
        'querySelectorAll(".tab-panel")',
        "querySelectorAll('.page-section')",
        'hashchange',
        'showSection(', 'showTab(', 'setTab(', 'switchTab(',
        "getAttribute('href').slice(1)",
        'SECTIONS = [',
        'location.hash',
    ]
    if any(s in text for s in specific):
        return True
    # dataset.tab usage combined with class manipulation = routing
    if 'dataset.tab' in text and any(x in text for x in ['classList.add', 'classList.remove', 'classList.toggle']):
        return True
    return False

def get_elem_ids(text):
    return re.findall(r"""getElementById\(['"]([^'"]+)['"]\)""", text)

def balanced_iife_end(content, start):
    brace_open = content.index('{', start)
    depth = 0
    i = brace_open
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                rest = content[i:]
                m = re.match(r'\}(\s*\)\s*\(\s*\)\s*;?)', rest)
                if m:
                    return i + len(m.group(0))
                return i + 1
        i += 1
    return len(content)

def split_script_parts(script_content):
    content = re.sub(r'^<script[^>]*>\s*', '', script_content)
    content = re.sub(r'\s*</script>$', '', content)

    # If the whole script is routing, mark it as such immediately
    if is_routing_code(content):
        return [(content, True)]

    # Try splitting by // ── comment markers (used by cuba-style apps)
    comment_split = re.split(r'(?=//\s*──)', content)
    comment_split = [c.strip() for c in comment_split if c.strip()]
    if len(comment_split) > 1:
        return [(c, is_routing_code(c)) for c in comment_split]

    # No splitting needed — return as single non-routing block
    return [(content, False)]


def build_page(head, bg_canvas_elem, subnav_html, hero_chunk,
               section_content, scripts_for_page, nav_js_tag,
               include_hero=False):
    parts = ['<!DOCTYPE html>\n<html lang="en">\n', head, '\n<body>']
    if bg_canvas_elem:
        parts.append('\n' + bg_canvas_elem)
    parts.append('\n' + subnav_html)
    if include_hero and hero_chunk.strip():
        parts.append('\n' + hero_chunk.rstrip())
    parts.append('\n' + section_content.strip())
    for sc in scripts_for_page:
        parts.append('\n<script>\n' + sc.strip() + '\n</script>')
    parts.append('\n' + nav_js_tag)
    parts.append('\n</body>\n</html>\n')
    return ''.join(parts)


# ════════════════════════════════════════════════════════════════════════════
# Pattern 1: anchor-based (href="#id" + class="page-section")
# ════════════════════════════════════════════════════════════════════════════

def convert_anchor_app(app):
    src = f'{app}-html/index.html'
    if not os.path.exists(src):
        print(f'  SKIP {app}: no index.html')
        return

    html = open(src, encoding='utf-8').read()

    head_m = re.search(r'<head>.*?</head>', html, re.DOTALL)
    if not head_m:
        print(f'  SKIP {app}: no <head>')
        return
    head = head_m.group(0)
    head = re.sub(r'\s*\.page-section\s*\{[^}]*\}', '', head)
    head = re.sub(r'\s*\.page-section\.visible\s*\{[^}]*\}', '', head)

    bg_canvas_m = re.search(
        r'<canvas\s+id="[^"]*-canvas"[^>]*></canvas>',
        html[:html.find('<div class="wrap"') if '<div class="wrap"' in html else len(html)]
    )
    bg_canvas_elem = bg_canvas_m.group(0) if bg_canvas_m else ''

    subnav_m = re.search(r'<nav[^>]*class="sub-nav-wrap"[^>]*>.*?</nav>', html, re.DOTALL)
    if not subnav_m:
        subnav_m = re.search(r'<nav[^>]*class="sub-nav[^"]*"[^>]*>.*?</nav>', html, re.DOTALL)
    if not subnav_m:
        print(f'  SKIP {app}: no subnav found')
        return
    subnav_raw = subnav_m.group(0)

    section_ids = re.findall(r'<div class="page-section[^"]*" id="([^"]+)"', html)
    if not section_ids:
        section_ids = re.findall(r'<div id="([^"]+)" class="page-section[^"]*"', html)
    if not section_ids:
        print(f'  SKIP {app}: no page-sections found')
        return

    first_id = section_ids[0]

    def rewrite_href(m):
        anchor_id = m.group(1)
        return f'href="{"index.html" if anchor_id == first_id else anchor_id + ".html"}"'
    subnav_html = re.sub(r'href="#([^"]+)"', rewrite_href, subnav_raw)
    active_js = _active_link_js(app)

    m1 = html.find('<div class="page-section')
    m2_str = f'<div id="{section_ids[0]}" class="page-section'
    m2 = html.find(m2_str)
    first_section_start = min(x for x in [m1, m2] if x != -1) if any(x != -1 for x in [m1, m2]) else -1
    wrap_start = html.find('<div class="wrap">')
    if wrap_start == -1 or first_section_start == -1:
        print(f'  SKIP {app}: cannot find .wrap or first page-section')
        return
    hero_chunk = html[wrap_start + len('<div class="wrap">'):first_section_start]

    remaining = html[first_section_start:]
    sec_starts = [(m.start(), m.group(1) or m.group(2)) for m in re.finditer(
        r'<div class="page-section[^"]*" id="([^"]+)">|<div id="([^"]+)" class="page-section[^"]*">',
        remaining
    )]

    sections = {}
    for idx, (start, sid) in enumerate(sec_starts):
        if idx + 1 < len(sec_starts):
            end = sec_starts[idx + 1][0]
            chunk = remaining[start:end]
        else:
            chunk = remaining[start:]
            end_m = re.search(r'\n</div>\s*\n\s*\n\s*<script', chunk)
            if end_m:
                chunk = chunk[:end_m.start()]
        inner = re.sub(
            r'^<div(?:\s+class="page-section[^"]*"\s+id="[^"]+"|'
            r'\s+id="[^"]+"\s+class="page-section[^"]*")>',
            '', chunk.strip()
        )
        inner = re.sub(r'</div>\s*$', '', inner.strip())
        sections[sid] = f'<section id="{sid}">\n{inner.strip()}\n</section>'

    script_tags = _extract_scripts(html)
    nav_js_tag = next((s for s in script_tags if 'nav.js' in s), '<script src="/shared/nav.js?v=3"></script>')
    inline_scripts = [s for s in script_tags if 'src=' not in s[:60]]

    non_routing_scripts = []
    for st in inline_scripts:
        parts = split_script_parts(st)
        non_routing = [code for code, routing in parts if not routing]
        if not non_routing:
            continue
        merged = '\n'.join(non_routing)
        non_routing_scripts.append((merged, get_elem_ids(merged)))

    section_elem_ids = {}
    for sid, content in sections.items():
        for eid in re.findall(r'\bid="([^"]+)"', content):
            section_elem_ids[eid] = sid

    bg_canvas_id = ''
    if bg_canvas_elem:
        m = re.search(r'id="([^"]+)"', bg_canvas_elem)
        if m:
            bg_canvas_id = m.group(1)

    def scripts_for_section(sid):
        result = []
        for code, elem_ids in non_routing_scripts:
            section_specific = [eid for eid in elem_ids
                                 if eid != bg_canvas_id and eid in section_elem_ids]
            if section_specific:
                belonging = set(section_elem_ids[eid] for eid in section_specific)
                if sid in belonging:
                    result.append(code)
            else:
                result.append(code)
        return result

    for idx, sid in enumerate(section_ids):
        if sid not in sections:
            print(f'  WARN {app}: section {sid} not found')
            continue
        is_first = (idx == 0)
        filename = 'index.html' if is_first else f'{sid}.html'
        filepath = f'{app}-html/{filename}'
        content = build_page(
            head=head,
            bg_canvas_elem=bg_canvas_elem,
            subnav_html=subnav_html + active_js,
            hero_chunk=hero_chunk,
            section_content=sections[sid],
            scripts_for_page=scripts_for_section(sid),
            nav_js_tag=nav_js_tag,
            include_hero=is_first,
        )
        open(filepath, 'w', encoding='utf-8').write(content)

    print(f'  {app}: {len(section_ids)} sections → {len(section_ids)} files')


# ════════════════════════════════════════════════════════════════════════════
# Pattern 2: tab-button (data-tab="X" + various section element patterns)
# ════════════════════════════════════════════════════════════════════════════

def find_section_id(tab_id, html):
    """Find the section element ID that corresponds to a tab ID."""
    for pat in [
        f'tab-{tab_id}',
        f'{tab_id}-section',
        f'section-{tab_id}',
        f'page-{tab_id}',
        tab_id,
    ]:
        if re.search(rf'id="{re.escape(pat)}"', html):
            return pat
    return None


def convert_tab_app(app):
    src = f'{app}-html/index.html'
    if not os.path.exists(src):
        print(f'  SKIP {app}: no index.html')
        return

    html = open(src, encoding='utf-8').read()

    # ── Head ────────────────────────────────────────────────────────────────
    head_m = re.search(r'<head>.*?</head>', html, re.DOTALL)
    if not head_m:
        print(f'  SKIP {app}: no <head>'); return
    head = head_m.group(0)
    # Remove show/hide CSS for sections
    head = re.sub(r'\s*\.(?:section|tab-panel|tab-content)\s*\{\s*display\s*:\s*none[^}]*\}', '', head)
    head = re.sub(r'\s*\.(?:section|tab-panel|tab-content)\.(?:active|visible)\s*\{\s*display[^}]*\}', '', head)
    head = re.sub(r'\s*\.hidden\s*\{\s*display\s*:\s*none[^}]*\}', '', head)

    # ── Background canvas ───────────────────────────────────────────────────
    body_start = html.find('<body')
    subnav_pos = _find_tab_container_pos(html)
    if subnav_pos == -1:
        print(f'  SKIP {app}: no tab container found'); return

    pre_subnav = html[body_start:subnav_pos] if body_start != -1 else html[:subnav_pos]
    bg_canvas_m = re.search(r'<canvas\s+id="[^"]*(?:canvas|bg)[^"]*"[^>]*(?:/>|></canvas>)', pre_subnav)
    bg_canvas_elem = bg_canvas_m.group(0) if bg_canvas_m else ''
    bg_canvas_id = ''
    if bg_canvas_elem:
        m = re.search(r'id="([^"]+)"', bg_canvas_elem)
        if m:
            bg_canvas_id = m.group(1)

    # ── Tab IDs (from subnav buttons) ───────────────────────────────────────
    subnav_end = _find_tab_container_end(html, subnav_pos)
    subnav_raw = html[subnav_pos:subnav_end]
    tab_ids_raw = list(dict.fromkeys(re.findall(r'data-tab="([^"]+)"', subnav_raw)))
    # Filter dynamic/JS-generated tab IDs
    tab_ids = [t for t in tab_ids_raw if not any(c in t for c in ["'", '+', ' ', '$', '{', '}'])]
    if len(tab_ids) < 2:
        print(f'  SKIP {app}: fewer than 2 valid tab IDs'); return

    # ── Map tab IDs to section element IDs ──────────────────────────────────
    tab_to_section = {}
    for tid in tab_ids:
        sid = find_section_id(tid, html)
        if sid:
            tab_to_section[tid] = sid
        else:
            print(f'  WARN {app}: no section found for tab "{tid}"')

    if not tab_to_section:
        print(f'  SKIP {app}: no sections found'); return

    first_tab = tab_ids[0]

    # ── Build new subnav (buttons → links) ──────────────────────────────────
    def rewrite_button(m):
        classes = m.group(1) or ''
        tab_id = m.group(2)
        label = m.group(3)
        if tab_id not in tab_to_section:
            return m.group(0)  # keep as-is if no section found
        href = 'index.html' if tab_id == first_tab else f'{tab_id}.html'
        # Keep same class(es) on the <a> tag
        class_attr = f' class="{classes.strip()}"' if classes.strip() else ''
        return f'<a{class_attr} href="{href}">{label}</a>'

    # Replace <button class="..." data-tab="X" [onclick="..."]>Label</button> → <a>
    new_subnav = re.sub(
        r'<button[^>]+class="([^"]*)"[^>]+data-tab="([^"]+)"[^>]*>(.*?)</button>',
        rewrite_button, subnav_raw, flags=re.DOTALL
    )
    # Also handle buttons where data-tab comes before class
    new_subnav = re.sub(
        r'<button[^>]+data-tab="([^"]+)"[^>]*class="([^"]*)"[^>]*>(.*?)</button>',
        lambda m: f'<a class="{m.group(2)}" href="{"index.html" if m.group(1) == first_tab else m.group(1) + ".html"}">{m.group(3)}</a>',
        new_subnav, flags=re.DOTALL
    )
    # Handle buttons with no class attribute
    new_subnav = re.sub(
        r'<button[^>]+data-tab="([^"]+)"[^>]*>(.*?)</button>',
        lambda m: f'<a href="{"index.html" if m.group(1) == first_tab else m.group(1) + ".html"}">{m.group(2)}</a>',
        new_subnav, flags=re.DOTALL
    )
    # Remove 'active' class from buttons (will be set by JS)
    new_subnav = re.sub(r'\s+active(?=[\s"])', ' ', new_subnav)
    new_subnav = new_subnav.strip()
    active_js = _active_link_js_tab(app)

    # ── Hero content (body content before tab container) ────────────────────
    hero_chunk = _extract_pre_subnav_content(html, subnav_pos, bg_canvas_elem)

    # ── Extract each section's content ──────────────────────────────────────
    sections = {}
    all_section_ids = list(tab_to_section.values())
    for i, tab_id in enumerate(tab_ids):
        if tab_id not in tab_to_section:
            continue
        elem_id = tab_to_section[tab_id]
        # Find the section start
        sec_m = re.search(
            rf'<(div|section)\b[^>]+id="{re.escape(elem_id)}"[^>]*>',
            html
        )
        if not sec_m:
            print(f'  WARN {app}: section element not found for {elem_id}')
            continue
        sec_start = sec_m.start()
        tag = sec_m.group(1)

        # Find the next section start or end of content
        next_starts = []
        for other_tab in tab_ids:
            if other_tab == tab_id or other_tab not in tab_to_section:
                continue
            other_id = tab_to_section[other_tab]
            nm = re.search(rf'<(div|section)\b[^>]+id="{re.escape(other_id)}"', html)
            if nm and nm.start() > sec_start:
                next_starts.append(nm.start())
        next_starts.append(html.find('<script', sec_start))
        next_starts = [x for x in next_starts if x > sec_start]
        sec_end = min(next_starts) if next_starts else len(html)

        chunk = html[sec_start:sec_end].strip()
        # Remove outer wrapper tag
        inner = re.sub(rf'^<{tag}[^>]+>', '', chunk)
        inner = re.sub(rf'</{tag}>\s*$', '', inner.strip())
        sections[tab_id] = f'<section id="{tab_id}">\n{inner.strip()}\n</section>'

    # ── Parse scripts ────────────────────────────────────────────────────────
    script_tags = _extract_scripts(html)
    nav_js_tag = next((s for s in script_tags if 'nav.js' in s), '<script src="/shared/nav.js?v=3"></script>')
    inline_scripts = [s for s in script_tags if 'src=' not in s[:60]]

    # For each inline script: strip routing parts, keep the rest as ONE block
    # Attribute the whole block by ALL its getElementById references
    non_routing_scripts = []  # list of (code, all_elem_ids)
    for st in inline_scripts:
        parts = split_script_parts(st)
        non_routing = [code for code, routing in parts if not routing]
        if not non_routing:
            continue
        merged = '\n'.join(non_routing)
        all_eids = get_elem_ids(merged)
        non_routing_scripts.append((merged, all_eids))

    # Find section-specific element IDs (canvas and non-canvas)
    section_elem_ids = {}
    for tid, content in sections.items():
        for eid in re.findall(r'\bid="([^"]+)"', content):
            section_elem_ids[eid] = tid

    def scripts_for_section(tid):
        result = []
        for code, elem_ids in non_routing_scripts:
            section_specific = [eid for eid in elem_ids
                                 if eid != bg_canvas_id and eid in section_elem_ids]
            if section_specific:
                # Include only if the section-specific elements belong to this section
                belonging = set(section_elem_ids[eid] for eid in section_specific)
                if tid in belonging:
                    result.append(code)
                # else: skip (belongs to a different section)
            else:
                # No section-specific elements → include on all pages
                result.append(code)
        return result

    # ── Generate files ───────────────────────────────────────────────────────
    written = 0
    for i, tab_id in enumerate(tab_ids):
        if tab_id not in sections:
            continue
        is_first = (tab_id == first_tab)
        filename = 'index.html' if is_first else f'{tab_id}.html'
        filepath = f'{app}-html/{filename}'
        content = build_page(
            head=head,
            bg_canvas_elem=bg_canvas_elem,
            subnav_html=new_subnav + '\n' + active_js,
            hero_chunk=hero_chunk,
            section_content=sections[tab_id],
            scripts_for_page=scripts_for_section(tab_id),
            nav_js_tag=nav_js_tag,
            include_hero=is_first,
        )
        open(filepath, 'w', encoding='utf-8').write(content)
        written += 1

    print(f'  {app}: {written} files written')


# ════════════════════════════════════════════════════════════════════════════
# Helper functions
# ════════════════════════════════════════════════════════════════════════════

def _extract_scripts(html):
    """Extract all <script> tags from HTML (handles multiline content)."""
    scripts = []
    pos = 0
    while True:
        start = html.find('<script', pos)
        if start == -1:
            break
        end = html.find('</script>', start)
        if end == -1:
            break
        scripts.append(html[start:end + 9])
        pos = end + 9
    return scripts


def _active_link_js(app):
    return (
        '\n<script>\n'
        'document.querySelectorAll(\'.sub-nav a\').forEach(function(a){\n'
        '  var h = a.getAttribute(\'href\');\n'
        '  var p = location.pathname;\n'
        f'  if (p.endsWith(h) || (h===\'index.html\' && (p.endsWith(\'/\') || p.endsWith(\'/{app}\') || p.endsWith(\'index.html\')))) {{\n'
        '    a.classList.add(\'active\');\n'
        '  }\n'
        '});\n'
        '</script>'
    )

def _active_link_js_tab(app):
    # Works for any link selector — finds <a> tags with href inside the subnav container
    return (
        '\n<script>\n'
        '(function(){\n'
        '  var p = location.pathname;\n'
        '  document.querySelectorAll(\'a[href]\').forEach(function(a){\n'
        '    var h = a.getAttribute(\'href\');\n'
        f'    if (!h || !h.endsWith(\'.html\') && h !== \'index.html\') return;\n'
        f'    if (p.endsWith(h) || (h===\'index.html\' && (p.endsWith(\'/\') || p.endsWith(\'/{app}\') || p.endsWith(\'index.html\')))) {{\n'
        '      a.classList.add(\'active\');\n'
        '    }\n'
        '  });\n'
        '})();\n'
        '</script>'
    )

def _find_tab_container_pos(html):
    """Find start position of the tab container element."""
    # Try various container patterns
    patterns = [
        r'<div[^>]+class="[^"]*subnav[^"]*"',
        r'<nav[^>]+class="[^"]*subnav[^"]*"',
        r'<div[^>]+id="[^"]*subnav[^"]*"',
        r'<div[^>]+class="[^"]*sub-nav[^"]*"',
        r'<nav[^>]+class="[^"]*sub-nav[^"]*"',
        r'<div[^>]+class="[^"]*tabs-bar[^"]*"',
        r'<div[^>]+class="[^"]*tab-nav[^"]*"',
        r'<nav[^>]+class="[^"]*tab-nav[^"]*"',
        r'<div[^>]+class="[^"]*tabs[^"]*"[^>]*>\s*<button[^>]+data-tab',
        r'<nav[^>]+class="[^"]*tabs[^"]*"[^>]*>\s*<button[^>]+data-tab',
    ]
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            # Check it actually contains data-tab
            end = html.find('</div>', m.start()) if '</div>' in html[m.start():m.start()+2000] else m.start() + 2000
            if 'data-tab' in html[m.start():end]:
                return m.start()
    # Last resort: find any element containing data-tab buttons
    m = re.search(r'<(?:div|nav)[^>]*>\s*(?:<button[^>]+data-tab)', html)
    return m.start() if m else -1

def _find_tab_container_end(html, start):
    """Find end position of the tab container."""
    # Find closing tag
    tag_m = re.match(r'<(div|nav)', html[start:])
    if not tag_m:
        return start + 500
    tag = tag_m.group(1)
    depth = 0
    i = start
    while i < len(html):
        if html[i:i+len(tag)+1] == f'<{tag}':
            depth += 1
        elif html[i:i+len(tag)+2] == f'</{tag}':
            depth -= 1
            if depth == 0:
                return i + len(tag) + 3  # include closing >
        i += 1
    return start + 500

def _extract_pre_subnav_content(html, subnav_pos, bg_canvas_elem):
    """Extract hero/intro content between <body> and the subnav container."""
    body_m = re.search(r'<body[^>]*>', html)
    if not body_m:
        return ''
    body_end = body_m.end()
    chunk = html[body_end:subnav_pos].strip()
    # Remove bg canvas element from hero (it'll be added separately)
    if bg_canvas_elem:
        chunk = chunk.replace(bg_canvas_elem, '').strip()
    return chunk


# ════════════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════════════

def main():
    args = sys.argv[1:]
    base = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base)

    if args:
        # Run specific apps — auto-detect which pattern
        for app in args:
            if len(glob.glob(f'{app}-html/*.html')) > 1:
                print(f'Skipping {app} (already multi-page)')
                continue
            src = f'{app}-html/index.html'
            if not os.path.exists(src):
                print(f'Skipping {app} (no index.html)')
                continue
            html = open(src).read()
            has_page_section = bool(re.search(r'class="page-section', html))
            print(f'Converting {app} ({"anchor" if has_page_section else "tab"})...')
            if has_page_section:
                convert_anchor_app(app)
            else:
                convert_tab_app(app)
    else:
        # Run all
        for app in ANCHOR_APPS:
            if len(glob.glob(f'{app}-html/*.html')) > 1:
                continue  # already done
            print(f'Converting {app} (anchor)...')
            convert_anchor_app(app)

        for app in TAB_APPS:
            if len(glob.glob(f'{app}-html/*.html')) > 1:
                continue  # already done
            print(f'Converting {app} (tab)...')
            try:
                convert_tab_app(app)
            except Exception as e:
                import traceback
                print(f'  ERROR: {e}')
                traceback.print_exc()

if __name__ == '__main__':
    main()
