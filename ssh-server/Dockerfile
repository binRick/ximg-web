FROM python:3.12-alpine

RUN apk add --no-cache bash iptables && \
    adduser -D -h /home/user -s /bin/bash user && \
    pip install --no-cache-dir paramiko

RUN printf 'NAME="Ubuntu"\nVERSION="22.04.3 LTS (Jammy Jellyfish)"\nID=ubuntu\nID_LIKE=debian\nPRETTY_NAME="Ubuntu 22.04.3 LTS"\nVERSION_ID="22.04"\nHOME_URL="https://www.ubuntu.com/"\n' > /etc/os-release && \
    echo 'PS1="${debian_chroot:+($debian_chroot)}\\u@\\h:\\W\\$ "' >> /home/user/.bashrc && \
    chown user:user /home/user/.bashrc

COPY honeypot.py /usr/lib/openssh/session-handler
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/lib/openssh/session-handler

EXPOSE 22
CMD ["/entrypoint.sh"]
