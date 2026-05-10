FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3001

CMD ["npx", "next", "dev", "--hostname", "0.0.0.0", "--port", "3001"]
