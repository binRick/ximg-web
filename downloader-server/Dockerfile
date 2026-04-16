FROM node:22-alpine
RUN apk add --no-cache docker-cli gzip
WORKDIR /app
COPY server.js .
COPY page.html .
COPY page-images.html .
COPY page-how.html .
COPY page-history.html .
COPY page-video.html .
COPY page-global.html .
COPY favicon.png .
COPY world.json .
COPY logos/ logos/
EXPOSE 3001
CMD ["node", "server.js"]
