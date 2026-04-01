FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src

CMD ["npm", "run", "start"]
