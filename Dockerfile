FROM node:20-alpine

RUN addgroup -S bazaar && adduser -S bazaar -G bazaar

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY server.js ./

# uploads/, logs/, .env, and Firebase creds are mounted at runtime
RUN mkdir -p uploads logs && chown -R bazaar:bazaar /app

USER bazaar

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
