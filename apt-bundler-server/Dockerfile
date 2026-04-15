FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Flask first (before adding foreign arches which complicate apt-get update)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-venv && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install flask && \
    rm -rf /var/lib/apt/lists/*

# Register foreign architectures — needed at runtime for cross-arch apt downloads
RUN dpkg --add-architecture arm64 && \
    dpkg --add-architecture armhf

WORKDIR /app
COPY server.py .
COPY favicon.svg .
EXPOSE 3006
CMD ["/opt/venv/bin/python", "server.py"]
