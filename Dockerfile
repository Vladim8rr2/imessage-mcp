FROM node:22-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/node_modules node_modules/
COPY package.json ./
COPY dist/ dist/
COPY bin/ bin/
ENV IMESSAGE_DB=/data/chat.db
EXPOSE 3000
ENTRYPOINT ["node", "bin/imessage-mcp.js", "--transport", "http", "--host", "0.0.0.0", "--port", "3000"]
