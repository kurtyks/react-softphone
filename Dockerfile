# syntax=docker/dockerfile:1

# ---- build stage: produce the static web bundle ----------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies against the lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci

# Build the SPA (Expo web, output: "single") into /app/dist.
COPY . .
RUN npx expo export -p web

# ---- serve stage: static hosting via nginx ---------------------------------
FROM nginx:alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
