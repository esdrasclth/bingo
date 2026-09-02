# ═══════════════════════════════════════════════════════════════
#  Bingo PRO — imagen para Dokploy (o cualquier host con Docker)
#
#  Es un servidor con estado: mantiene las partidas en memoria y habla por
#  WebSocket. Está pensado para correr como UNA instancia. Si algún día se
#  escala a varias réplicas hace falta un adaptador de Socket.IO, porque las
#  salas no cruzan procesos por sí solas.
# ═══════════════════════════════════════════════════════════════

# ── Dependencias ──────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Solo los manifiestos: así esta capa se reaprovecha mientras no cambien
COPY package.json package-lock.json ./

RUN npm ci --omit=dev


# ── Imagen final ──────────────────────────────────────────────
FROM node:22-alpine AS runtime

# tini recoge procesos huérfanos y reenvía las señales tal cual, para que el
# apagado ordenado (SIGTERM -> vaciar escrituras pendientes) llegue completo
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Solo lo que el servidor necesita en ejecución
COPY package.json ./
COPY server.js db.js ./
COPY public ./public
COPY views ./views

# El usuario `node` viene en la imagen oficial: no corremos como root
USER node

EXPOSE 3000

# Dokploy y Docker leen este estado para saber si el contenedor está sano
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/api/salud || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
