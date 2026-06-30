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

        const streamer = spawn('yt-dlp', [
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

const metadataCache = new Map();

async function getVideoInfo(videoUrl) {

    const cached = metadataCache.get(videoUrl);

    if (
        cached &&
        (Date.now() - cached.time < 300000)
    ) {
        return cached.data;
    }

    const result = await ytdl(videoUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCallHome: true,
        noCheckCertificates: true
    });

    metadataCache.set(videoUrl, {
        data: result,
        time: Date.now()
    });

    return result;
}

app.get('/media-info', async (req, res) => {

    try {

        const videoUrl = req.query.url;

        if (!videoUrl) {
            return res.status(400).json({
                error: 'URL обязателен'
            });
        }

        const result =
            await getVideoInfo(videoUrl);

        const bestAudio =
            result.formats
                .filter(f =>
                    f.vcodec === 'none' &&
                    f.acodec &&
                    f.url &&
                    f.http_headers
                )
                .sort((a, b) =>
                    (b.abr || 0) -
                    (a.abr || 0)
                )[0];

        if (!bestAudio) {
            return res.status(404).json({
                error: 'Аудио не найдено'
            });
        }
        const videoId = result.id;

        const thumb =
            `https://i.ytimg.com/vi/${videoId}/default.jpg`;

        res.json({
            id: result.id,
            title: result.title,
            channel: result.channel,
            duration: result.duration,
            file_ext: result.ext,
            bitrate: bestAudio.abr,
            samplerate: bestAudio.asr,
            thumbnail: thumb,

            ext: bestAudio.ext,
            streamUrl: bestAudio.url
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: 'Ошибка получения данных'
        });
    }
});


app.get(
    '/search',
    async (req, res) => {

        const q =
            req.query.q;

        const result =
            await ytdl(
                `ytsearch10:${q}`,
                {
                    dumpSingleJson: true
                }
            );

        const tracks =
            result.entries.map(
                item => ({

                    id: item.id,

                    title:
                        item.title,

                    channel:
                        item.channel,

                    duration:
                        item.duration,

                    thumbnail:
                        `https://i.ytimg.com/vi/${item.id}/default.jpg`,

                    originalUrl:
                        item.webpage_url
                })
            );

        res.json(
            tracks
        );
    }
);

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


const PORT = process.env.PORT || 3000;

// '0.0.0.0' обязателен, чтобы Docker-контейнер принимал запросы из сети Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер успешно запущен на порту ${PORT}`);
});
// app.listen(3000, () => console.log('Сервер запущен: http://localhost:3000'));





