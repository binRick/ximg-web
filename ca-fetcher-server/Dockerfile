FROM node:22-alpine
WORKDIR /app
COPY server.js .
COPY tls-ca-fetch .
RUN chmod +x tls-ca-fetch
EXPOSE 3003
CMD ["node", "server.js"]
