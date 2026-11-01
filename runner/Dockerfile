FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV API_ANYTHING_HOME=/var/lib/api-anything PORT=8091
EXPOSE 8091
CMD ["node", "server.mjs"]
