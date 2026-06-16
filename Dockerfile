FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js .

# Directorio persistente para cotizaciones
RUN mkdir -p /app/quotes

EXPOSE 3000

CMD ["node", "server.js"]
