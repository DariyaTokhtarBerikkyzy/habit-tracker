FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data
VOLUME /data
EXPOSE 3001

CMD ["npm", "start", "-w", "server"]
