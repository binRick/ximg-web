FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
COPY page.html .
COPY favicon.svg .
EXPOSE 25 3001
CMD ["node", "server.js"]
