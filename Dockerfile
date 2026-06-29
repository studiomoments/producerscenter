# 1. Используем официальный легковесный образ Node.js на базе Debian
FROM node:20-slim

# 2. Устанавливаем Python 3, pip, ffmpeg и curl
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 3. Скачиваем и устанавливаем последнюю версию yt-dlp напрямую
RUN curl -L https://github.com -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# 4. Создаем рабочую директорию внутри контейнера
WORKDIR /usr/src/app

# 5. Копируем файлы зависимостей Node.js
COPY package*.json ./

# 6. Устанавливаем production-зависимости Node.js (исправленная и современная команда)
RUN npm install --omit=dev

# 7. Копируем все остальные файлы проекта
COPY . .

# 8. Открываем порт для Render
EXPOSE 3000

# 9. Запускаем сервер
CMD ["node", "server.js"]
