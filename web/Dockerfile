FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3301

CMD ["npx", "next", "start", "--hostname", "0.0.0.0", "--port", "3301"]
