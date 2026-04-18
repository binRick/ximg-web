#!/usr/bin/env python3
"""SSH honeypot — accepts any password, records all sessions to /ssh-logs/."""

import fcntl, os, pty, pwd, select, socket, struct, subprocess, sys, termios, threading, time
import paramiko

TIOCSCTTY = 0x540E  # Linux ioctl to set controlling terminal

# Disguise process name so it doesn't appear suspicious in ps output
sys.argv[0] = 'sshd: listener'

LOG_DIR  = '/ssh-logs'
HOST_KEY = paramiko.RSAKey.generate(2048)

# Track cumulative auth attempts per IP across connections
_auth_attempts = {}
_auth_lock = threading.Lock()


class HoneypotServer(paramiko.ServerInterface):
    def __init__(self, ip):
        self.shell_ready = threading.Event()
        self.pty_w = 80
        self.pty_h = 24
        self.username = ''
        self.password = ''
        self.ip = ip
        self.env = {}

    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED if kind == 'session' \
               else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

    def check_auth_password(self, username, password):
        self.username = username
        self.password = password
        with _auth_lock:
            _auth_attempts[self.ip] = _auth_attempts.get(self.ip, 0) + 1
            count = _auth_attempts[self.ip]
        if count < 10:
            return paramiko.AUTH_FAILED
        return paramiko.AUTH_SUCCESSFUL

    def check_auth_publickey(self, username, key):
        return paramiko.AUTH_FAILED

    def get_allowed_auths(self, username):
        return 'password'

    def check_channel_pty_request(self, ch, term, w, h, pw, ph, modes):
        self.pty_w, self.pty_h = w, h
        return True

    def check_channel_shell_request(self, ch):
        self.shell_ready.set()
        return True

    def check_channel_env_request(self, channel, name, value):
        self.env[name] = value
        return True

    def check_channel_window_change_request(self, ch, w, h, pw, ph):
        self.pty_w, self.pty_h = w, h
        return True


def logfile_path(addr):
    ts  = time.strftime('%Y%m%d-%H%M%S')
    ip  = addr[0].replace(':', '_')
    return os.path.join(LOG_DIR, f'{ts}-{ip}-{os.getpid()}.log')


def handle(sock, addr):
    trans = paramiko.Transport(sock)
    trans.local_version = 'SSH-2.0-OpenSSH_8.9p1'
    trans.add_server_key(HOST_KEY)
    srv = HoneypotServer(addr[0])

    try:
        trans.start_server(server=srv)
    except Exception as e:
        print(f'[honeypot] transport error {addr}: {e}', flush=True)
        trans.close()
        return

    ch = trans.accept(30)
    if ch is None or not srv.shell_ready.wait(10):
        trans.close()
        return

    # Use real client IP passed via SSH env var from web proxy; fall back to socket peer
    real_ip = srv.env.get('X_REAL_IP') or addr[0]

    master, slave = pty.openpty()
    fcntl.ioctl(master, termios.TIOCSWINSZ,
                struct.pack('HHHH', srv.pty_h, srv.pty_w, 0, 0))

    env = {
        'TERM': 'xterm-256color',
        'HOME': '/home/user', 'USER': 'user', 'LOGNAME': 'user',
        'SHELL': '/bin/bash',
        'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    }

    pw = pwd.getpwnam('user')
    uid, gid = pw.pw_uid, pw.pw_gid

    def preexec():
        os.setsid()                          # become session leader
        fcntl.ioctl(0, TIOCSCTTY, 0)        # set controlling terminal (fd 0 = slave pty)
        os.setgroups([gid])                  # clear supplementary groups
        os.setgid(gid)
        os.setuid(uid)

    proc = subprocess.Popen(
        ['/bin/bash', '--login'],
        stdin=slave, stdout=slave, stderr=slave,
        close_fds=True, env=env, cwd='/home/user',
        preexec_fn=preexec,
    )
    os.close(slave)

    logpath = logfile_path((real_ip, addr[1]))
    with open(logpath, 'wb', buffering=0) as log:
        os.chmod(logpath, 0o600)
        os.chown(logpath, 0, 0)
        log.write((
            f"=== SSH Honeypot Session ===\n"
            f"Time:   {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
            f"Client: {real_ip}:{addr[1]}\n"
            f"User:   {srv.username}\n"
            f"Pass:   {srv.password}\n"
            f"{'='*28}\n\n"
        ).encode())

        try:
            while True:
                r, _, _ = select.select([ch, master], [], [], 0.5)

                if not r and proc.poll() is not None:
                    break

                if ch in r:
                    data = ch.recv(4096)
                    if not data:
                        break
                    try:
                        os.write(master, data)
                    except OSError:
                        break

                if master in r:
                    try:
                        data = os.read(master, 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    log.write(data)
                    try:
                        ch.sendall(data)
                    except Exception:
                        break

                if proc.poll() is not None:
                    # drain
                    try:
                        while True:
                            r2, _, _ = select.select([master], [], [], 0.1)
                            if not r2:
                                break
                            data = os.read(master, 4096)
                            if not data:
                                break
                            log.write(data)
                            ch.sendall(data)
                    except OSError:
                        pass
                    break
        finally:
            log.write(b'\n=== Session ended ===\n')

    try:
        proc.terminate()
    except Exception:
        pass
    ch.close()
    trans.close()
    print(f'[honeypot] session closed {real_ip}:{addr[1]}', flush=True)


def main():
    os.makedirs(LOG_DIR, mode=0o700, exist_ok=True)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('0.0.0.0', 22))
    s.listen(50)
    print('[honeypot] listening on :22', flush=True)

    while True:
        try:
            sock, addr = s.accept()
            print(f'[honeypot] connection from {addr[0]}:{addr[1]}', flush=True)
            threading.Thread(target=handle, args=(sock, addr), daemon=True).start()
        except Exception as e:
            print(f'[honeypot] error: {e}', flush=True)


if __name__ == '__main__':
    main()
