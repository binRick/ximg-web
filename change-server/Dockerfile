FROM node:22-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
COPY page.html .
COPY favicon.svg .
EXPOSE 3002
CMD ["node", "server.js"]
