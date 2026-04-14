FROM python:3.12-alpine
RUN pip install --no-cache-dir flask
WORKDIR /app
COPY server.py .
COPY favicon.svg .
EXPOSE 3004
CMD ["python", "server.py"]
