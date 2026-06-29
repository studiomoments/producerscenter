const express = require('express');
const cors = require('cors'); // Инициализируем CORS
const ytdl = require('yt-dlp-exec');
const { spawn } = require('child_process');

const app = express();

// Разрешаем CORS для всех (или укажите конкретный домен вашего PWA)
app.use(cors({
    origin: '*', 
    exposedHeaders: ['X-Video-Title', 'X-File-Ext'] // Важно: разрешаем клиенту читать эти заголовки
}));

app.use(express.static('public'));
app.get('/play', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) return res.status(400).send('URL обязателен');

        const result = await ytdl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificates: true
        });

        const bestAudio = result.formats
            .filter(f => f.vcodec === 'none' && f.acodec && f.url && f.http_headers)
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

        if (!bestAudio) {
            return res.status(404).send('Аудио не найдено');
        }

        res.json({
            streamUrl: bestAudio.url,
            title: result.title,
            ext: bestAudio.ext
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения streamUrl' });
    }
});
app.get('/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) return res.status(400).send('URL обязателен');

        const result = await ytdl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificates: true
        });

        // ИСПРАВЛЕНИЕ: Добавляем, чтобы взять лучший формат, а не весь массив!
        const bestAudio = result.formats
            .filter(f => f.vcodec === 'none')
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

        if (!bestAudio) return res.status(404).send('Аудио-формат не найден');

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Video-Title', encodeURIComponent(result.title));
        res.setHeader('X-File-Ext', bestAudio.ext);

        const streamer = spawn('/usr/local/bin/yt-dlp', [
            '-o', '-',
            '-f', bestAudio.format_id,
            videoUrl
        ]);

        streamer.on('error', (err) => console.error('Ошибка процесса yt-dlp:', err));

        streamer.stdout.pipe(res);
        
        req.on('close', () => {
            streamer.kill();
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) {
            res.status(500).send('Ошибка скачивания');
        }
    }
});

// Эндпоинт для получения прямой ссылки (без скачивания через сервер)
app.get('/get-direct-url', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) return res.status(400).json({ error: 'URL обязателен' });

        // Мгновенно забираем JSON-данные видео
        const result = await ytdl(videoUrl, {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true,
            noCheckCertificates: true
        });

        // Ищем лучший аудиоформат
        const bestAudio = result.formats
            .filter(f => f.vcodec === 'none')
            .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

        if (!bestAudio || !bestAudio.url) {
            return res.status(404).json({ error: 'Прямая ссылка не найдена' });
        }

        // Отправляем клиенту JSON с прямой ссылкой на сервера Google/YouTube
        res.json({
            directUrl: bestAudio.url, // Это и есть прямая ссылка на аудио-файл
            title: result.title,
            ext: bestAudio.ext
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения метаданных' });
    }
});

app.get('/debug', (req, res) => {
    const { execSync } = require('child_process');

    let ytDlpVersion = 'not found';
    let ffmpegVersion = 'not found';
    let ytDlpPath = 'not found';

    try {
        ytDlpVersion = execSync('yt-dlp --version').toString().trim();
    } catch (e) {}

    try {
        ffmpegVersion = execSync('ffmpeg -version').toString().split('\n')[0];
    } catch (e) {}

    try {
        ytDlpPath = execSync('which yt-dlp').toString().trim();
    } catch (e) {}

    res.json({
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        envPath: process.env.PATH,
        ytDlpVersion,
        ytDlpPath,
        ffmpegVersion
    });
});
app.get('/test-ytdlp', (req, res) => {
    const { spawnSync } = require('child_process');

    const result = spawnSync('yt-dlp', ['--version']);

    res.json({
        status: result.status,
        stdout: result.stdout?.toString(),
        stderr: result.stderr?.toString()
    });
});

const PORT = process.env.PORT || 3000;

// '0.0.0.0' обязателен, чтобы Docker-контейнер принимал запросы из сети Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер успешно запущен на порту ${PORT}`);
});
