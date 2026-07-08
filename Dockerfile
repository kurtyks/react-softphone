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
# The app is served under /app (matches Expo experiments.baseUrl), so the files
# live in an /app subdirectory and nginx serves them with `root`.
COPY --from=build /app/dist /usr/share/nginx/html/app
# Full main config (defines events/http + the /app server), so it replaces nginx.conf
# rather than dropping a conf.d snippet.
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
