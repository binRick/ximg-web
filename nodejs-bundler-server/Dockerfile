FROM node:22-alpine

WORKDIR /app
COPY package.json .
RUN npm install --ignore-scripts
COPY server.js .
COPY favicon.svg .
EXPOSE 3005
CMD ["node", "server.js"]
