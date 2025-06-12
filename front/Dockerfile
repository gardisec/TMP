# front/Dockerfile

# --- ЭТАП 1: Сборка React-приложения ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# --- ЭТАП 2: Настройка Nginx для раздачи статики ---
FROM nginx:stable-alpine
COPY --from=builder /app/build /usr/share/nginx/html

# --- ДОБАВЛЯЕМ КОПИРОВАНИЕ СЕРТИФИКАТОВ ---
# Создаем директорию для SSL
RUN mkdir -p /etc/nginx/ssl
# Копируем ключ и сертификат
COPY nginx-selfsigned.key /etc/nginx/ssl/
COPY nginx-selfsigned.crt /etc/nginx/ssl/
# ---------------------------------------------

# Копируем нашу конфигурацию Nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

# Открываем порт для HTTP
EXPOSE 80

# Открываем порт для HTTPS (ИСПРАВЛЕНО)
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]