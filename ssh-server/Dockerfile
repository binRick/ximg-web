FROM python:3.12-alpine

RUN apk add --no-cache bash iptables && \
    adduser -D -h /home/user -s /bin/bash user && \
    pip install --no-cache-dir paramiko

RUN echo 'Welcome to the server.' > /etc/motd && \
    echo 'PS1="[\u@\h \W]\\$ "' >> /home/user/.bashrc && \
    chown user:user /home/user/.bashrc

COPY honeypot.py /honeypot.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
CMD ["/entrypoint.sh"]
