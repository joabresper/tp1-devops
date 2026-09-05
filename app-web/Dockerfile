ARG NODE_VERSION=22

# --- Etapa 1: Base (Instalación de todas las dependencias) ---
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /usr/src/app
COPY package*.json ./
# Instalamos TODO, incluyendo Vite
RUN npm install 
COPY . .

# --- Etapa 2: Entorno Local (Desarrollo) ---
# Esta etapa usa Vite y expone el host para conectarse a Nginx en tu máquina
FROM base AS development
CMD ["npm", "run", "dev", "--", "--host"]

# --- Etapa 3: Compilación (Build) ---
# Aquí Vite transforma tu código React en archivos estáticos (HTML/JS/CSS)
FROM base AS build
RUN npm run build

# --- Etapa 4: Producción ---
# Una imagen limpia y ultraligera que SOLO contiene un servidor web y tus archivos estáticos
FROM nginx:alpine AS production
# Copiamos el resultado de la Etapa 3 a la carpeta pública de Nginx
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
EXPOSE 80
# Arrancamos el servidor web
CMD ["nginx", "-g", "daemon off;"]