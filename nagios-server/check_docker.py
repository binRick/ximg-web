#!/usr/bin/env python3
"""Nagios check: verify a Docker container is running via the Docker socket."""
import sys
import socket
import json
import urllib.parse


def check_container(name_pattern):
    filters = urllib.parse.quote(json.dumps({'name': [name_pattern]}))
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        s.connect('/var/run/docker.sock')
        req = f'GET /containers/json?filters={filters} HTTP/1.0\r\nHost: localhost\r\n\r\n'
        s.send(req.encode())
        resp = b''
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            resp += chunk
    except PermissionError:
        print('UNKNOWN: cannot access Docker socket (permission denied)')
        sys.exit(3)
    except FileNotFoundError:
        print('UNKNOWN: Docker socket not found at /var/run/docker.sock')
        sys.exit(3)
    finally:
        s.close()

    try:
        body = resp.split(b'\r\n\r\n', 1)[1]
        containers = json.loads(body)
    except Exception as e:
        print(f'UNKNOWN: failed to parse Docker response: {e}')
        sys.exit(3)

    running = [c for c in containers if c.get('State') == 'running']
    if running:
        c = running[0]
        names = ', '.join(n.lstrip('/') for n in c.get('Names', []))
        print(f'OK: {names} running ({c.get("Status", "")})')
        sys.exit(0)
    else:
        print(f'CRITICAL: no running container matching "{name_pattern}"')
        sys.exit(2)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: check_docker.py <container_name_pattern>')
        sys.exit(3)
    check_container(sys.argv[1])
