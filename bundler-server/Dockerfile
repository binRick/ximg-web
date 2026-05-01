FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# 3.9/3.11-3.13 from deadsnakes; 3.10 is Ubuntu's system python
RUN apt-get update && \
    apt-get install -y software-properties-common curl && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y \
        python3.9-full python3.11-full \
        python3.12-full python3.13-full && \
    curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py && \
    python3.9  -m ensurepip --upgrade && \
    python3.10 /tmp/get-pip.py --force-reinstall && \
    python3.11 -m ensurepip --upgrade && \
    python3.12 -m ensurepip --upgrade && \
    python3.13 -m ensurepip --upgrade && \
    apt-get install -y clamav && \
    python3.12 -m venv /opt/venv && \
    /opt/venv/bin/pip install flask && \
    rm -rf /var/lib/apt/lists/* /tmp/get-pip.py

WORKDIR /app
COPY server.py .
COPY favicon.svg .
EXPOSE 3004
CMD ["/opt/venv/bin/python", "server.py"]
