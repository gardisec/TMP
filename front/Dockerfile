# front/Dockerfile

# --- ���� 1: ������ React-���������� ---
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# --- ���� 2: ��������� Nginx ��� ������� ������� ---
FROM nginx:stable-alpine
COPY --from=builder /app/build /usr/share/nginx/html

# --- ��������� ����������� ������������ ---
# ������� ���������� ��� SSL
RUN mkdir -p /etc/nginx/ssl
# �������� ���� � ����������
COPY nginx-selfsigned.key /etc/nginx/ssl/
COPY nginx-selfsigned.crt /etc/nginx/ssl/
# ---------------------------------------------

# �������� ���� ������������ Nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/

# ��������� ���� ��� HTTP
EXPOSE 80

# ��������� ���� ��� HTTPS (����������)
EXPOSE 443

CMD ["nginx", "-g", "daemon off;"]