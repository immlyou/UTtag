# UTtag backend image
# --------------------------------------------
# Thin production image for Render / Railway / Fly / any Docker host.
# Frontend static files (index.html, tenant.html, js/, style.css) are
# still served by this same Express process — they ship in the image.

FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the app.
COPY . .

# Render / Railway / Fly all set PORT; default to 3030 for local docker run.
ENV NODE_ENV=production
ENV PORT=3030
EXPOSE 3030

# Non-root for safety.
USER node

CMD ["node", "server.js"]
