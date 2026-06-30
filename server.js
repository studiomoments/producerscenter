const express = require('express');
const cors = require('cors'); // Инициализируем CORS
const ytdl = require('yt-dlp-exec');
const { spawn } = require('child_process');
const yts = require('yt-search');

// const https = require('https');
// const fs = require('fs');

const app = express();

const allowedOrigins = (
    process.env.ALLOWED_ORIGINS || ''
)
    .split(',')
    .filter(Boolean);

app.use(cors({
    origin: true,
    exposedHeaders: [
        'X-Video-Title',
        'X-File-Ext'
    ]
}));

// app.use(cors({
//     origin(origin, callback) {
//         if (!origin) {
//             return callback(null, true);
//         }

//         if (allowedOrigins.includes(origin)) {
//             return callback(null, true);
//         }

//         callback(new Error('Not allowed by CORS'));
//     },
//     exposedHeaders: ['X-Video-Title', 'X-File-Ext'] // Важно: разрешаем клиенту читать эти заголовки
// }));
// Разрешаем CORS для всех (или укажите конкретный домен вашего PWA)


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
const searchCache = new Map();
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


const { apiLimiter, searchLimiter } = require('./middleware/rateLimit');

app.use(apiLimiter);
app.get('/search', async (req, res) => {
    const q = req.query.q;

    const cached = searchCache.get(q);

    if (
        cached &&
        Date.now() - cached.time < 300000
    ) {
        return res.json(cached.data);
    }

    const result = await yts(q);

    const tracks = result.videos
        .slice(0, 100)
        .map(v => ({
            id: v.videoId,
            title: v.title,
            channel: v.author.name,
            duration: v.seconds,
            thumbnail:
                `https://i.ytimg.com/vi/${v.videoId}/default.jpg`,
            originalUrl: v.url
        }));

    searchCache.set(q, {
        data: tracks,
        time: Date.now()
    });

    res.json(tracks);
});
// app.get('/search', searchLimiter, async (req, res) => {

//     try {

//         const q = req.query.q;

//         // const page = Math.max(
//         //     1,
//         //     Number(req.query.page) || 1
//         // );

//         // const limit = Math.min(
//         //     50,
//         //     Math.max(
//         //         1,
//         //         Number(req.query.limit) || 20
//         //     )
//         // );


//         let result = await ytdl(
//             `ytsearch100:${q}`,
//             {
//                 dumpSingleJson: true
//             }
//         );

//         const entries =
//             result.entries || [];

//         const musicEntries =
//             entries.filter(item =>
//                 item.channel &&
//                 (
//                     item.channel.includes('Topic') ||
//                     item.channel.includes('Music')
//                 )
//             );

//         const finalEntries =
//             musicEntries.length > 0
//                 ? musicEntries
//                 : entries;

//         const tracks =
//             finalEntries.map(item => ({
//                 id: item.id,
//                 title: item.title,
//                 channel: item.channel,
//                 duration: item.duration,
//                 thumbnail:
//                     `https://i.ytimg.com/vi/${item.id}/default.jpg`,
//                 originalUrl:
//                     item.webpage_url
//             }));

//         res.json(tracks);
//         // const start =
//         //     (page - 1) * limit;

//         // const pagedTracks =
//         //     tracks.slice(
//         //         start,
//         //         start + limit
//         //     );

//         // res.json({
//         //     page,
//         //     total: tracks.length,
//         //     totalPages:
//         //         Math.ceil(
//         //             tracks.length / limit
//         //         ),
//         //     items: pagedTracks
//         // });

//     } catch (err) {

//         console.error(err);

//         res.json([]);
//     }
// });


app.get('/debug-mobile', (req, res) => {

    console.log('=== MOBILE DEBUG ===');
    console.log('ip:', req.ip);
    console.log('user-agent:', req.headers['user-agent']);
    console.log('time:', new Date().toISOString());

    res.json({
        ok: true
    });
});

app.post('/debug-add', express.json(), (req, res) => {

    console.log('=== ADD TRACK ===');
    console.log(req.body);

    res.json({
        ok: true
    });
});

app.get('/debug', (req, res) => {
    const { execSync } = require('child_process');

    let ytDlpVersion = 'not found';
    let ffmpegVersion = 'not found';
    let ytDlpPath = 'not found';

    try {
        ytDlpVersion = execSync('yt-dlp --version').toString().trim();
    } catch (e) { }

    try {
        ffmpegVersion = execSync('ffmpeg -version').toString().split('\n')[0];
    } catch (e) { }

    try {
        ytDlpPath = execSync('which yt-dlp').toString().trim();
    } catch (e) { }

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
// https.createServer(
//     {
//         key: fs.readFileSync('key.pem'),
//         cert: fs.readFileSync('cert.pem')
//     },
//     app
// ).listen(PORT, '0.0.0.0', () => {

//     console.log(
//         `HTTPS сервер запущен на порту ${PORT}`
//     );

// });
// '0.0.0.0' обязателен, чтобы Docker-контейнер принимал запросы из сети Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер успешно запущен на порту ${PORT}`);
});
// app.listen(3000, () => console.log('Сервер запущен: http://localhost:3000'));





