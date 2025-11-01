FROM node:18-alpine

# buat direktori kerja
WORKDIR /app

# pasang lib build tools kalau perlu protobuf native (opsional)
RUN apk add --no-cache python3 make g++

# salin package.json & package-lock (npm ci will use them)
COPY package*.json ./

# install deps
RUN npm ci --production

# salin sisa kode
COPY . .

# expose port (Fly uses the EXPOSE value but runtime sets PORT env)
EXPOSE 8080

# jalankan
CMD ["node", "server.js"]
