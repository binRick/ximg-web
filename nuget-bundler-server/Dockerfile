FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine

RUN apk add --no-cache python3 py3-pip zip clamav && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install flask

WORKDIR /app
COPY server.py .
COPY favicon.svg .

EXPOSE 3008
CMD ["/opt/venv/bin/python", "server.py"]
