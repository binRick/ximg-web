# ximg-web

Production multi-site web portfolio stack running on a single Linux VM at `172.238.205.61`. nginx sits in front as a reverse proxy handling SSL termination and virtual hosting. A single nginx `static` container serves all static sites by routing each request to the correct `*-html/` directory based on the `Host` header. Dynamic features are powered by dedicated Node.js and Python services.

## Live Sites

215 virtual hosts (root + 214 subdomains), all static sites served by a single nginx container.

| Subdomain | Description |
|-----------|-------------|
| [ximg.app](https://ximg.app) | Landing page — animated grid, floating orbs, frosted-glass app directory card. |
| [linux.ximg.app](https://linux.ximg.app) | Browser terminal powered by xterm.js with ~20 mock shell commands and a DVD-bouncing Tux mascot. |
| [ai.ximg.app](https://ai.ximg.app) | Artificial Intelligence deep dive — frontier LLMs, leading AI companies, 75-year history from Turing to ChatGPT, and core concepts explained. |
| [claude.ximg.app](https://claude.ximg.app) | Anthropic's Claude AI assistant — model family (Haiku/Sonnet/Opus), Constitutional AI, API quick-start, and Claude Code CLI reference. |
| [ps1.ximg.app](https://ps1.ximg.app) | Interactive bash PS1 prompt generator — 15 prebuilt themes, live terminal preview, drag-to-reorder components, color pickers, and one-click copy. |
| [dockerimage.ximg.app](https://dockerimage.ximg.app) | Docker Image Explorer — browse common images with sizes and architectures, visualize Dockerfile layers, inspect metadata field reference, and image command cheatsheet. |
| [dockerimagedownloader.ximg.app](https://dockerimagedownloader.ximg.app) | Docker Image Downloader — pull any image by name, stream pull progress via SSE, then download as a .tar.gz archive piped directly from docker save to the browser. |
| [githubstars.ximg.app](https://githubstars.ximg.app) | GitHub Stars — browse, search, sort, and filter all starred repositories; synced hourly from the GitHub API. |
| [video.ximg.app](https://video.ximg.app) | Video player and media reference — codec comparison, container formats, and streaming protocols. |
| [smtp.ximg.app](https://smtp.ximg.app) | Simple Mail Transfer Protocol — full session flow, all commands and ESMTP extensions, response codes, ports 25/465/587, TLS/STARTTLS, SPF, DKIM, DMARC, and diagnostic commands. |
| [chmod.ximg.app](https://chmod.ximg.app) | Linux file permissions calculator — toggle owner/group/other bits, special modes (setuid/setgid/sticky), octal and symbolic output, chmod commands, ls -la preview, quick presets, and permission reference table. |
| [iptables.ximg.app](https://iptables.ximg.app) | Linux firewall rule visualizer — animated netfilter packet flow diagram, table/chain reference, interactive rule builder with live iptables and nftables output, templates, and quick reference cheatsheet. |
| [tls.ximg.app](https://tls.ximg.app) | TLS/SSL handshake visualizer — animated step-by-step TLS 1.2 and 1.3 handshake diagrams with RTT comparison, cipher suite breakdown, certificate chain viewer, and key concepts reference. |
| [bgp.ximg.app](https://bgp.ximg.app) | Border Gateway Protocol visualizer — interactive AS topology map with route propagation animation, BGP attributes explorer, session state machine, message type reference, and route hijacking demo. |
| [makefile.ximg.app](https://makefile.ximg.app) | Makefile generator and visualizer — interactive Canvas dependency graph, target builder with project templates (C/Python/Docker/Node.js), live syntax-highlighted Makefile output, and automatic variables reference. |
| [utf8.ximg.app](https://utf8.ximg.app) | Unicode/UTF-8 encoding explorer — real-time per-character analysis with code points, byte sequences, bit-level encoding diagrams, HTML entities, URL encoding, and UTF-16/UTF-32 comparison. |
| [templeos.ximg.app](https://templeos.ximg.app) | TempleOS — a shrine to Terry A. Davis (1969–2018): HolyC oracle, 16-color VGA palette, annotated code snippets, 15-year timeline, and reverence for the greatest solo programmer in history. |
| [bash.ximg.app](https://bash.ximg.app) | Bash scripting reference — variables, arrays, control flow, functions, I/O redirection, arithmetic, and common patterns. |
| [bsd.ximg.app](https://bsd.ximg.app) | Berkeley Software Distribution — the OS that gave the internet TCP/IP, OpenSSH, and ZFS. FreeBSD, OpenBSD, NetBSD, DragonFly, history, and the BSD in every Mac and PlayStation. |
| [zsh.ximg.app](https://zsh.ximg.app) | Z Shell reference — extended globbing, parameter flags, oh-my-zsh plugins, Powerlevel10k themes, and differences from Bash. |
| [vt101.ximg.app](https://vt101.ximg.app) | DEC VT101 terminal history and ANSI escape code reference — SGR colors, cursor sequences, and the hardware legacy behind every modern terminal. |
| [mac.ximg.app](https://mac.ximg.app) | Apple Silicon, macOS history (Cheetah to Sequoia), Mach microkernel deep dive, Mac hardware lineup, and M1–M4 chip analysis. |
| [butterfly.ximg.app](https://butterfly.ximg.app) | Canvas particle animation driven by the butterfly curve polar equation — hypnotic, mathematical. |
| [ascii.ximg.app](https://ascii.ximg.app) | Three classic ASCII demos: spinning donut (3-D torus), matrix rain, and sine-wave plasma. |
| [json.ximg.app](https://json.ximg.app) | JSON type reference card with syntax-highlighted examples for every value type — educational quick-ref. |
| [poker.ximg.app](https://poker.ximg.app) | Texas Hold'em hand evaluator — pick hole cards, see hand rank, probability bar chart, and GTO preflop chart. |
| [ids.ximg.app](https://ids.ximg.app) | Suricata intrusion detection dashboard — live EVE JSON alert stream, protocol/severity charts, 24h heatmap, attacker world map. |
| [logs.ximg.app](https://logs.ximg.app) | Real-time nginx access log viewer over WebSocket, one tab per subdomain, plus an SSH honeypot session browser. |
| [mail.ximg.app](https://mail.ximg.app) | Webmail inbox for @ximg.app addresses — live SMTP receiver with a Gmail-style email reader UI. |
| [mario.ximg.app](https://mario.ximg.app) | Canvas-based Mario platformer game playable in the browser — move, jump, enemies, score. |
| [docker.ximg.app](https://docker.ximg.app) | Docker command reference (containers, images, volumes, cleanup) plus an annotated Docker Compose guide. |
| [yaml.ximg.app](https://yaml.ximg.app) | YAML type reference card covering scalars, sequences, mappings, anchors, multi-line strings, and gotchas. |
| [doom.ximg.app](https://doom.ximg.app) | DOOM lore deep-dive — all classic weapons with real-world photos, enemies, levels, and id Software history. |
| [monkey.ximg.app](https://monkey.ximg.app) | Monkey-themed app — primate species, facts, and fun content. |
| [grilling.ximg.app](https://grilling.ximg.app) | The art of grilling — grill types, regional BBQ styles, temp guide, wood &amp; smoke pairings, rubs, sauces, and tools. |
| [pizza.ximg.app](https://pizza.ximg.app) | Top pizza chains and regional styles across America — history, stats, and fun facts for each. |
| [kombat.ximg.app](https://kombat.ximg.app) | Full Mortal Kombat character roster with photos, bios, and fighting stats for every fighter in the franchise. |
| [wargames.ximg.app](https://wargames.ximg.app) | 1983 cold-war thriller guide — cast, plot, WOPR terminal Easter egg, and "Shall we play a game?" lore. |
| [moto.ximg.app](https://moto.ximg.app) | Motorcycle culture — types, iconic brands, notable bikes, and the art of riding. |
| [india.ximg.app](https://india.ximg.app) | India explorer — culture, food, landmarks, history, and the subcontinent's incredible diversity. |
| [chinese.ximg.app](https://chinese.ximg.app) | Eight regional Chinese cuisines and their iconic dishes — one of the world's oldest and richest food cultures. |
| [ximg.app/sushi](https://ximg.app/sushi) | Japanese sushi guide — nigiri, maki rolls, sashimi, fish seasonality, rice technique, and etiquette. |
| [ximg.app/tacos](https://ximg.app/tacos) | Mexican taco guide — al pastor, birria, carnitas, regional styles, salsas, and tortillas. |
| [ximg.app/bbq](https://ximg.app/bbq) | American BBQ regions — Texas brisket, Carolina whole hog, Kansas City ribs, Memphis dry rub, woods, and sauces. |
| [ximg.app/ramen](https://ximg.app/ramen) | Japanese ramen guide — shoyu, shio, miso, and tonkotsu broths, toppings, noodles, and regional varieties. |
| [ximg.app/pasta](https://ximg.app/pasta) | Italian pasta guide — shapes, classic sauces (carbonara, bolognese, cacio e pepe), pairings, and cooking tips. |
| [ximg.app/thai](https://ximg.app/thai) | Thai cuisine — four regional styles, iconic dishes, curries, noodles, herbs, and street food. |
| [ximg.app/baking](https://ximg.app/baking) | Baking guide — sourdough, pastry, cakes, cookies, the science of gluten, leavening, and the Maillard reaction. |
| [ximg.app/smoker](https://ximg.app/smoker) | BBQ smoking guide — times, temperatures, wood pairings, meats, equipment, and pit master tips. |
| [ximg.app/knife](https://ximg.app/knife) | Kitchen knife guide — types, cuts (julienne, brunoise, chiffonade), steel, sharpening, and care. |
| [ximg.app/ferment](https://ximg.app/ferment) | Fermentation guide — kimchi, sourdough starters, kombucha, vinegar, kefir, and lacto-fermentation basics. |
| [ximg.app/wine](https://ximg.app/wine) | Wine guide — reds, whites, regions (Bordeaux, Burgundy, Napa), grapes, food pairing, and service. |
| [ximg.app/beer](https://ximg.app/beer) | Beer guide — ales, lagers, stouts, IPAs (NEIPA, West Coast), wheat beers, brewing process, and pairing. |
| [ximg.app/cocktails](https://ximg.app/cocktails) | Cocktail guide — classics (Old Fashioned, Negroni, Martini), modern classics, techniques, and glassware. |
| [ximg.app/tea](https://ximg.app/tea) | Tea guide — green, white, oolong, black, pu-erh, origins, brewing temperatures, and ceremonies. |
| [ximg.app/calories](https://ximg.app/calories) | Calorie and nutrition guide — common foods, macros, metabolism (BMR/TDEE), exercise, and nutrition myths. |
| [ximg.app/recipe](https://ximg.app/recipe) | Essential recipes — breakfast, lunch, dinner, sauces, baked goods, quick weeknight meals, and entertaining. |
| [ximg.app/spice](https://ximg.app/spice) | Spice guide — Scoville scale, chili varieties, global spice blends (garam masala, ras el hanout), and cooking with heat. |
| [ximg.app/market](https://ximg.app/market) | Seasonal produce guide — what's peak each season, farmers market tips, storage, and eating locally. |
| [wood.ximg.app](https://wood.ximg.app) | Wood species, joinery techniques, hand tools, power tools, and finishing — the full craft of woodworking. |
| [guns.ximg.app](https://guns.ximg.app) | Firearm types and the top 10 most popular guns in America — facts, stats, and history. |
| [tampa.ximg.app](https://tampa.ximg.app) | Tampa Bay guide — best restaurants, an interactive map, and live traffic for the Bay City. |
| [florida.ximg.app](https://florida.ximg.app) | God's Country — beaches, nature, freedom, food, and eternal summer across the Sunshine State. |
| [america.ximg.app](https://america.ximg.app) | Why the USA is the greatest country in history — science, tech, medicine, military, culture, and more. |
| [computers.ximg.app](https://computers.ximg.app) | How America invented the computer — types, timeline, pioneering companies, and the people who changed the world. |
| [trump.ximg.app](https://trump.ximg.app) | Donald J. Trump — fun facts, full life timeline, presidency achievements, and iconic photo gallery. |
| [cnc.ximg.app](https://cnc.ximg.app) | The legendary RTS franchise — every game, factions, units, buildings, lore, and a browser RTS game tab. |
| [crypto.ximg.app](https://crypto.ximg.app) | Hashing (SHA-2, BLAKE3, Argon2), symmetric (AES-GCM, ChaCha20), asymmetric (RSA, ECC, Ed25519), key exchange, TLS 1.3, PGP, and openssl/gpg tools. |
| [rx.ximg.app](https://rx.ximg.app) | Pharmacy + fitness health coaching platform — GLP-1 tracking, metabolic labs, body composition, and workouts. |
| [simcity.ximg.app](https://simcity.ximg.app) | Will Wright's city-building legacy — every game, the visionary designer, and Cities: Skylines as its heir. |
| [internet.ximg.app](https://internet.ximg.app) | What the internet is, how America's DOD built it, top 20 protocols, and how it connected all of humanity. |
| [change.ximg.app](https://change.ximg.app) | Full git commit history — every change to this project, live from git, searchable by message, hash, or author. |
| [fidonet.ximg.app](https://fidonet.ximg.app) | The Internet Before the Internet — history, how it worked, BBS culture, and the volunteer network that connected 40,000 nodes worldwide. |
| [tmux.ximg.app](https://tmux.ximg.app) | Terminal multiplexer reference — full cheatsheet, interactive pane simulator, annotated .tmux.conf, and 17-year history. |
| [coldwar.ximg.app](https://coldwar.ximg.app) | The 45-year standoff — nuclear arms race, proxy wars, space race, CIA vs KGB espionage, leaders, and the Soviet collapse. |
| [arpanet.ximg.app](https://arpanet.ximg.app) | Animated ARPANET history — watch the network grow from 4 nodes in 1969 to 213 nodes, packet routing animation, the first "LO" message, and the origin story of the Internet. |
| [passwords.ximg.app](https://passwords.ximg.app) | Generate strong random passwords and passphrases, test password strength, see crack times by attack type, and learn best practices. |
| [ansible.ximg.app](https://ansible.ximg.app) | Agentless automation — playbooks, modules, inventory, variables, roles, Vault, and the full history from 2012 to AI-assisted authoring. |
| [chess.ximg.app](https://chess.ximg.app) | The game of kings — pieces, openings, tactics, all 16 world champions, and 1,500 years of chess history from Chaturanga to Gukesh. |
| [programming.ximg.app](https://programming.ximg.app) | 180 years of code — languages, paradigms, pioneers, timeline from Ada Lovelace to AI code generation, and the people who built it all. |
| [git.ximg.app](https://git.ximg.app) | Linus Torvalds' version control system — commands cheatsheet, concepts, branching strategies, config, and the full history from 2005 to today. |
| [systemd.ximg.app](https://systemd.ximg.app) | Linux service manager — systemctl command reference, unit file anatomy, journalctl, core concepts, and the full history from 2010 to today. |
| [nav.ximg.app](https://nav.ximg.app) | Navigation design showcase — five interactive demos comparing hamburger drawer, horizontal scroll, dropdown groups, hub-only, and searchable launcher patterns. |
| [unix.ximg.app](https://unix.ximg.app) | The OS that shaped everything — Unix history, philosophy (the 17 rules), commands cheatsheet, family tree from Bell Labs to Linux, and the people who built it all. |
| [vr.ximg.app](https://vr.ximg.app) | Virtual reality — headsets, landmark games, how VR works, and a 60-year history from Sensorama to Apple Vision Pro. |
| [warcraft.ximg.app](https://warcraft.ximg.app) | Blizzard's fantasy franchise — RTS origins from 1994, World of Warcraft expansions, iconic characters like Arthas and Thrall, and 30 years of Azeroth lore. |
| [kart.ximg.app](https://kart.ximg.app) | Nintendo's legendary kart racing series — all 11 games, original 8 characters, cups &amp; courses, items, and the journey from SNES 1992 to Mario Kart World on Switch 2. |
| [ximg.ximg.app](https://ximg.ximg.app) | Full technical teardown of the ximg.app infrastructure — architecture Mermaid diagrams, container topology, SSL lifecycle, tech stack breakdown, and the 9-step new-app checklist. |
| [apps.ximg.app](https://apps.ximg.app) | This page — a complete directory of every app in the ximg.app stack with descriptions and launch dates. |
| [stats.ximg.app](https://stats.ximg.app) | AWStats traffic reports for every ximg.app subdomain — page views, unique visitors, countries, referrers, and an all-sites combined report. Updated hourly. |
| [nagios.ximg.app](https://nagios.ximg.app) | Nagios Core monitoring — live HTTPS health checks for every subdomain plus SSH honeypot port watch. No auth, read-only. |
| [vim.ximg.app](https://vim.ximg.app) | The ubiquitous editor — modes, commands, 50+ key bindings, 12 essential plugins, and the full history from vi (1976) to Vim 9. |
| [http.ximg.app](https://http.ximg.app) | The protocol of the web — all 9 methods, full status code reference, request/response headers, versions HTTP/0.9 through HTTP/3, and security headers. |
| [ssh.ximg.app](https://ssh.ximg.app) | Secure Shell protocol — 30+ commands, key types (Ed25519/RSA/ECDSA), client/server config reference, and a hardening best-practices guide. |
| [sql.ximg.app](https://sql.ximg.app) | Structured Query Language — DML/DDL/TCL syntax, data types, aggregate/string/date/window functions, join types with Venn diagrams, and 8 major databases compared. |
| [space.ximg.app](https://space.ximg.app) | The final frontier — all 9 planets + dwarf, 12 historic missions, rocket comparison (Saturn V to Starship), exoplanets, black holes, and a starfield background. |
| [coffee.ximg.app](https://coffee.ximg.app) | The world's favorite brew — 8 origin regions, 8 brewing methods, roast spectrum, Arabica/Robusta varietals, and café culture history from the Ottoman Empire to the third wave. |
| [japan.ximg.app](https://japan.ximg.app) | Culture, food, technology, and history — cherry blossom canvas animation, 6 philosophical concepts, 12 foods with kanji, 10 tech companies, and a timeline from 14000 BCE. |
| [quake.ximg.app](https://quake.ximg.app) | id Software's dark legend — 6 Quake games, 10 weapons with stat bars, 12 monsters, 8 iconic maps, and the full id Software history from Softdisk to ZeniMax. |
| [nintendo.ximg.app](https://nintendo.ximg.app) | 135 years of play — 13 consoles from 1977 to Switch, 16 iconic games, 13 characters with pixel-art Mario, and the company history from Hanafuda cards to billion-dollar franchise. |
| [pirates.ximg.app](https://pirates.ximg.app) | The Golden Age of Piracy (1650–1730) — 8 infamous pirates, 4 famous ships, the Pirate Code, plunder targets, Caribbean havens, battle tactics, and a full timeline from buccaneers to Blackbeard's death. |
| [medieval.ximg.app](https://medieval.ximg.app) | The Middle Ages (500–1500 AD) — feudal system, 6 famous battles, 6 legendary knights, 6 great castles, 6 siege weapons, 4 military orders, and a timeline from the Fall of Rome to Constantinople. |
| [ximg.app/rome/](https://ximg.app/rome/) | SPQR — Roman social structure, 9 emperors from Augustus to Constantine, 6 famous battles, 8 engineering marvels (Colosseum to aqueducts), the legion hierarchy, Roman pantheon, and a full timeline 753 BC to 476 AD. |
| [ximg.app/bbs/](https://ximg.app/bbs/) | Bulletin Board Systems (1978–1998) — BBS history, ANSI art & artscene groups, 6 classic door games (LORD, Trade Wars, Usurper), 6 major BBS software packages, FidoNet explained, and a full timeline from CBBS to the web. |
| [ximg.app/dos/](https://ximg.app/dos/) | MS-DOS (1981–2000) — 18 essential commands, CONFIG.SYS & AUTOEXEC.BAT walkthrough, the 640K memory barrier explained (EMS/XMS/UMB/HMA), 8 legendary DOS software titles, the full boot sequence, and timeline from PC-DOS 1.0 to Windows XP. |
| [ximg.app/modem/](https://ximg.app/modem/) | The dial-up era (1958–2013) — 12 AT commands explained, baud rate history from 300 bps to 56K, ITU standards (V.21 to V.92), the ISP era (AOL, CompuServe, Prodigy), the anatomy of the connection handshake sound, and a timeline. |
| [ximg.app/commodore/](https://ximg.app/commodore/) | C64 & Amiga (1982–1994) — C64 hardware specs (VIC-II, SID chip deep-dive, ADSR envelopes), all 16 palette colors, 8 legendary games, demoscene history (raster tricks, FLI/FLD), Amiga model lineup, and a full Commodore timeline. |
| [physics.ximg.app](https://physics.ximg.app) | The laws of the universe — classical mechanics, thermodynamics, electromagnetism, quantum mechanics, special and general relativity, the Standard Model, and legendary physicists. |
| [chemistry.ximg.app](https://chemistry.ximg.app) | The central science — periodic table, atomic structure, chemical bonding, reaction types, organic chemistry, biomolecules, and the great chemists from Lavoisier to Rosalind Franklin. |
| [biology.ximg.app](https://biology.ximg.app) | The science of life — cells, organelles, photosynthesis, genetics and DNA, taxonomy across all domains, human body systems, ecology, and the biologists who shaped the field. |
| [math.ximg.app](https://math.ximg.app) | The language of the universe — algebra, calculus, geometry, number theory, probability and statistics, and the greatest mathematicians from Euclid to Turing and Ramanujan. |
| [evolution.ximg.app](https://evolution.ximg.app) | 3.8 billion years of life — natural selection, genetic drift, speciation, Darwin and the Beagle voyage, the fossil record, five mass extinctions, and the full story of human evolution. |
| [gravity.ximg.app](https://gravity.ximg.app) | Interactive gravity simulator — animated solar system orbits, N-body chaos with Newton's law, Earth-Moon Lagrange points L1–L5, and escape velocity cannon with trajectory preview. |
| [waves.ximg.app](https://waves.ximg.app) | Wave physics explorer — transverse and longitudinal wave animations, double-slit interference patterns you can drag, sound frequency visualizer with Web Audio tone playback, and Fourier decomposition. |
| [chaos.ximg.app](https://chaos.ximg.app) | Chaos and fractals — real-time Lorenz attractor butterfly trace, zoomable Mandelbrot set, morphing Julia sets, and two double pendulums diverging from near-identical initial conditions. |
| [epidemic.ximg.app](https://epidemic.ximg.app) | SIR disease spread simulator — agent-based dot simulation with transmission and recovery, live S/I/R population curves, intervention controls (distancing, vaccination, quarantine), and R₀ calculator. |
| [algorithms.ximg.app](https://algorithms.ximg.app) | Interactive algorithm playground — visualize Bubble/Quick/Merge/Insertion sort, draw walls for A*/Dijkstra pathfinding, build and traverse a BST, and watch BFS/DFS light up a node-edge graph. |
| [os.ximg.app](https://os.ximg.app) | Browser-based mini OS visualization — animated round-robin process scheduler, visual RAM heap/stack allocator with fragmentation, virtual file system tree editor, and live CPU/memory/disk/network graphs. |
| [security.ximg.app](https://security.ximg.app) | Hands-on security education — SQL injection demo with live query construction, XSS sandbox safe vs unsafe render comparison, password entropy and crack-time analyzer with SHA-256 hashing, and JWT decoder. |
| [database.ximg.app](https://database.ximg.app) | Visual database education — interactive ER diagram with clickable table relationships, JOIN type animator (INNER/LEFT/RIGHT/FULL), drag-and-drop SQL query builder, and B-tree index vs full-scan performance demo. |
| [dns.ximg.app](https://dns.ximg.app) | Domain Name System reference — record types (A, MX, TXT, CNAME, DNSSEC), full resolution flow from root to authoritative, dig/nslookup commands, and DoH/DoT. |
| [suricata.ximg.app](https://suricata.ximg.app) | Suricata IDS/IPS reference — rule syntax, sticky buffers, protocol keywords, EVE JSON output format, JA3 fingerprinting, and CLI commands for network threat detection. |
| [network.ximg.app](https://network.ximg.app) | Interactive networking sandbox — animated TCP 3-way handshake, packet hop-by-hop journey, latency/packet-loss simulator with throughput charts, and step-by-step DNS resolution. |
| [request.ximg.app](https://request.ximg.app) | Enter any URL and watch the full end-to-end journey: DNS lookup, TCP handshake, TLS negotiation, HTTP request/response headers, and browser rendering pipeline with real-world timing. |
| [readme.ximg.app](https://readme.ximg.app) | The ximg-web project README rendered as a styled web page — live architecture overview, subdomain directory, and stack documentation. |
| [claudemd.ximg.app](https://claudemd.ximg.app) | The ximg-web CLAUDE.md rendered as a styled web page — AI assistant instructions, architecture notes, and project conventions. |
| [world.ximg.app](https://world.ximg.app) | Real-time world data dashboard — animated internet traffic map with pulsing city nodes, live cyber attack feed with map overlay, fake stock ticker with sparklines &amp; heat map, and live global stat counters. |
| [sandbox.ximg.app](https://sandbox.ximg.app) | Interactive physics simulations — bouncing particles with gravity/elasticity controls, wave interference with dual-wave sliders, elastic/inelastic collision demo with momentum display, and spring-mass oscillator with real-time phase diagram. |
| [playground.ximg.app](https://playground.ximg.app) | LLM concepts explorer — interactive tokenizer with BPE simulation, temperature probability distribution chart, top-k/top-p sampling visualizer, and low vs high temperature output comparison. |
| [tokens.ximg.app](https://tokens.ximg.app) | Deep dive into tokenization — live BPE tokenizer with colored spans, token type reference (whole words, subwords, special tokens), context window grid visualizer, and vocabulary browser. |
| [temperature.ximg.app](https://temperature.ximg.app) | LLM temperature deep dive — large interactive slider with zone labels (Deterministic/Focused/Balanced/Creative/Chaotic), softmax probability charts, sample text outputs per zone, and the math explained. |
| [embeddings.ximg.app](https://embeddings.ximg.app) | Vector embeddings visualizer — 2D semantic space with hoverable word clusters, cosine similarity calculator, word analogy arithmetic (king−man+woman=queen), and 8-dimensional radar chart. |
| [agents.ximg.app](https://agents.ximg.app) | AI agent architecture — animated agent loop flowchart, tool use simulation with JSON tool_call/tool_result messages, memory types diagram (in-context/external/episodic/semantic), and multi-agent orchestration canvas. |
| [visualize.ximg.app](https://visualize.ximg.app) | Interactive chart builder — bar chart, line chart (multi-series), animated pie/donut with click-to-highlight, and scatter plot with live linear regression and R² calculation. Vanilla JS canvas. |
| [statslab.ximg.app](https://statslab.ximg.app) | Interactive statistics education — probability distributions (Normal/Uniform/Exponential/Binomial/Poisson), Central Limit Theorem simulator, two-sample t-test with rejection region, and variance/sampling demo. |
| [regression.ximg.app](https://regression.ximg.app) | Click-to-add regression canvas — linear regression with draggable points, polynomial fit (degree 1–9) showing overfitting, gradient descent visualization with live loss curve, and residual analysis with Q-Q plot. |
| [probability.ximg.app](https://probability.ximg.app) | Four probability simulations — Monte Carlo π estimation with animated points, coin flip law of large numbers, birthday problem curve (23 people = 50%), and Monty Hall switch-vs-stay convergence to 2/3 and 1/3. |
| [systemdesign.ximg.app](https://systemdesign.ximg.app) | Interactive system architecture diagrams — URL shortener with animated request flow, social media fanout patterns, consistent hashing ring with node simulation, and CAP theorem Venn diagram with system examples. |
| [loadbalancer.ximg.app](https://loadbalancer.ximg.app) | Animated load balancing simulator — round robin/least connections/IP hash/weighted algorithms, server health checks with failure animation, sticky session comparison, and geographic routing visualization. |
| [cdn.ximg.app](https://cdn.ximg.app) | CDN concepts explorer — cache hit vs miss animation with timing comparison, interactive HTTP cache header editor (Cache-Control directives), global PoP edge network map, and cache invalidation propagation demo. |
| [queue.ximg.app](https://queue.ximg.app) | Async message queue simulator — animated queue with producer/consumer workers, producer-consumer rate tuning, dead letter queue with retry logic, and pub/sub fan-out with multiple subscribers. |
| [brain.ximg.app](https://brain.ximg.app) | Neuroscience explorer — animated neuron action potential with voltage plot, layered neural network forward-pass visualization, clickable brain regions diagram, and cognitive biases + working memory demo. |
| [sleep.ximg.app](https://sleep.ximg.app) | Sleep biology deep dive — animated hypnogram cycling through 5 sleep stages over 8 hours, 24-hour circadian rhythm curves (cortisol/melatonin/temp), sleep debt calculator, and EEG wave pattern comparison. |
| [nutrition.ximg.app](https://nutrition.ximg.app) | Nutrition science app — TDEE/macro calculator with donut chart, macronutrient deep-dive cards with digestion timelines, animated metabolism pathway (glycolysis/gluconeogenesis/ketosis), and 30-food comparison table. |
| [training.ximg.app](https://training.ximg.app) | Fitness training app — 12-week progressive overload strength chart with 1RM calculator (Epley formula), clickable SVG muscle diagram with exercises, supercompensation recovery curve, and 4 program templates (SS/5-3-1/PPL/PHUL). |
| [terminal.ximg.app](https://terminal.ximg.app) | Interactive retro Unix terminal — VAX-11/780 BSD simulation with CRT phosphor green scanlines, boot sequence, and classic commands: ls, fortune, cowsay, banner, cal, ps, top, ping arpanet, and more. |
| [punch.ximg.app](https://punch.ximg.app) | IBM 80-column punch card encoder and decoder — interactive Canvas card with Hollerith encoding, click-to-toggle holes, live character decode, FORTRAN/COBOL samples, and computing history from Hollerith 1890 to the end of the card era. |
| [circuit.ximg.app](https://circuit.ximg.app) | Drag-and-drop circuit canvas with resistors, capacitors, inductors, LEDs, diodes, transistors, and logic gates. Includes DC analysis calculators (Ohm's law, voltage divider, RC time constant) and a component reference guide. |
| [logic.ximg.app](https://logic.ximg.app) | Boolean logic explorer — interactive gate simulator (AND/OR/NOT/XOR/NAND/NOR/XNOR) with clickable inputs, drag-and-drop circuit builder, full truth tables with K-map, 4-bit ripple carry adder, and ALU explanation. |
| [ximg.app/compiler/](https://ximg.app/compiler/) | Visual compiler pipeline — live lexer/tokenizer with colored token stream, AST tree diagram with hover highlighting, 3-address IR code generation step-by-step animation, constant folding, dead code elimination, CSE, and x86-64 assembly output. |
| [protocol.ximg.app](https://protocol.ximg.app) | Animated serial protocol waveforms for UART, SPI, and I²C. Configure baud rate, data bytes, parity, SPI mode, and I²C address to see real-time timing diagrams with labeled bits, start/stop conditions, and ACK pulses. |
| [mainframe.ximg.app](https://mainframe.ximg.app) | IBM mainframe history from the 701 (1952) to the z16 (2022) — interactive timeline, JCL syntax explorer with three sample jobs, batch processing lifecycle, MIPS performance table, and COBOL reference. |
| [regex.ximg.app](https://regex.ximg.app) | Live regular expression tester — real-time match highlighting, group extraction, 14 quick-start patterns (email, URL, IP, date, UUID), flag toggles (g/i/m/s/u), and a full cheatsheet. |
| [jwt.ximg.app](https://jwt.ximg.app) | JWT encode, decode, and inspect — decode any token into header/payload/signature, HMAC sign (HS256/384/512) using Web Crypto, expiry/nbf/iat validation, claims reference, and algorithm comparison. |
| [cron.ximg.app](https://cron.ximg.app) | Cron expression builder — human-readable description, next 10 scheduled run times with relative offsets, 16 quick presets, field breakdown, and special character reference (* , - / ? L W #). |
| [color.ximg.app](https://color.ximg.app) | Color picker, palette generator, and contrast checker — HEX/RGB/HSL/CMYK conversions, 7 harmony types (complementary, triadic, etc.), CSS custom property export, and WCAG AA/AAA contrast ratio checking. |
| [dna.ximg.app](https://dna.ximg.app) | DNA interactive app — animated rotating double helix with A-T/G-C base pair labels, DNA replication fork with helicase/primase/Pol III, RNA transcription animation (RNAP on template strand), and translation with ribosome A/P/E sites + codon table. |
| [cell.ximg.app](https://cell.ximg.app) | Cell biology app — clickable animal cell explorer (10 organelles with descriptions), animated mitosis phase-by-phase (Interphase to Cytokinesis), membrane transport animations (passive diffusion, facilitated, active Na/K pump, osmosis), and organelle reference cards. |
| [ximg.app/immune/](https://ximg.app/immune/) | Immune system app — animated immune response timeline showing pathogen invasion, neutrophil/macrophage/T-cell/B-cell activation with innate vs adaptive phases, immune cell type reference (8 cell types), antibody Y-diagram with binding animation, 5 Ab classes, and vaccine type explainer. |
| [ximg.app/binary/](https://ximg.app/binary/) | CS fundamentals visualizer — base converter (bin/oct/dec/hex) with clickable bit grid, bitwise operations visualizer (AND/OR/XOR/NOT/shifts), IEEE 754 float breakdown (sign/exponent/mantissa), powers of 2 table, searchable ASCII table, and bit manipulation tricks. |
| [ximg.app/quantum/](https://ximg.app/quantum/) | Interactive quantum physics simulations — animated wave-packet propagation with wavefunction collapse toggle, double-slit interference pattern vs. which-path observation, Bloch sphere qubit explorer with θ/φ sliders, entangled Bell state measurement, and Schrödinger's cat superposition animation. |
| [ximg.app/synth/](https://ximg.app/synth/) | Fully functional browser synth using Web Audio API — 2-octave piano keyboard (click or keyboard shortcuts), oscillator types with ADSR envelope, distortion waveshaper, lowpass/highpass/bandpass filter with response curve, delay and reverb effects, real-time FFT spectrum analyzer, oscilloscope view, synth presets, and chord theory player. |
| [compound.ximg.app](https://compound.ximg.app) | Finance visualizer — compound vs simple interest chart with frequency toggle, retirement projections with inflation-adjusted line, debt payoff comparison with amortization table, and FIRE number calculator with lean/regular/fat FIRE thresholds. |
| [ximg.app/savings/](https://ximg.app/savings/) | Project when you will reach a savings target — monthly contribution inputs, compound interest simulation, balance growth area chart with goal line, and extra-per-month calculator to hit any target date. |
| [ximg.app/tax/](https://ximg.app/tax/) | 2024 federal income tax calculator for Single and Married Filing Jointly — per-bracket breakdown, marginal and effective rates, after-tax income, optional state tax, and horizontal bar chart colored by bracket. |
| [ximg.app/stocks/](https://ximg.app/stocks/) | Portfolio growth projector with annual contributions — nominal vs inflation-adjusted dual-line chart, CAGR, total gains, and comparison table at 4%/7%/10% return scenarios. |
| [ximg.app/options/](https://ximg.app/options/) | Options payoff diagram calculator for 8 strategies — Long/Short Call/Put, Covered Call, Protective Put, Bull Call Spread, Bear Put Spread — with breakeven, max profit/loss, profit zone shaded green, loss zone red. |
| [ximg.app/forex/](https://ximg.app/forex/) | Currency converter for 20 major pairs vs USD — live conversion, rate display, bar chart of $1,000 USD equivalent across all currencies, and quick-reference 1 USD grid. |
| [ximg.app/dcf/](https://ximg.app/dcf/) | Discounted Cash Flow valuation — up to 10 years of projected free cash flows, WACC/discount rate, terminal value via Gordon Growth Model, waterfall bar chart, IRR calculation, and 3x3 sensitivity table (WACC vs terminal growth rate). |
| [ximg.app/mortgage/](https://ximg.app/mortgage/) | Full mortgage payment calculator — monthly P+I, total interest, total cost, stacked-area amortization chart showing principal vs cumulative interest vs equity over the loan life, first 12-month detail table, and yearly summary. |
| [ximg.app/retire/](https://ximg.app/retire/) | Retirement portfolio projector — FI number (annual expenses / withdrawal rate), balance at retirement, monthly income, portfolio growth curve vs FI target line, with inflation-adjusted real return and safe withdrawal rate sliders. |
| [ximg.app/inflation/](https://ximg.app/inflation/) | Historical US CPI data 1920–2024 — purchasing power erosion over time, cumulative inflation %, geometric average rate, and area chart of purchasing power with annual CPI rate bars. Supports custom inflation rate mode. |
| [ximg.app/debt/](https://ximg.app/debt/) | Avalanche vs Snowball debt payoff comparison — add up to 6 debts with name/balance/APR/minimum, set extra monthly payment, see payoff dates, total interest, payoff order per method, interest saved by avalanche, and dual-line remaining-debt chart. |
| [ximg.app/budget/](https://ximg.app/budget/) | 50/30/20 rule budget planner — categorized needs/wants/savings spending inputs, actual vs target donut chart (side-by-side), progress bars with surplus/deficit, summary table with over/under status chips, and budget health grade. |
| [ximg.app/base64/](https://ximg.app/base64/) | Base64 encode/decode with URL-safe toggle, file-to-base64 drag-and-drop, byte count, and one-click copy. |
| [ximg.app/hash/](https://ximg.app/hash/) | Compute MD5, SHA-1, SHA-256, SHA-384, SHA-512 hashes from text or files; HMAC generator using Web Crypto API. |
| [ximg.app/diff/](https://ximg.app/diff/) | Side-by-side text and JSON diff with Myers algorithm — added/removed/unchanged lines color-coded, plus JSON-aware structural comparison. |
| [ximg.app/url/](https://ximg.app/url/) | URL encoder/decoder, full URL parser (protocol/host/path/query/fragment), and interactive URL builder with live assembly. |
| [ximg.app/curl/](https://ximg.app/curl/) | GUI curl command builder — method, URL, headers, body, auth (Basic/Bearer), common flags, live command preview, and a searchable flag reference. |
| [ximg.app/cidr/](https://ximg.app/cidr/) | CIDR subnet calculator (IPv4 + IPv6) — network/broadcast/mask/wildcard/host count, IP range to CIDR, and common prefix reference table. |
| [ximg.app/uuid/](https://ximg.app/uuid/) | Generate UUID v1/v4/v7 with color-coded segment breakdown; decode and explain any UUID; bulk generator up to 1000 UUIDs. |
| [ximg.app/lorem/](https://ximg.app/lorem/) | Generate lorem ipsum by words/sentences/paragraphs, fake code identifiers and JSON data, and placeholder markdown with headings/tables/code blocks. |
| [ximg.app/csv/](https://ximg.app/csv/) | CSV viewer with sortable columns, CSV↔JSON converter, and synthetic data generator (text/number/date/email/UUID columns). |
| [ximg.app/markdown/](https://ximg.app/markdown/) | Live split-pane markdown editor with vanilla JS renderer, formatting toolbar, syntax cheat sheet, and HTML→Markdown converter. |
| [ximg.app/password/](https://ximg.app/password/) | Password generator with entropy/strength meter and crack-time estimates; EFF-wordlist passphrase generator with configurable length and separator. |
| [ximg.app/ssl/](https://ximg.app/ssl/) | PEM certificate decoder (subject/issuer/SANs/validity/fingerprints/extensions), expiry countdown, and TLS version/cipher reference. |
| [ximg.app/epoch/](https://ximg.app/epoch/) | Live Unix timestamp display, epoch↔datetime conversion in multiple timezones, and date format token reference for Python/JS/Go/Java/SQL. |
| [ximg.app/timespan/](https://ximg.app/timespan/) | Date duration calculator, business-day counter (with US holidays), and date arithmetic — add/subtract years/months/weeks/days/hours chainably. |
| [ximg.app/555timer/](https://ximg.app/555timer/) | 555 timer astable/monostable calculator with waveform preview, pinout reference, and common application circuits. |
| [ximg.app/arduino/](https://ximg.app/arduino/) | Arduino Uno pinout with digital/analog/PWM/SPI/I2C tags, timer/PWM reference, common code snippets, LED current-limiting calculator, and quick reference. |
| [ximg.app/battery/](https://ximg.app/battery/) | Battery chemistry comparison, runtime calculator, LiPo C-rating and voltage guide, series/parallel pack designer, and standard cell size reference. |
| [ximg.app/capacitor/](https://ximg.app/capacitor/) | Ceramic cap code decoder, reactance (Xc) calculator, series/parallel combinations, energy and charge calculator, and capacitor type reference. |
| [ximg.app/fpga/](https://ximg.app/fpga/) | FPGA architecture overview (LUTs/FFs/BRAM/DSP/PLLs), Verilog and VHDL reference with code examples, popular dev boards comparison, open-source toolchain guide, and interactive LUT truth-table visualizer. |
| [ximg.app/impedance/](https://ximg.app/impedance/) | R/L/C impedance calculator for series and parallel RLC circuits, LC resonance and Q-factor tool, L-network impedance matching calculator, and interactive phasor diagram. |
| [ximg.app/ohms/](https://ximg.app/ohms/) | Ohm's law V/I/R/P calculator with animated VIR triangle, power triangle, voltage divider tool, and Kirchhoff's KCL/KVL helpers. |
| [ximg.app/opamp/](https://ximg.app/opamp/) | Op-amp inverting/non-inverting/difference amplifier gain calculators, summing amplifier, integrator/differentiator, comparator reference, and LM741/TL071/LM358 pinouts. |
| [ximg.app/oscilloscope/](https://ximg.app/oscilloscope/) | Animated oscilloscope with sine/square/sawtooth/triangle/pulse/noise waveforms, Lissajous figures (X-Y mode), FFT spectrum analyzer, and real-time measurements. |
| [ximg.app/pcb/](https://ximg.app/pcb/) | PCB layer overview, IPC-2221 trace width calculator, via size and current calculator, layer stackup recommendations, and JLCPCB/PCBWay design rule reference. |
| [ximg.app/pinout/](https://ximg.app/pinout/) | Searchable pinout tables for Arduino Uno, ESP32, Raspberry Pi 4, ATmega328P, and STM32F103 with pin type color-coding (digital/analog/PWM/SPI/I2C/UART). |
| [ximg.app/psu/](https://ximg.app/psu/) | Linear regulator efficiency and heatsink calculator, LM317 adjustable regulator designer, buck/boost converter duty cycle and inductor calculator, and filter capacitor sizing. |
| [ximg.app/pwm/](https://ximg.app/pwm/) | Interactive PWM waveform visualizer with duty cycle/frequency controls, timer prescaler calculator, servo pulse width calculator, and PWM application frequency reference. |
| [ximg.app/resistor/](https://ximg.app/resistor/) | 4-band and 5-band resistor color code decoder with visual resistor preview, SMD code decoder, series/parallel combinations, voltage divider, and E24/E96 value tables. |
| [ximg.app/spectrum/](https://ximg.app/spectrum/) | Interactive RF spectrum analyzer with modulation visualizations (AM/FM/PM/OFDM), frequency band reference (HF/VHF/UHF/SHF), antenna type guide, and propagation calculator. |
| [ximg.app/spi/](https://ximg.app/spi/) | SPI bus overview, interactive timing diagram for all 4 SPI modes (CPOL/CPHA), SPI vs I2C vs UART comparison, Arduino SPI code examples, and common SPI device reference. |
| [ximg.app/uart/](https://ximg.app/uart/) | UART frame visualizer (start/data/parity/stop bits), baud rate and timing calculator, RS-232 vs TTL vs RS-485 comparison, Arduino serial code examples, and parity explanation. |
| [ximg.app/voltage/](https://ximg.app/voltage/) | Voltage divider calculator with find-R1/R2 solver, logic level converter reference and IC guide, standard voltage levels (TTL/LVCMOS/RS-232/LVDS), unit converter with dBV/dBu/dBm, and AC mains voltage calculator. |
| [ximg.app/antenna/](https://ximg.app/antenna/) | Antenna design calculator for dipole, quarter-wave vertical, Yagi-Uda, and patch antennas — wavelength/frequency converter, gain reference, coax impedance guide, and antenna type comparison. |
| [egypt.ximg.app](https://egypt.ximg.app) | Ancient Egypt — pharaohs, pyramids, hieroglyphs, Nile civilization, interactive hieroglyph canvas. |
| [greece.ximg.app](https://greece.ximg.app) | Ancient Greece — city-states, philosophers, Olympics, democracy, interactive athlete simulation. |
| [babylon.ximg.app](https://babylon.ximg.app) | Ancient Babylon — Hammurabi's Code, Mesopotamian kings, ziggurats, interactive ziggurat builder. |
| [aztec.ximg.app](https://aztec.ximg.app) | Aztec Empire — Tenochtitlan, gods, Tonalpohualli calendar, interactive Sun Stone animation. |
| [mongols.ximg.app](https://mongols.ximg.app) | Mongol Empire — Genghis Khan, conquests, Silk Road, interactive cavalry horde canvas. |
| [vikings.ximg.app](https://vikings.ximg.app) | Viking Age — Norse explorers, longships, Northern Lights, interactive fleet canvas. |
| [crusades.ximg.app](https://crusades.ximg.app) | The Crusades — holy wars, knightly orders, Jerusalem, interactive candlelit city visualization. |
| [samurai.ximg.app](https://samurai.ximg.app) | Samurai Japan — bushido, shoguns, cherry blossoms, interactive sakura and Mount Fuji canvas. |
| [ottoman.ximg.app](https://ottoman.ximg.app) | Ottoman Empire — sultans, Constantinople, crescent moon, interactive Istanbul skyline. |
| [french.ximg.app](https://french.ximg.app) | French Revolution — causes, Terror, Robespierre, Napoleon, animated waving tricolor flag. |
| [russianrev.ximg.app](https://russianrev.ximg.app) | Russian Revolution — Tsarist collapse, Bolshevik coup, Civil War, Romanov execution, Red Terror, animated rotating Soviet red star canvas. |
| [napoleon.ximg.app](https://napoleon.ximg.app) | Napoleon Bonaparte — rise to Emperor, 6 campaigns from Austerlitz to Waterloo, Napoleonic Code, Hundred Days timeline, animated imperial eagle canvas. |
| [british.ximg.app](https://british.ximg.app) | The British Empire — The Sun Never Sets: 13.7M sq miles, 412M subjects, 8 major colonies, key figures from Victoria to Gandhi, full 1600–1997 timeline, animated waving Union Jack canvas. |
| [cuba.ximg.app](https://cuba.ximg.app) | Cuban Missile Crisis — 13 days to nuclear war (Oct 1962): Bay of Pigs background, day-by-day crisis timeline, JFK vs Khrushchev, Vasili Arkhipov (the man who saved the world), and a NORAD radar simulation. |
| [spacerace.ximg.app](https://spacerace.ximg.app) | The Space Race — Sputnik to Moon (1957–1972): Soviet & American missions, rocket thrust comparisons, key figures from Korolev to Katherine Johnson, Apollo 11 mission timeline, interactive warp-speed starfield. |
| [cuba.ximg.app](https://cuba.ximg.app) | Cuban Missile Crisis — 13 Days to Nuclear War (October 1962): Bay of Pigs, ExComm, Black Saturday, Vasili Arkhipov, interactive NORAD radar. |
| [communism.ximg.app](https://communism.ximg.app) | Communism — the deadliest ideology: 100M dead, Gulag, Mao's famine, Pol Pot's genocide, animated death counter. |
| [ww2.ximg.app](https://ww2.ximg.app) | World War II — battles, leaders, radar, interactive Chain Home radar sweep visualization. |
| [ww1.ximg.app](https://ww1.ximg.app) | World War I — trenches, battles, causes (MAIN), interactive Western Front trench scene. |
| [revolution.ximg.app](https://revolution.ximg.app) | American Revolution — Founding Fathers, famous quotes, interactive waving flag canvas. |
| [industrial.ximg.app](https://industrial.ximg.app) | Industrial Revolution — inventions, innovators, steam, interactive locomotive with fuel mechanic. |
| [civilwar.ximg.app](https://civilwar.ximg.app) | American Civil War — Union vs Confederacy, key battles, interactive battlefield canvas. |
| [renaissance.ximg.app](https://renaissance.ximg.app) | The Renaissance — masters, masterworks, humanism, interactive Vitruvian Man canvas. |
| [silkroad.ximg.app](https://silkroad.ximg.app) | The Silk Road — oasis cities, trade goods, caravans, interactive camel caravan canvas. |
| [colonial.ximg.app](https://colonial.ximg.app) | Age of Exploration — navigators, colonial empires, interactive 3D spinning globe with route lines. |
## Architecture

```
Browser
  │
  └─► nginx :80/:443  (SSL termination, HTTP→HTTPS, virtual hosting)
        │
        ├─► static (nginx, single container for all static sites)
        │     ├── each *-html/ mounted at /sites/<subdomain>.ximg.app
        │     └── shared-html/nav.js mounted at /sites/shared/
        │
        ├─► logs-server (Node.js :3000)
        │     ├── WebSocket /ws  — tails nginx access logs + SSH session files
        │     └── HTTP          — log viewer + SSH session browser UI
        │
        ├─► change-server (Node.js)
        │     └── Serves live git log as JSON
        │
        ├─► mail-server (Node.js :25)
        │     └── SMTP receiver + webmail reader UI
        │
        └─► ssh-server (Python/paramiko :22, isolated ssh-net)
              └── SSH honeypot — accepts any login, records full sessions
```

All containers run on an internal Docker bridge network. Only nginx (80/443), ssh-server (22), and mail-server (25) have public ports.

## Stack

| Component | Image / Runtime | Role |
|-----------|----------------|------|
| nginx | `nginx:alpine` | Reverse proxy, SSL termination, HTTP→HTTPS, virtual hosting |
| static | `nginx:alpine` | Single container serving all static sites via `$host`-based root routing |
| logs-server | `node:22-alpine` | WebSocket log streamer; tails nginx logs and SSH session files |
| change-server | `node:22-alpine` | Serves live git commit history |
| mail-server | `node:22-alpine` | SMTP receiver on port 25, webmail reader UI |
| ssh-server | `python:3.12-alpine` + paramiko | SSH honeypot on port 22, records sessions to `ssh-logs/` |
| systemd | `ximg-web.service` | Manages the entire Docker Compose stack on boot |

## Shared Nav

`shared-html/nav.js` — shared navigation bar (IIFE) volume-mounted read-only into the `static` container at `/sites/shared/` and served at `/shared/nav.js` on every subdomain. Load it as the **last script before `</body>`** — it calls `document.body.prepend()` and silently fails if the body doesn't exist yet.

## SSH Honeypot

- Listens on host port 22; accepts any username/password
- Drops attacker into `/bin/bash` as non-root `user` inside an isolated container
- Outbound traffic blocked via iptables; runs on a separate `ssh-net` Docker network
- Sessions recorded to `ssh-logs/YYYYMMDD-HHMMSS-IP-PID.log` (gitignored)
- Browsable live at `logs.ximg.app` under the "SSH Sessions" tab

## Mail Server

- Listens on port 25 and receives any email addressed to `@ximg.app`
- Messages stored in `mail-data/` and viewable through the webmail UI at `mail.ximg.app`

## Live Log Viewer (`logs.ximg.app`)

Node.js server (`logs-server/server.js`) tails nginx access logs and SSH session files, streaming new lines to the browser over WebSockets. On connect it replays the last 100 lines, then streams live. Uses `fs.watch` with a 1s polling fallback.

Frontend features: tab per subdomain, color-coded HTTP status codes (2xx green / 3xx cyan / 4xx yellow / 5xx red), live per-class counters, pause/resume, auto-reconnect.

## Change Log (`change.ximg.app`)

`change-server` reads the repo's git log and serves it as JSON. The frontend renders a searchable table of every commit — message, hash, author, date — updated on each page load.

## SSL

A single wildcard cert covers all `*.ximg.app` subdomains. It was issued via [acme.sh](https://acme.sh) with GoDaddy DNS-01 challenge and is stored at `/etc/letsencrypt/live/wildcard.ximg.app/`, mounted read-only into nginx. Auto-renewed by acme.sh's cron job (~day 60); the renewal hook reloads nginx automatically. TLS 1.2/1.3 only, HSTS enforced (`max-age=63072000`).

**Do not issue individual certs per subdomain** — the wildcard covers everything. Every nginx `server {}` block should use:

```nginx
ssl_certificate     /etc/letsencrypt/live/wildcard.ximg.app/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/wildcard.ximg.app/privkey.pem;
```

## Logging

nginx writes per-site logs to `./logs/` on the host, mounted read-only into the logs container.

```bash
bash log-summary.sh   # generate a markdown summary report
```

## Usage

```bash
# Start all services
docker compose up -d

# Rebuild after changes
docker compose up -d --build

# View live logs
tail -f logs/ximg.access.log

# Stop
docker compose down
```

## Adding a New App

Every new app must be wired into all of the following:

1. **`*-html/` directory** — create with `index.html`; add `<script src="/shared/nav.js?v=2"></script>` as the last script before `</body>`
2. **Favicon** — download a thematically appropriate image, save as `favicon.ico` or `favicon.png`, reference it in `<head>`
3. **`compose.yaml`** — add a volume mount to the `static` service: `- ./<name>-html:/sites/<subdomain>.ximg.app:ro`
4. **`nginx/nginx.conf`** — add the subdomain to the HTTP redirect `server_name` list and add a new HTTPS `server {}` block
5. **SSL** — no new cert needed; reference the wildcard cert in the nginx server block (`/etc/letsencrypt/live/wildcard.ximg.app/`)
6. **`shared-html/nav.js`** — add nav entry
7. **`public-html/index.html`** — add landing page card
8. **`apps-html/index.html`** — add a row to the `APPS` array
9. **`logs-server/server.js`** — add subdomain to the tab list
10. **Nagios** — add a `define host {}` entry in `nagios-server/ximg-hosts.cfg` and add the subdomain to the `members` list
11. **`README.md`** — add a row to the Live Sites table
12. **`install/setup.sh`** — add the subdomain to the `DOMAINS` array
13. **DNS** — add an A record → `172.238.205.61`
