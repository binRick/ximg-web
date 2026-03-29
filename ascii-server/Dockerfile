FROM node:20-alpine

# yt-dlp standalone binary
RUN apk add --no-cache curl python3 && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
         -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json .
COPY server.js .

EXPOSE 3001
CMD ["node", "server.js"]
