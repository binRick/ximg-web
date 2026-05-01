FROM node:22-alpine

RUN apk add --no-cache unzip clamav

WORKDIR /app
COPY package.json .
RUN npm install --ignore-scripts
COPY server.js .
COPY favicon.svg .
EXPOSE 3005
CMD ["node", "server.js"]
