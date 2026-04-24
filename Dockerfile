FROM node:20-alpine

RUN addgroup -S bazaar && adduser -S bazaar -G bazaar

WORKDIR /app

COPY --chown=bazaar:bazaar package*.json ./
RUN npm install --omit=dev && chown -R bazaar:bazaar node_modules

COPY --chown=bazaar:bazaar src/ ./src/
COPY --chown=bazaar:bazaar server.js ./

# uploads/, logs/, .env, and Firebase creds are mounted at runtime
RUN mkdir -p uploads logs && chown bazaar:bazaar uploads logs

USER bazaar

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
