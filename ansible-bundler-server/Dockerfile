FROM python:3.12-alpine

RUN apk add --no-cache clamav

RUN pip install --no-cache-dir flask ansible-core

WORKDIR /app
COPY server.py .
COPY favicon.svg .

ENV PYTHONUNBUFFERED=1
EXPOSE 3006
CMD ["python", "-u", "server.py"]
