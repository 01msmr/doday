# Multi-Stage-Build: erst bauen, dann nur das Nötigste ins Laufzeit-Image.

# ---- Stufe 1: Frontend bauen ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stufe 2: Laufzeit (Backend + gebautes Frontend) ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY server ./server
# Das Backend importiert Module aus src/ (z. B. tagService) – ohne diese Zeile
# crasht der Container beim Start mit ERR_MODULE_NOT_FOUND.
COPY src ./src

EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
