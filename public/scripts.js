
const PLAYLIST_FILE = 'playlist.json';

const audio = document.getElementById(
    'audio'
);
let currentTrack = null;
let playMode = 'all';
async function refreshTrack(track) {

    const media =
        await fetch(
            `/media-info?url=${encodeURIComponent(track.originalUrl)}`
        )
            .then(r => r.json());
    // console.log(media);
    track.streamUrl =
        media.streamUrl;

    track.streamUrlUpdatedAt =
        Date.now();

    const playlist =
        await loadPlaylist();

    const idx =
        playlist.tracks.findIndex(
            t => t.id === track.id
        );

    playlist.tracks[idx] =
        track;

    await savePlaylist(
        playlist
    );

    return track;
}

async function playTrack(track) {
    currentTrack = track;
    const titleDisplay = document.getElementById('title');
    titleDisplay.innerText = track.title;
    try {

        if (
            track.downloaded &&
            track.localFile
        ) {

            const root =
                await navigator.storage
                    .getDirectory();

            const audioDir =
                await root
                    .getDirectoryHandle(
                        'audio'
                    );

            const fileHandle =
                await audioDir
                    .getFileHandle(
                        track.localFile
                    );

            const file =
                await fileHandle.getFile();




            if (
                audio.dataset.blob
            ) {

                URL.revokeObjectURL(
                    audio.dataset.blob
                );
            }

            const blobUrl =
                URL.createObjectURL(
                    file
                );

            audio.dataset.blob =
                blobUrl;

            audio.src =
                blobUrl;

            await audio.play();


            return;
        }

        const MAX_AGE =
            3 * 60 * 60 * 1000;

        if (
            !track.streamUrl ||
            Date.now() -
            track.streamUrlUpdatedAt >
            MAX_AGE
        ) {
            await refreshTrack(
                track
            );
        }

        audio.src =
            track.streamUrl;

        await audio.play();

    } catch (err) {

        console.log(
            'refresh url'
        );

        try {

            await refreshTrack(
                track
            );

            audio.src =
                track.streamUrl;

            await audio.play();

        } catch (e) {

            console.error(
                e
            );
        }
    }
}
audio.addEventListener(
    'ended',
    async () => {

        if (
            playMode ===
            'one'
        ) {

            await playTrack(
                currentTrack
            );

            return;
        }

        await playNextTrack();
    }

);



async function playNextTrack() {

    const playlist =
        await loadPlaylist();

    if (
        !currentTrack
    ) return;

    const index =
        playlist.tracks.findIndex(
            t =>
                t.id ===
                currentTrack.id
        );

    let next;

    if (
        playMode ===
        'shuffle'
    ) {

        next =
            playlist.tracks[
            Math.floor(
                Math.random() *
                playlist.tracks.length
            )
            ];

    } else {

        next =
            playlist.tracks[
            (index + 1) %
            playlist.tracks.length
            ];
    }

    if (next) {

        await playTrack(
            next
        );
    }
}
async function playPrevTrack() {

    const playlist =
        await loadPlaylist();

    if (
        !currentTrack
    ) return;

    const index =
        playlist.tracks.findIndex(
            t =>
                t.id ===
                currentTrack.id
        );

    let prevIndex =
        index - 1;

    if (
        prevIndex < 0
    ) {

        prevIndex =
            playlist.tracks.length - 1;
    }

    await playTrack(
        playlist.tracks[
        prevIndex
        ]
    );
}
document
    .getElementById(
        'nextBtn'
    )
    .onclick =
    playNextTrack;

document
    .getElementById(
        'prevBtn'
    )
    .onclick =
    playPrevTrack;

document
    .getElementById(
        'playMode'
    )
    .onchange = e => {

        playMode =
            e.target.value;
    };

async function loadPlaylist() {

    const root =
        await navigator.storage.getDirectory();

    try {

        const handle =
            await root.getFileHandle(
                PLAYLIST_FILE
            );

        const file =
            await handle.getFile();

        return JSON.parse(
            await file.text()
        );

    } catch {

        return {
            tracks: []
        };
    }
}

async function savePlaylist(data) {

    const root =
        await navigator.storage.getDirectory();

    const handle =
        await root.getFileHandle(
            PLAYLIST_FILE,
            { create: true }
        );

    const writable =
        await handle.createWritable();

    await writable.write(
        JSON.stringify(
            data,
            null,
            2
        )
    );

    await writable.close();
}

async function renderOfflinePlaylist() {

    const playlist =
        await loadPlaylist();

    const tracks =
        playlist.tracks.filter(
            t => t.downloaded
        );

    const info =
        document.getElementById(
            'offlineInfo'
        );

    const div =
        document.getElementById(
            'offlinePlaylist'
        );

    const bytes =
        await getOfflineSize();

    const mb =
        (
            bytes /
            1024 /
            1024
        ).toFixed(2);

    info.innerHTML =
        `Offline tracks: ${tracks.length} Storage: ${mb} MB <br> <hr>`;

    div.innerHTML = '';

    for (const track of tracks) {

        const row =
            document.createElement(
                'div'
            );

        row.style.margin =
            '10px 0';

        let coverUrl = '';

        try {

            coverUrl =
                await getCoverUrl(
                    `${track.id}.jpg`
                );

        } catch {

            coverUrl =
                track.thumbnail;
        }

        row.innerHTML = `
            <img
                src="${coverUrl}"
                style="
                    width:40px;
                    height:40px;
                    object-fit:cover;
                    vertical-align:middle;
                    margin-right:10px;
                ">

            <b>
                ${track.title}
            </b>

            <button class="playBtn">
                ▶
            </button>

            <button class="deleteBtn">
                🗑
            </button>

        `;


        row.querySelector(
            '.playBtn'
        ).onclick =
            () => playTrack(track);

        row.querySelector(
            '.deleteBtn'
        ).onclick =
            async () => {

                await deleteTrackFile(
                    track
                );

                await renderOfflinePlaylist();

                await renderPlaylist();

                await renderOfflinePlaylist();
            };

        div.appendChild(
            row
        );
    }
}
async function getOfflineSize() {

    const playlist =
        await loadPlaylist();

    return playlist.tracks
        .filter(
            t => t.downloaded
        )
        .reduce(
            (sum, t) =>
                sum +
                (t.localFileSize || 0),
            0
        );
}



async function searchTracks(q) {

    const res =
        await fetch(
            `/search?q=${encodeURIComponent(q)}`
        );

    const items =
        await res.json();

    renderSearchSuggestions(
        items
            .slice(0, 50)
            .map(t => t.title)
    );

    renderSearchResults(
        items
    );
}
function renderSearchSuggestions(
    suggestions
) {

    const div =
        document.getElementById(
            'searchSuggestions'
        );

    div.innerHTML = '';

    suggestions.forEach(
        text => {

            const row =
                document.createElement(
                    'div'
                );

            row.textContent =
                text;

            row.onclick =
                () => {

                    document
                        .getElementById(
                            'searchInput'
                        )
                        .value =
                        text;

                    div.innerHTML =
                        '';
                };

            div.appendChild(
                row
            );
        }
    );
}
async function addTrackToPlaylist(track) {

    const playlist =
        await loadPlaylist();

    if (
        playlist.tracks.some(
            t => t.id === track.id
        )
    ) {
        return;
    }

    const coverResponse =
        await fetch(
            track.thumbnail
        );

    const coverBlob =
        await coverResponse.blob();

    const root =
        await navigator.storage
            .getDirectory();

    const coversDir =
        await root.getDirectoryHandle(
            'covers',
            { create: true }
        );

    const coverHandle =
        await coversDir.getFileHandle(
            `${track.id}.jpg`,
            { create: true }
        );

    const writable =
        await coverHandle
            .createWritable();

    await writable.write(
        coverBlob
    );

    await writable.close();

    track.coverFile =
        `covers/${track.id}.jpg`;

    track.downloaded =
        false;

    track.localFile =
        null;

    track.addedAt =
        Date.now();

    playlist.tracks.push(
        track
    );

    await savePlaylist(
        playlist
    );

    await renderPlaylist();
}
function renderSearchResults(
    items
) {

    const div =
        document.getElementById(
            'searchResults'
        );

    div.innerHTML = '';

    items
        .slice(0, 50)
        .forEach(track => {

            const row =
                document.createElement(
                    'div'
                );

            row.className =
                'searchItem';

            row.innerHTML = `
                <img
                    src="${track.thumbnail}"
                    width="50">

                <b>
                    ${track.title}
                </b>

                <button>
                    Add
                </button>
            `;

            row.querySelector(
                'button'
            ).onclick =
                () => addTrackToPlaylist(
                    track
                );

            div.appendChild(
                row
            );
        });
}



async function saveCover(
    track
) {

    const response =
        await fetch(
            track.thumbnail
        );

    const blob =
        await response.blob();

    const root =
        await navigator.storage
            .getDirectory();

    const coversDir =
        await root.getDirectoryHandle(
            'covers',
            { create: true }
        );

    const handle =
        await coversDir.getFileHandle(
            `${track.id}.jpg`,
            { create: true }
        );

    const writable =
        await handle
            .createWritable();

    await writable.write(
        blob
    );

    await writable.close();
}




async function renderPlaylist() {

    const playlist =
        await loadPlaylist();

    const div =
        document.getElementById(
            'playlist'
        );

    div.innerHTML = '';

    for (const track of playlist.tracks) {
        const row =
            document.createElement('div');
        row.style.marginTop = '5px';
        row.style.marginBottom = '5px';

        let coverUrl = '';

        try {

            coverUrl =
                await getCoverUrl(
                    `${track.id}.jpg`
                );

        } catch {

            coverUrl =
                track.thumbnail ||
                '';
        }

        row.innerHTML = `
                    <img
                        src="${coverUrl}"
                        style="
                            width:40px;
                            height:40px;
                            object-fit:cover;
                            margin-right:10px;
                            vertical-align:middle;">

                    <b>${track.title}</b>

                    <button class="playBtn">
                        ▶
                    </button>

                    <button class="downloadBtn">
                        ${track.downloaded
                ? '🗑'
                : '⬇'
            }
                    </button>
                    <button class="removeBtn">
                        ❌
                    </button>
                `;





        row.querySelector(
            '.removeBtn'
        ).onclick =
            async () => {
                const root =
                    await navigator.storage
                        .getDirectory();
                // удалить аудио
                try {
                    const playlist =
                        await loadPlaylist();

                    let nextTrack = null;

                    if (
                        currentTrack &&
                        currentTrack.id === track.id
                    ) {

                        const currentIndex =
                            playlist.tracks.findIndex(
                                t => t.id === track.id
                            );

                        nextTrack =
                            playlist.tracks[
                            currentIndex + 1
                            ] ||
                            playlist.tracks[
                            currentIndex - 1
                            ];

                        audio.pause();

                        audio.removeAttribute(
                            'src'
                        );

                        audio.load();

                        currentTrack = null;
                    }
                    if (
                        track.downloaded &&
                        track.localFile
                    ) {


                        const audioDir =
                            await root.getDirectoryHandle(
                                'audio'
                            );

                        await audioDir.removeEntry(
                            track.localFile
                        );
                    }

                } catch (e) {

                    console.log(
                        'audio delete error',
                        e
                    );
                }

                // удалить обложку
                try {



                    const coversDir =
                        await root.getDirectoryHandle(
                            'covers'
                        );

                    if (track.coverFile) {

                        const fileName =
                            track.coverFile
                                .split('/')
                                .pop();

                        await coversDir.removeEntry(
                            fileName
                        );
                    }

                } catch (e) {

                    console.log(
                        'cover delete error',
                        e
                    );
                }

                // удалить из playlist.json
                const playlist =
                    await loadPlaylist();

                playlist.tracks =
                    playlist.tracks.filter(
                        t => t.id !== track.id
                    );

                await savePlaylist(
                    playlist
                );

                await renderPlaylist();

                await renderOfflinePlaylist();
            };








        row.querySelector(
            '.playBtn'
        ).onclick =
            () => playTrack(track);
        row.querySelector(
            '.downloadBtn'
        ).onclick =
            async () => {

                if (track.downloaded) {

                    await deleteTrackFile(track);

                } else {

                    await downloadTrack(track);

                }

                await renderPlaylist();
                await renderOfflinePlaylist();
            };
        div.appendChild(row);
    }
}




async function downloadTrack(track) {
    const SERVER_URL =
        'http://localhost:3000';

    const res =
        await fetch(
            `${SERVER_URL}/download?url=${encodeURIComponent(
                track.originalUrl
            )}`
        );


    const root =
        await navigator.storage
            .getDirectory();

    const audioDir =
        await root
            .getDirectoryHandle(
                'audio',
                {
                    create: true
                }
            );
    const safeTitle =
        track.title
            .replace(
                /[/\\?%*:|"<>]/g,
                '-'
            )
            .trim();
    const fileName =
        `${track.id}_${safeTitle}.m4a`;

    const fileHandle =
        await audioDir
            .getFileHandle(
                fileName,
                {
                    create: true
                }
            );

    const writable =
        await fileHandle
            .createWritable();

    await res.body.pipeTo(
        writable
    );
    const savedFile =
        await fileHandle.getFile();

    track.localFileSize =
        savedFile.size;
    track.downloaded = true;
    track.localFile = fileName;

    const playlist =
        await loadPlaylist();

    const idx =
        playlist.tracks.findIndex(
            t => t.id === track.id
        );

    playlist.tracks[idx] =
        track;

    await savePlaylist(
        playlist
    );
}
async function deleteTrackFile(track) {

    const root =
        await navigator.storage
            .getDirectory();

    const audioDir =
        await root
            .getDirectoryHandle(
                'audio'
            );

    await audioDir.removeEntry(
        track.localFile
    );

    track.downloaded = false;
    track.localFile = null;

    const playlist =
        await loadPlaylist();

    const idx =
        playlist.tracks.findIndex(
            t => t.id === track.id
        );

    playlist.tracks[idx] =
        track;

    await savePlaylist(
        playlist
    );
}
