FROM node:22-alpine
RUN apk add --no-cache docker-cli gzip
WORKDIR /app
COPY server.js .
COPY page.html .
COPY favicon.png .
COPY logos/ logos/
EXPOSE 3001
CMD ["node", "server.js"]
