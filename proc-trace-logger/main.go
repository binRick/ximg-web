// proc-trace-logger — reads proc-trace-dns JSON output from stdin and writes
// events to a SQLite database for historical querying and stats.
//
// Usage:
//
//	sudo proc-trace-dns -j -t | proc-trace-logger [flags]
package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	_ "modernc.org/sqlite"
)

var version = "dev"

const defaultDBPath = "/var/lib/proc-trace/dns.db"

// schema creates the dns_events table and indexes if they don't exist.
const schema = `
CREATE TABLE IF NOT EXISTS dns_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    pid        INTEGER NOT NULL,
    name       TEXT    NOT NULL,
    type       TEXT    NOT NULL,
    query      TEXT    NOT NULL,
    answers    TEXT    NOT NULL,
    rcode      TEXT    NOT NULL,
    latency_ms REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dns_ts    ON dns_events(ts);
CREATE INDEX IF NOT EXISTS idx_dns_query ON dns_events(query);
CREATE INDEX IF NOT EXISTS idx_dns_name  ON dns_events(name);
CREATE INDEX IF NOT EXISTS idx_dns_rcode ON dns_events(rcode);
`

// dnsEvent matches the JSON emitted by proc-trace-dns -j [-t].
type dnsEvent struct {
	PID       int      `json:"pid"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	Query     string   `json:"query"`
	Answers   []string `json:"answers"`
	RCode     string   `json:"rcode"`
	LatencyMs float64  `json:"latency_ms"`
	TS        string   `json:"ts"` // RFC3339Nano; only present when proc-trace-dns ran with -t
}

type row struct {
	ts        int64
	pid       int64
	name      string
	typ       string
	query     string
	answers   string // JSON-encoded array
	rcode     string
	latencyMs float64
}

func main() {
	dbPath  := flag.String("db", defaultDBPath, "path to SQLite database file")
	batchN  := flag.Int("batch", 50, "number of rows per INSERT transaction")
	flushMs := flag.Int("flush-ms", 500, "max milliseconds to hold a partial batch before flushing")
	quiet   := flag.Bool("q", false, "suppress progress output")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "proc-trace-logger v%s\n\n", version)
		fmt.Fprintf(os.Stderr, "Reads proc-trace-dns -j -t output from stdin and writes to SQLite.\n\n")
		fmt.Fprintf(os.Stderr, "Usage:\n  sudo proc-trace-dns -j -t | proc-trace-logger [flags]\n\n")
		fmt.Fprintf(os.Stderr, "Flags:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExample:\n")
		fmt.Fprintf(os.Stderr, "  sudo proc-trace-dns -j -t | proc-trace-logger --db /var/lib/proc-trace/dns.db\n\n")
	}
	flag.Parse()

	if err := os.MkdirAll(filepath.Dir(*dbPath), 0755); err != nil {
		die("mkdir %s: %v", filepath.Dir(*dbPath), err)
	}

	db, err := sql.Open("sqlite", *dbPath)
	if err != nil {
		die("open db %s: %v", *dbPath, err)
	}
	defer db.Close()

	// Single writer — no need for connection pool.
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		die("set WAL mode: %v", err)
	}
	db.Exec(`PRAGMA busy_timeout=5000`)
	db.Exec(`PRAGMA synchronous=NORMAL`)
	db.Exec(`PRAGMA cache_size=-8000`) // 8 MB page cache

	if _, err := db.Exec(schema); err != nil {
		die("create schema: %v", err)
	}

	if !*quiet {
		fmt.Fprintf(os.Stderr, "proc-trace-logger v%s — writing to %s\n", version, *dbPath)
	}

	var pending []row
	total := 0

	flush := func() {
		if len(pending) == 0 {
			return
		}
		tx, err := db.Begin()
		if err != nil {
			fmt.Fprintf(os.Stderr, "begin tx: %v\n", err)
			return
		}
		stmt, err := tx.Prepare(
			`INSERT INTO dns_events (ts,pid,name,type,query,answers,rcode,latency_ms) VALUES (?,?,?,?,?,?,?,?)`)
		if err != nil {
			tx.Rollback()
			fmt.Fprintf(os.Stderr, "prepare stmt: %v\n", err)
			return
		}
		for _, r := range pending {
			if _, err := stmt.Exec(r.ts, r.pid, r.name, r.typ, r.query, r.answers, r.rcode, r.latencyMs); err != nil {
				fmt.Fprintf(os.Stderr, "insert: %v\n", err)
			}
		}
		stmt.Close()
		if err := tx.Commit(); err != nil {
			fmt.Fprintf(os.Stderr, "commit: %v\n", err)
		}
		total += len(pending)
		pending = pending[:0]
	}

	// Flush on SIGINT/SIGTERM.
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigs
		flush()
		if !*quiet {
			fmt.Fprintf(os.Stderr, "\nproc-trace-logger: flushed — %d events written to %s\n", total, *dbPath)
		}
		os.Exit(0)
	}()

	ticker := time.NewTicker(time.Duration(*flushMs) * time.Millisecond)
	defer ticker.Stop()

	lines := make(chan string, 512)
	go func() {
		sc := bufio.NewScanner(os.Stdin)
		sc.Buffer(make([]byte, 1<<20), 1<<20)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()

	for {
		select {
		case line, ok := <-lines:
			if !ok {
				// stdin closed — flush and exit.
				flush()
				if !*quiet {
					fmt.Fprintf(os.Stderr, "proc-trace-logger: stdin closed — %d events written to %s\n", total, *dbPath)
				}
				return
			}
			line = strings.TrimSpace(line)
			if line == "" || line[0] != '{' {
				continue
			}
			var ev dnsEvent
			if err := json.Unmarshal([]byte(line), &ev); err != nil {
				fmt.Fprintf(os.Stderr, "parse error: %v — skipping: %.80s\n", err, line)
				continue
			}
			var ts int64
			if ev.TS != "" {
				if t, err := time.Parse(time.RFC3339Nano, ev.TS); err == nil {
					ts = t.UnixMilli()
				}
			}
			if ts == 0 {
				ts = time.Now().UnixMilli()
			}
			answersJSON, _ := json.Marshal(ev.Answers)
			pending = append(pending, row{
				ts:        ts,
				pid:       int64(ev.PID),
				name:      ev.Name,
				typ:       ev.Type,
				query:     ev.Query,
				answers:   string(answersJSON),
				rcode:     ev.RCode,
				latencyMs: ev.LatencyMs,
			})
			if len(pending) >= *batchN {
				flush()
			}

		case <-ticker.C:
			flush()
		}
	}
}

func die(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "proc-trace-logger: "+format+"\n", args...)
	os.Exit(1)
}
