FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=8787 TRUST_PROXY=1
EXPOSE 8787
CMD ["node", "dist/index.js"]
