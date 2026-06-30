
const PLAYLIST_FILE = 'playlist.json';
let searchResults = [];
let currentPage = 1;

const RESULTS_PER_PAGE = 20;

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
        row.className = "track_items"; 
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
            <img class="cover"
                src="${coverUrl}"
                >

            <p class="track_title">
                ${track.title}
            </p>

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

async function renderSearchResults(items) {

    const playlist =
        await loadPlaylist();

    const div =
        document.getElementById(
            'searchResults'
        );

    div.innerHTML = '';

    items.forEach(track => {

        const added =
            playlist.tracks.some(
                t => t.id === track.id
            );

        const row =
            document.createElement('div');

        row.className =
            'searchItem';

        row.innerHTML = `
            <img class="cover"
                src="${track.thumbnail}">

            <p class="track_title">
                ${track.title}
            </p>

            <button class="addBtn">
                ${added ? '✅' : 'Add'}
            </button>
        `;

        const btn =
            row.querySelector('.addBtn');

        if (added) {

            btn.disabled = true;

        } else {

            btn.onclick = async () => {

                await addTrackToPlaylist(track);

                btn.textContent = '✅';
                btn.disabled = true;
            };
        }

        div.appendChild(row);
    });
}


function renderPagination() {

    const container =
        document.getElementById(
            'pagination'
        );

    container.innerHTML = '';

    const totalPages =
        Math.ceil(
            searchResults.length /
            RESULTS_PER_PAGE
        );
    console.log(totalPages);
    if (totalPages <= 1)
        return;

    const prev =
        document.createElement(
            'button'
        );

    prev.textContent = '←';

    prev.disabled =
        currentPage === 1;

    prev.onclick = () => {

        currentPage--;

        renderSearchResultsPage();
    };

    container.appendChild(
        prev
    );

    const info =
        document.createElement(
            'span'
        );

    info.textContent =
        ` ${currentPage} / ${totalPages} `;

    container.appendChild(
        info
    );

    const next =
        document.createElement(
            'button'
        );

    next.textContent = '→';

    next.disabled =
        currentPage === totalPages;

    next.onclick = () => {

        currentPage++;

        renderSearchResultsPage();
    };

    container.appendChild(
        next
    );
    console.log(totalPages);
}
function renderSearchResultsPage() {

    const start =
        (currentPage - 1) *
        RESULTS_PER_PAGE;

    const end =
        start +
        RESULTS_PER_PAGE;

    const pageItems =
        searchResults.slice(
            start,
            end
        );

    renderSearchResults(
        pageItems
    );

    renderPagination();
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
        row.className = "track_items"; 
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
                    <img class="cover"
                        src="${coverUrl}"
                      >

                    <p class="track_title">
                    ${track.title}
                    </p>

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
        'https://producerscenter.onrender.com';

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



const SEARCH_HISTORY_KEY = 'search_history';

function getSearchHistory() {
    return JSON.parse(
        localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'
    );
}

function saveSearchQuery(query) {
    if (!query) return;

    let history = getSearchHistory();

    history = history.filter(
        item => item !== query
    );

    history.unshift(query);

    history = history.slice(0, 20);

    localStorage.setItem(
        SEARCH_HISTORY_KEY,
        JSON.stringify(history)
    );
}

async function searchTracks(q) {
    saveSearchQuery(q);

    const res =
        await fetch(
            `/search?q=${encodeURIComponent(q)}`
        );

    searchResults =
        await res.json();

    currentPage = 1;

    renderSearchResultsPage();
}


function renderSearchDropdown(query = '') {

    const dropdown =
        document.getElementById(
            'searchDropdown'
        );

    const history =
        getSearchHistory();

    const items =
        history.filter(item =>
            item
                .toLowerCase()
                .includes(
                    query.toLowerCase()
                )
        );

    dropdown.innerHTML = '';

    items.forEach(text => {

        const row =
            document.createElement('div');

        row.textContent = text;

        row.onclick = () => {

            document.getElementById(
                'searchInput'
            ).value = text;

            searchTracks(text);

            dropdown.innerHTML = '';
        };

        dropdown.appendChild(row);
    });
}
