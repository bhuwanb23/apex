# Apex app — Expo (React Native + web). Serves the web build on :8081.
FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV EXPO_PUBLIC_API_URL="http://localhost:8000"
ENV CI=1
ENV EXPO_NO_TELEMETRY=1

EXPOSE 8081

# Dev server (web) — hot reload included; open http://localhost:8081
CMD ["npx", "expo", "start", "--web", "--port", "8081"]
