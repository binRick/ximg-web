# ximg-web

Production multi-site web portfolio stack running on a single Linux VM at `172.238.205.61`. nginx sits in front as a reverse proxy handling SSL termination and virtual hosting. Apache serves static content per subdomain on the internal Docker network. Several Node.js and Python services power dynamic features.

## Live Sites

80 virtual hosts (root + 79 subdomains), each with its own Apache container.

| Subdomain | Description |
|-----------|-------------|
| [ximg.app](https://ximg.app) | Landing page — animated grid, floating orbs, frosted-glass app directory card |
| [apps.ximg.app](https://apps.ximg.app) | Full searchable directory of every app in the stack |
| [linux.ximg.app](https://linux.ximg.app) | Browser terminal via xterm.js — ~20 mock shell commands, DVD-bouncing Tux mascot |
| [claude.ximg.app](https://claude.ximg.app) | Claude AI showcase — Anthropic model overview, capabilities, and API reference |
| [ai.ximg.app](https://ai.ximg.app) | Artificial Intelligence deep dive — frontier LLMs, leading companies, 75-year history from Turing to ChatGPT |
| [mac.ximg.app](https://mac.ximg.app) | Apple Silicon, macOS history (Cheetah to Sequoia), Mach microkernel, Mac hardware lineup, M1–M4 analysis |
| [butterfly.ximg.app](https://butterfly.ximg.app) | Canvas particle animation driven by the butterfly curve polar equation |
| [ascii.ximg.app](https://ascii.ximg.app) | Three ASCII demos: spinning 3D donut, matrix rain, sine-wave plasma |
| [json.ximg.app](https://json.ximg.app) | JSON type reference card with syntax-highlighted examples |
| [yaml.ximg.app](https://yaml.ximg.app) | YAML reference covering scalars, sequences, mappings, anchors, and gotchas |
| [poker.ximg.app](https://poker.ximg.app) | Texas Hold'em hand evaluator — hole cards, hand rank, probability chart, GTO preflop chart |
| [mario.ximg.app](https://mario.ximg.app) | Canvas-based Mario platformer playable in the browser — move, jump, enemies, score |
| [doom.ximg.app](https://doom.ximg.app) | DOOM lore deep-dive — weapons, enemies, levels, id Software history |
| [cnc.ximg.app](https://cnc.ximg.app) | Command & Conquer franchise — every game, factions, units, buildings, lore, plus a browser RTS tab |
| [simcity.ximg.app](https://simcity.ximg.app) | SimCity legacy — every game, Will Wright, and Cities: Skylines as its heir |
| [chess.ximg.app](https://chess.ximg.app) | The game of kings — pieces, openings, tactics, all 16 world champions, 1,500 years of history |
| [kombat.ximg.app](https://kombat.ximg.app) | Full Mortal Kombat character roster with bios and fighting stats |
| [wargames.ximg.app](https://wargames.ximg.app) | 1983 cold-war thriller guide — cast, plot, WOPR terminal Easter egg |
| [warcraft.ximg.app](https://warcraft.ximg.app) | Blizzard's fantasy franchise — RTS origins, WoW expansions, Arthas, Thrall, 30 years of Azeroth lore |
| [kart.ximg.app](https://kart.ximg.app) | Mario Kart series — all 11 games, original 8 characters, cups, items, SNES 1992 to Switch 2 |
| [docker.ximg.app](https://docker.ximg.app) | Docker command reference and annotated Docker Compose guide |
| [internet.ximg.app](https://internet.ximg.app) | What the internet is, how DARPA built it, top 20 protocols |
| [computers.ximg.app](https://computers.ximg.app) | History of American computing — timeline, pioneering companies, key people |
| [programming.ximg.app](https://programming.ximg.app) | 180 years of code — languages, paradigms, pioneers, timeline from Ada Lovelace to AI code generation |
| [git.ximg.app](https://git.ximg.app) | Git command cheatsheet, concepts, branching strategies, config, full history from 2005 |
| [crypto.ximg.app](https://crypto.ximg.app) | Cryptography reference — hashing, symmetric/asymmetric ciphers, key exchange, TLS 1.3, PGP, openssl/gpg tools |
| [ansible.ximg.app](https://ansible.ximg.app) | Agentless automation — playbooks, modules, inventory, roles, Vault, history from 2012 |
| [tmux.ximg.app](https://tmux.ximg.app) | Terminal multiplexer reference — cheatsheet, interactive pane simulator, .tmux.conf, 17-year history |
| [systemd.ximg.app](https://systemd.ximg.app) | Linux service manager — systemctl reference, unit file anatomy, journalctl, history from 2010 |
| [vr.ximg.app](https://vr.ximg.app) | Virtual reality — headsets, landmark games, how VR works, 60-year history to Apple Vision Pro |
| [passwords.ximg.app](https://passwords.ximg.app) | Password generator, strength tester, crack-time estimator, and best-practice guide |
| [fidonet.ximg.app](https://fidonet.ximg.app) | FidoNet BBS history — how it worked, culture, the 40,000-node volunteer network |
| [arpanet.ximg.app](https://arpanet.ximg.app) | Animated ARPANET history — network grows from 4 nodes (1969) to 213 nodes, packet routing demo, first "LO" message, TCP/IP origins |
| [coldwar.ximg.app](https://coldwar.ximg.app) | The 45-year standoff — nuclear arms race, proxy wars, space race, CIA vs KGB, Soviet collapse |
| [pizza.ximg.app](https://pizza.ximg.app) | Top pizza chains and regional styles across America |
| [chinese.ximg.app](https://chinese.ximg.app) | Eight regional Chinese cuisines and their iconic dishes |
| [grilling.ximg.app](https://grilling.ximg.app) | The art of grilling — grill types, regional BBQ styles, temp guide, wood pairings, rubs, sauces, tools |
| [india.ximg.app](https://india.ximg.app) | India explorer — culture, food, landmarks, history |
| [moto.ximg.app](https://moto.ximg.app) | Motorcycle culture — types, iconic brands, notable bikes |
| [monkey.ximg.app](https://monkey.ximg.app) | Primate species, facts, and fun content |
| [wood.ximg.app](https://wood.ximg.app) | Woodworking — species, joinery, hand/power tools, finishing |
| [guns.ximg.app](https://guns.ximg.app) | Firearm types and the top 10 most popular guns in America |
| [tampa.ximg.app](https://tampa.ximg.app) | Tampa Bay guide — best restaurants, interactive map, live traffic |
| [florida.ximg.app](https://florida.ximg.app) | Florida — beaches, nature, food, and eternal summer |
| [america.ximg.app](https://america.ximg.app) | Why the USA is the greatest country — science, tech, military, culture |
| [trump.ximg.app](https://trump.ximg.app) | Donald J. Trump — fun facts, life timeline, presidency achievements, photo gallery |
| [rx.ximg.app](https://rx.ximg.app) | RxFitt health coaching — GLP-1 tracking, metabolic labs, body composition, workouts |
| [ximg.ximg.app](https://ximg.ximg.app) | Full technical teardown of the ximg.app infrastructure — architecture, container topology, SSL lifecycle |
| [logs.ximg.app](https://logs.ximg.app) | Real-time nginx access log viewer over WebSocket + SSH honeypot session browser |
| [ids.ximg.app](https://ids.ximg.app) | Live Suricata IDS feed — alerts, attacker world map, and threat statistics |
| [stats.ximg.app](https://stats.ximg.app) | AWStats traffic analytics — per-site visitor counts, referrers, and bandwidth |
| [mail.ximg.app](https://mail.ximg.app) | Webmail inbox for @ximg.app — live SMTP receiver with Gmail-style reader UI |
| [unix.ximg.app](https://unix.ximg.app) | Unix history, philosophy (17 rules), commands cheatsheet, family tree from Bell Labs to Linux, and key people |
| [bsd.ximg.app](https://bsd.ximg.app) | BSD deep-dive — FreeBSD, OpenBSD, NetBSD, DragonFly, TCP/IP history, ZFS, pf firewall, and BSD in every Mac and PlayStation |
| [vim.ximg.app](https://vim.ximg.app) | The ubiquitous editor — modes, 50+ commands, 12 plugins, and history from vi (1976) to Vim 9 |
| [http.ximg.app](https://http.ximg.app) | HTTP protocol reference — 9 methods, full status codes, headers, versions HTTP/0.9–HTTP/3, and security headers |
| [ssh.ximg.app](https://ssh.ximg.app) | Secure Shell — 30+ commands, key types (Ed25519/RSA/ECDSA), config reference, and hardening guide |
| [sql.ximg.app](https://sql.ximg.app) | SQL reference — DML/DDL/TCL, data types, aggregate/window functions, join Venn diagrams, 8 databases |
| [space.ximg.app](https://space.ximg.app) | The final frontier — solar system, 12 missions, rocket comparison, exoplanets, black holes, animated starfield |
| [coffee.ximg.app](https://coffee.ximg.app) | The world's favorite brew — 8 origins, 8 brewing methods, roast spectrum, varietals, café culture history |
| [japan.ximg.app](https://japan.ximg.app) | Japan — cherry blossom animation, 6 philosophy concepts, 12 foods, 10 tech companies, timeline from 14000 BCE |
| [quake.ximg.app](https://quake.ximg.app) | id Software's dark legend — 6 games, 10 weapons, 12 monsters, 8 maps, ember particle animation |
| [nintendo.ximg.app](https://nintendo.ximg.app) | 135 years of play — 13 consoles, 16 iconic games, 13 characters, pixel-art Mario, company history |
| [pirates.ximg.app](https://pirates.ximg.app) | The Golden Age of Piracy — 8 infamous pirates, ships, the Pirate Code, havens, tactics, timeline |
| [medieval.ximg.app](https://medieval.ximg.app) | The Middle Ages — feudal system, famous battles, knights, castles, siege weapons, military orders |
| [change.ximg.app](https://change.ximg.app) | Live git commit history — every change to this project, searchable |
| [bash.ximg.app](https://bash.ximg.app) | Bash scripting reference — variables, arrays, control flow, functions, I/O redirection, arithmetic, and common patterns |
| [zsh.ximg.app](https://zsh.ximg.app) | Z Shell reference — extended globbing, parameter flags, oh-my-zsh plugins, Powerlevel10k themes, and differences from Bash |
| [vt101.ximg.app](https://vt101.ximg.app) | DEC VT101 terminal history and ANSI escape code reference — SGR colors, cursor sequences, and the hardware legacy behind every modern terminal |
| [nagios.ximg.app](https://nagios.ximg.app) | Nagios Core monitoring — live HTTPS health checks for every subdomain plus SSH honeypot port watch |
| [status.ximg.app](https://status.ximg.app) | Nagios host/service status board — at-a-glance green/red view of every monitored subdomain |
| [nav.ximg.app](https://nav.ximg.app) | Navigation design showcase — five interactive demos comparing hamburger drawer, horizontal scroll, dropdown groups, hub-only, and searchable launcher patterns |
| [physics.ximg.app](https://physics.ximg.app) | The laws of the universe — mechanics, thermodynamics, electromagnetism, quantum mechanics, relativity, Standard Model, fundamental constants |
| [chemistry.ximg.app](https://chemistry.ximg.app) | The central science — periodic table, atomic structure, bonding, reactions, organic chemistry, biomolecules, great chemists |
| [biology.ximg.app](https://biology.ximg.app) | The science of life — cells, genetics and DNA, taxonomy, body systems, ecology, and the biologists who shaped the field |
| [math.ximg.app](https://math.ximg.app) | The language of the universe — algebra, calculus, geometry, number theory, probability and statistics, great mathematicians |
| [evolution.ximg.app](https://evolution.ximg.app) | 3.8 billion years of life — natural selection, Darwin's voyage, fossil record, five mass extinctions, human evolution timeline |
| [gravity.ximg.app](https://gravity.ximg.app) | Orbital mechanics simulator — animated solar system, N-body gravity (Newton's law), Earth-Moon Lagrange points L1–L5, escape velocity cannon |
| [waves.ximg.app](https://waves.ximg.app) | Wave physics explorer — transverse/longitudinal wave animations, double-slit interference, sound frequency visualizer with Web Audio, Fourier decomposition |
| [chaos.ximg.app](https://chaos.ximg.app) | Chaos theory and fractals — real-time Lorenz attractor, zoomable Mandelbrot set, morphing Julia sets, double pendulum demonstrating sensitivity to initial conditions |
| [epidemic.ximg.app](https://epidemic.ximg.app) | SIR disease spread simulator — agent-based dot simulation, live S/I/R curves, interventions (distancing, vaccination, quarantine), R₀ and herd immunity calculator |
| [algorithms.ximg.app](https://algorithms.ximg.app) | Interactive algorithm playground — Bubble/Quick/Merge/Insertion sort visualizer, A*/Dijkstra pathfinding on a drawable grid, BST builder with traversal, BFS/DFS graph explorer |
| [os.ximg.app](https://os.ximg.app) | OS Simulator — animated round-robin/FIFO/priority process scheduler, visual RAM allocator with heap/stack fragmentation, virtual file system tree, live system monitor graphs |
| [security.ximg.app](https://security.ximg.app) | Security Lab — SQL injection demo with live query highlighting, XSS safe/unsafe sandbox, password entropy and crack-time analyzer with SHA-256 hashing, JWT decoder |
| [database.ximg.app](https://database.ximg.app) | Database Visualizer — interactive ER diagram, JOIN type animator (INNER/LEFT/RIGHT/FULL OUTER), visual SQL query builder, B-tree index vs full-table scan performance demo |
| [dns.ximg.app](https://dns.ximg.app) | Domain Name System reference — record types, resolution flow, dig/nslookup commands, DNSSEC chain of trust, DoH/DoT |
| [suricata.ximg.app](https://suricata.ximg.app) | Suricata IDS/IPS reference — rule syntax, sticky buffers, protocol parsers, EVE JSON output, JA3 fingerprinting, CLI commands |
| [network.ximg.app](https://network.ximg.app) | Interactive networking sandbox — animated TCP 3-way handshake, packet hop journey, latency/loss simulator with throughput charts, and DNS resolution |
| [request.ximg.app](https://request.ximg.app) | How the Web Works — enter a URL and watch DNS lookup, TCP handshake, TLS negotiation, HTTP headers, and browser rendering pipeline with real timing |
| [readme.ximg.app](https://readme.ximg.app) | The ximg-web project README rendered as a styled web page — architecture overview, subdomain directory, and stack docs |
| [claudemd.ximg.app](https://claudemd.ximg.app) | The ximg-web CLAUDE.md rendered as a styled web page — AI assistant instructions, architecture notes, and project conventions |
| [world.ximg.app](https://world.ximg.app) | Real-time world data dashboard — animated internet traffic map, live cyber attack feed, fake stock ticker with heat map, and live global stat counters |
| [sandbox.ximg.app](https://sandbox.ximg.app) | Interactive physics sandbox — bouncing particles, wave interference, elastic/inelastic collisions with momentum display, and spring-mass oscillator with phase diagram |
| [playground.ximg.app](https://playground.ximg.app) | LLM concepts explorer — tokenizer, temperature probability charts, top-k/top-p sampling, and low vs high temperature comparison |
| [tokens.ximg.app](https://tokens.ximg.app) | Token Visualizer — live BPE tokenizer, token type reference, context window grid, and BPE vocabulary browser |
| [temperature.ximg.app](https://temperature.ximg.app) | LLM Temperature Explorer — interactive temperature slider with softmax probability charts and sample text outputs per zone |
| [embeddings.ximg.app](https://embeddings.ximg.app) | Vector Embeddings Explorer — 2D semantic space, cosine similarity calculator, word analogies, and 8-dim radar chart |
| [agents.ximg.app](https://agents.ximg.app) | AI Agent Loops — animated agent loop, tool use simulation, memory type diagram, and multi-agent orchestration canvas |
| [visualize.ximg.app](https://visualize.ximg.app) | Chart Builder — interactive bar, line, pie/donut, and scatter plot builder with canvas rendering and live regression |
| [statslab.ximg.app](https://statslab.ximg.app) | Statistics Lab — probability distributions, Central Limit Theorem, hypothesis testing, and variance/sampling demos |
| [regression.ximg.app](https://regression.ximg.app) | Regression Playground — click-to-add linear/polynomial regression, gradient descent visualization, residual analysis |
| [probability.ximg.app](https://probability.ximg.app) | Probability & Monte Carlo — Monte Carlo π, coin flip law of large numbers, birthday problem, Monty Hall simulation |
| [systemdesign.ximg.app](https://systemdesign.ximg.app) | System Design Explorer — URL shortener architecture, social feed fanout, consistent hashing ring, CAP theorem |
| [loadbalancer.ximg.app](https://loadbalancer.ximg.app) | Load Balancer Simulator — round robin/least connections/IP hash/weighted algorithms, health checks, sticky sessions, geo routing |
| [cdn.ximg.app](https://cdn.ximg.app) | CDN & Edge Caching — cache hit/miss animation, HTTP cache headers editor, PoP edge network map, invalidation demo |
| [queue.ximg.app](https://queue.ximg.app) | Message Queue & Async Processing — queue basics, producer-consumer, dead letter queue, pub/sub fan-out |
| [brain.ximg.app](https://brain.ximg.app) | Brain & Neuroscience — neuron action potential, neural network forward pass, brain regions, cognitive biases |
| [sleep.ximg.app](https://sleep.ximg.app) | Sleep Science — hypnogram animation, circadian rhythm curves, sleep debt calculator, EEG wave patterns |
| [nutrition.ximg.app](https://nutrition.ximg.app) | Nutrition & Metabolism — TDEE/macro calculator, macronutrient guide, metabolism pathways, food comparison table |
| [training.ximg.app](https://training.ximg.app) | Strength & Fitness — progressive overload chart, muscle group diagram, recovery curve, program templates |
| [dna.ximg.app](https://dna.ximg.app) | DNA — animated rotating double helix (A-T/G-C base pairs), DNA replication fork animation, transcription (RNAP on template strand), translation (ribosome codon-by-codon) with codon table |
| [cell.ximg.app](https://cell.ximg.app) | The Cell — interactive animal cell explorer (clickable organelles), animated mitosis phases, membrane transport (passive/facilitated/active/osmosis), organelle reference cards |
| [immune.ximg.app](https://immune.ximg.app) | The Immune System — animated immune response timeline (innate vs adaptive), immune cell type reference, antibody Y-diagram with binding animation, vaccine types and mechanism |
| [terminal.ximg.app](https://terminal.ximg.app) | Retro Terminal — interactive VAX-11/780 BSD simulation, CRT phosphor green scanlines, classic Unix commands, cowsay, fortune, banner, and boot sequence |
| [punch.ximg.app](https://punch.ximg.app) | Punch Card — IBM 80-column Hollerith encoder/decoder, interactive Canvas card, click-to-toggle holes, FORTRAN/COBOL samples, computing history from 1890 |
| [circuit.ximg.app](https://circuit.ximg.app) | Circuit Builder — drag-and-drop circuit canvas (resistors, caps, inductors, LEDs, logic gates), DC analysis calculators, component reference |
| [logic.ximg.app](https://logic.ximg.app) | Logic Gates — interactive gate simulator (AND/OR/NOT/XOR/NAND/NOR/XNOR), drag-and-drop circuit builder, truth tables with K-map, 4-bit ripple carry adder, ALU explanation |
| [compiler.ximg.app](https://compiler.ximg.app) | How Compilers Work — live lexer with colored token stream, AST tree diagram, 3-address IR code generation step-by-step, constant folding/DCE/CSE optimizations, x86-64 assembly output |
| [protocol.ximg.app](https://protocol.ximg.app) | Protocol Visualizer — animated UART, SPI, and I²C waveform diagrams with configurable baud rates, modes, and data bytes |
| [mainframe.ximg.app](https://mainframe.ximg.app) | IBM Mainframe history — interactive timeline (701 to z16), JCL syntax explorer, batch processing lifecycle, MIPS performance table, and COBOL reference |
| [regex.ximg.app](https://regex.ximg.app) | Live regex tester — 4-tab tool: Tester (live highlighting, group extraction), Groups (color-coded table), Replace (backreference preview), Reference (cheatsheet + 14 patterns) |
| [binary.ximg.app](https://binary.ximg.app) | Binary & number systems — base converter with clickable bit grid, bitwise ops visualizer, IEEE 754 float breakdown, powers of 2, searchable ASCII table, bit tricks |
| [jwt.ximg.app](https://jwt.ximg.app) | JWT decoder & encoder — decode any token, HMAC sign (HS256/384/512), expiry/nbf/iat validation, claims reference, algorithm comparison |
| [cron.ximg.app](https://cron.ximg.app) | Cron expression builder — human-readable output, next 10 scheduled runs, 16 presets, field breakdown, special character reference |
| [color.ximg.app](https://color.ximg.app) | Color tools — picker (HEX/RGB/HSL/CMYK), palette generator (7 harmony types), WCAG AA/AAA contrast checker, CSS variable export |
| [quantum.ximg.app](https://quantum.ximg.app) | Quantum Mechanics Explorer — wave-packet propagation with wavefunction collapse, double-slit interference vs. which-path observation, Bloch sphere qubit explorer, entangled Bell state measurement, Schrödinger's cat |
| [synth.ximg.app](https://synth.ximg.app) | Web Audio Synthesizer — playable 2-octave piano keyboard, oscillator types with ADSR envelope, distortion/filter/delay/reverb effects chain, real-time FFT spectrum analyzer, oscilloscope, synth presets, chord theory player |
| [compound.ximg.app](https://compound.ximg.app) | Compound Interest & Wealth Calculator — compound vs simple interest chart, retirement projections with inflation adjustment, debt payoff comparison with amortization table, FIRE number calculator |
| [savings.ximg.app](https://ximg.app/savings/) | Savings Goal Calculator — project when you reach a target with compound interest, balance growth area chart with goal line, extra-per-month shortfall calculator |
| [tax.ximg.app](https://ximg.app/tax/) | US Income Tax Calculator — 2024 federal brackets (single & MFJ), per-bracket breakdown, marginal and effective rates, optional state tax, horizontal bar chart colored by bracket |
| [stocks.ximg.app](https://ximg.app/stocks/) | Stock Return & CAGR Calculator — portfolio growth with annual contributions, nominal vs inflation-adjusted dual-line chart, 4%/7%/10% scenario comparison table |
| [options.ximg.app](https://ximg.app/options/) | Options P&L Calculator — payoff diagrams for 8 strategies (Long/Short Call/Put, Covered Call, Protective Put, Bull Call Spread, Bear Put Spread), profit zone green, loss zone red |
| [forex.ximg.app](https://ximg.app/forex/) | Forex Currency Converter — 20 major pairs vs USD, live conversion, $1,000 USD bar chart across all currencies, quick-reference rate grid |
| [dcf.ximg.app](https://ximg.app/dcf/) | DCF Calculator — up to 10-year free cash flow projections, WACC, terminal value (Gordon Growth), waterfall chart, IRR, 3x3 sensitivity table (WACC vs TGR) |
| [mortgage.ximg.app](https://mortgage.ximg.app) | Mortgage Calculator — monthly P+I payment, total interest, total cost, stacked-area amortization chart (principal vs cumulative interest vs equity), 12-month detail table, yearly summary |
| [retire.ximg.app](https://retire.ximg.app) | Retirement Calculator — FI number, balance at retirement, monthly income, portfolio growth curve vs FI target line, with annual return/inflation/SWR sliders |
| [inflation.ximg.app](https://inflation.ximg.app) | Inflation Calculator — historical US CPI data 1920–2024, purchasing power erosion over time, cumulative inflation %, average rate, area chart with annual CPI bars; custom rate mode |
| [debt.ximg.app](https://debt.ximg.app) | Debt Payoff Calculator — Avalanche vs Snowball comparison for up to 6 debts, payoff dates, total interest, payoff order per method, interest saved, dual-line remaining-debt chart |
| [budget.ximg.app](https://budget.ximg.app) | Budget Planner 50/30/20 — categorized needs/wants/savings inputs, actual vs target donut charts, category progress bars, surplus/deficit table, over/under status chips, budget grade |
| [ximg.app/base64/](https://ximg.app/base64/) | Base64 Encoder/Decoder — encode/decode text with URL-safe toggle, file drag-and-drop to base64, byte count, copy button |
| [ximg.app/hash/](https://ximg.app/hash/) | Hash Generator — MD5, SHA-1/256/384/512 from text or files, HMAC generator (Web Crypto), copy per hash |
| [ximg.app/diff/](https://ximg.app/diff/) | Text Diff — Myers algorithm side-by-side diff (added green / removed red), JSON-aware structural diff |
| [ximg.app/url/](https://ximg.app/url/) | URL Tools — encoder/decoder, full URL parser, interactive URL builder with live assembly |
| [ximg.app/curl/](https://ximg.app/curl/) | cURL Builder — GUI form for method/URL/headers/body/auth/flags, live curl command preview, searchable flag reference |
| [ximg.app/cidr/](https://ximg.app/cidr/) | CIDR / Subnet Calculator — IPv4+IPv6 network/broadcast/mask/wildcard/hosts, IP range to CIDR, prefix reference table |
| [ximg.app/uuid/](https://ximg.app/uuid/) | UUID Generator — v1/v4/v7 with color-coded segment breakdown, UUID decoder, bulk generator up to 1000 |
| [ximg.app/lorem/](https://ximg.app/lorem/) | Lorem Ipsum Generator — words/sentences/paragraphs, fake code identifiers and JSON, placeholder markdown |
| [ximg.app/csv/](https://ximg.app/csv/) | CSV Tools — sortable table viewer, CSV↔JSON converter, synthetic data generator with typed columns |
| [ximg.app/markdown/](https://ximg.app/markdown/) | Markdown Editor — live split-pane preview (vanilla JS renderer), formatting toolbar, cheat sheet, HTML→Markdown converter |
| [ximg.app/password/](https://ximg.app/password/) | Password Generator — entropy/strength meter with crack-time estimates, EFF passphrase generator |
| [ximg.app/ssl/](https://ximg.app/ssl/) | SSL / TLS Tools — PEM cert decoder (SANs/validity/fingerprints), expiry countdown, TLS version and cipher reference |
| [epoch.ximg.app](https://epoch.ximg.app) | Unix Epoch Converter — live timestamp display, epoch↔datetime in multiple timezones, format token reference for Python/JS/Go/Java/SQL |
| [timespan.ximg.app](https://timespan.ximg.app) | Timespan Calculator — date duration, business-day counter (US holidays), chainable date arithmetic |
| [555timer.ximg.app](https://555timer.ximg.app) | 555 Timer Designer — astable/monostable calculator, waveform preview, pinout reference |
| [arduino.ximg.app](https://arduino.ximg.app) | Arduino Reference — Uno pinout, timer/PWM guide, code snippets, LED calculator |
| [battery.ximg.app](https://battery.ximg.app) | Battery Reference — chemistry comparison, runtime calculator, LiPo guide, series/parallel pack designer |
| [capacitor.ximg.app](https://capacitor.ximg.app) | Capacitor Calculator — code decoder, reactance (Xc), series/parallel, energy & charge |
| [fpga.ximg.app](https://fpga.ximg.app) | FPGA Reference — architecture overview, Verilog/VHDL examples, dev board comparison, LUT visualizer |
| [impedance.ximg.app](https://impedance.ximg.app) | Impedance Calculator — R/L/C series/parallel, LC resonance, L-network matching, phasor diagram |
| [ohms.ximg.app](https://ohms.ximg.app) | Ohm's Law Calculator — V/I/R/P solver, power triangle, voltage divider, Kirchhoff's KCL/KVL |
| [opamp.ximg.app](https://opamp.ximg.app) | Op-Amp Calculator — inverting/non-inverting/difference amplifier gain, summing amp, comparator reference |
| [oscilloscope.ximg.app](https://oscilloscope.ximg.app) | Oscilloscope Viewer — animated waveforms, Lissajous figures, FFT spectrum analyzer |
| [pcb.ximg.app](https://pcb.ximg.app) | PCB Design Reference — trace width calc (IPC-2221), via calculator, layer stackup, design rules |
| [pinout.ximg.app](https://pinout.ximg.app) | IC Pinout Reference — Arduino Uno, ESP32, Raspberry Pi 4, ATmega328P, STM32F103 |
| [psu.ximg.app](https://psu.ximg.app) | Power Supply Design — linear reg efficiency, LM317 designer, buck/boost calc, filter cap sizing |
| [pwm.ximg.app](https://pwm.ximg.app) | PWM Reference — waveform visualizer, timer prescaler calc, servo control, application freq guide |
| [resistor.ximg.app](https://resistor.ximg.app) | Resistor Calculator — 3/4/5-band color code decoder, SMD code, series/parallel, E24/E96 tables |
| [spectrum.ximg.app](https://spectrum.ximg.app) | RF Spectrum Analyzer — modulation visualizations, frequency band reference, antenna guide |
| [spi.ximg.app](https://spi.ximg.app) | SPI Reference — timing diagram for all 4 modes, SPI vs I2C vs UART, Arduino code, device list |
| [uart.ximg.app](https://uart.ximg.app) | UART Reference — frame visualizer, baud rate calculator, RS-232 vs TTL vs RS-485, Arduino code |
| [voltage.ximg.app](https://voltage.ximg.app) | Voltage Reference — divider calc, logic level converter, standard voltage levels, dBV/dBu/dBm, AC mains |

## Architecture

```
Browser
  │
  └─► nginx :80/:443  (SSL termination, HTTP→HTTPS, virtual hosting)
        │
        ├─► Apache httpd containers (one per static subdomain, :80 internal)
        │     └── shared-html/nav.js volume-mounted into every container
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
| Apache httpd | `httpd:2.4-alpine` | Static file serving — one container per subdomain |
| logs-server | `node:22-alpine` | WebSocket log streamer; tails nginx logs and SSH session files |
| change-server | `node:22-alpine` | Serves live git commit history |
| mail-server | `node:22-alpine` | SMTP receiver on port 25, webmail reader UI |
| ssh-server | `python:3.12-alpine` + paramiko | SSH honeypot on port 22, records sessions to `ssh-logs/` |
| systemd | `ximg-web.service` | Manages the entire Docker Compose stack on boot |

## Shared Nav

`shared-html/nav.js` — shared navigation bar (IIFE) volume-mounted read-only into every Apache container at `/shared/`. Load it as the **last script before `</body>`** — it calls `document.body.prepend()` and silently fails if the body doesn't exist yet.

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

Certificates issued via [Certbot](https://certbot.eff.org/) HTTP-01 webroot challenge. Each subdomain has its own individual cert. Certs are stored at `/etc/letsencrypt/live/<subdomain>.ximg.app/`, mounted read-only into nginx. Auto-renewed by the certbot systemd timer; a deploy hook reloads nginx on renewal. TLS 1.2/1.3 only, HSTS enforced (`max-age=63072000`).

```bash
# Issue a new cert for a subdomain
certbot certonly --webroot -d newsubdomain.ximg.app -w /root/ximg-web/public-html --non-interactive

certbot renew --dry-run   # test renewal
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
3. **`compose.yaml`** — add a new `httpd:2.4-alpine` service
4. **`nginx/nginx.conf`** — add the subdomain to the HTTP redirect `server_name` list and add a new HTTPS `server {}` block
5. **SSL cert** — `certbot certonly --webroot -d newsubdomain.ximg.app -w /root/ximg-web/public-html --non-interactive`; reference the new cert in the nginx server block
6. **`shared-html/nav.js`** — add nav entry
7. **`public-html/index.html`** — add landing page card
8. **`apps-html/index.html`** — add a row to the `APPS` array
9. **`logs-server/server.js`** — add subdomain to the tab list
10. **Nagios** — add a `define host {}` entry in `nagios-server/ximg-hosts.cfg` and add the subdomain to the `members` list
11. **`README.md`** — add a row to the Live Sites table
12. **`install/setup.sh`** — add the subdomain to the `DOMAINS` array
13. **DNS** — add an A record → `172.238.205.61` before running certbot
