FROM python:3.12-alpine

RUN apk add --no-cache go git tar clamav

RUN pip install --no-cache-dir flask

WORKDIR /app
COPY server.py .
COPY favicon.svg .

ENV PYTHONUNBUFFERED=1
EXPOSE 3006
CMD ["python", "-u", "server.py"]
