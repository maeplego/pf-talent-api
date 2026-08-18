FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src src
COPY tsconfig.json tsconfig.json
ENV NODE_ENV=production
EXPOSE 8090
CMD ["npm", "run", "start"]

