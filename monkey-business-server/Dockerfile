FROM node:22-alpine
# better-sqlite3 ships native bindings — needs build toolchain at install time.
# We install, build, then drop the toolchain in a single layer to keep the image small.
WORKDIR /app
COPY package.json .
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm install --omit=dev --build-from-source \
 && apk del .build-deps
COPY server.js db.js market.js tickers.js monkey-names.js ./
EXPOSE 3015
ENV NODE_ENV=production DB_DIR=/data
VOLUME ["/data"]
CMD ["node", "server.js"]
