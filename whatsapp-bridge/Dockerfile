FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY index.js .
RUN mkdir -p /data/wa-auth
EXPOSE 3001
CMD ["node", "index.js"]
