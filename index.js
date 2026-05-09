const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const morgan = require('morgan');

const app = express();
// Render and other platforms use process.env.PORT
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/video-info', (req, res) => {
    const videoUrl = req.query.url;

    if (!videoUrl) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    const fs = require('fs');
    const cookiesPath = 'cookies.txt';
    const cookiesExist = fs.existsSync(cookiesPath);
    console.log(`[DEBUG] Checking for cookies.txt: ${cookiesExist ? 'FOUND' : 'NOT FOUND'}`);

    // Arguments for yt-dlp using python module for better stability
    // Aggressive arguments for yt-dlp to bypass signature locks
    const args = [
        '-m', 'yt_dlp',
        '-J',
        '--no-playlist',
        '--no-check-certificates',
        '--geo-bypass',
        '--no-cache-dir',
        '--force-ipv4',
        '--extractor-args', 'youtube:player-client=android_vr,web_creator,tvhtml5,web;player-skip=webpage,configs',
        '--user-agent', 'Mozilla/5.0 (Linux; Android 12; Pixel 6 Build/SD1A.210817.036; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.178 Mobile Safari/537.36',
        videoUrl
    ];

    if (cookiesExist) {
        args.splice(args.indexOf('-J'), 0, '--cookies', cookiesPath);
    }

    const child = spawn('python3', args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
        stdout += data;
    });

    child.stderr.on('data', (data) => {
        stderr += data;
    });

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`yt-dlp exited with code ${code}: ${stderr}`);
            return res.status(500).json({
                error: 'Could not fetch media. The platform might be blocking the request.',
                details: stderr.split('\n')[0]
            });
        }

        try {
            const data = JSON.parse(stdout);

            // Extract formats more loosely to find ANYTHING that works
            let formats = (data.formats || [])
                .filter(f => f.url)
                .map(f => ({
                    format_id: f.format_id,
                    quality: f.format_note || f.resolution || f.height + 'p' || 'unknown',
                    extension: f.ext,
                    filesize: f.filesize || f.filesize_approx || null,
                    url: f.url,
                    is_audio_only: f.vcodec === 'none' && f.acodec !== 'none',
                    is_video_only: f.acodec === 'none' && f.vcodec !== 'none'
                }))
                .filter(f => !f.is_video_only);

            // Add original URL if no formats but it's a direct media link (e.g. some FB/IG images)
            if (formats.length === 0 && data.url) {
                formats.push({
                    format_id: 'direct',
                    quality: 'Original',
                    extension: data.ext || 'bin',
                    url: data.url,
                    is_image: true
                });
            }

            // Remove duplicates
            const uniqueFormats = Array.from(new Set(formats.map(f => f.url)))
                .map(url => formats.find(f => f.url === url));

            res.json({
                title: data.title || 'Untitled',
                thumbnail: data.thumbnail,
                platform: data.extractor_key,
                formats: uniqueFormats
            });
        } catch (parseError) {
            console.error(`Parse error: ${parseError}`);
            res.status(500).json({ error: 'Failed to parse media data' });
        }
    });
});

/**
 * Optional endpoint to proxy downloads if direct URLs are restricted
 * (Some platforms might require specific headers)
 */
app.get('/download-proxy', (req, res) => {
    const downloadUrl = req.query.url;
    const filename = req.query.filename || 'video.mp4';

    if (!downloadUrl) {
        return res.status(400).json({ error: 'Download URL is required' });
    }

    // This is a simple proxy. For large files, streaming is better.
    // However, direct download URLs from yt-dlp usually work directly in browser/app
    // unless there's a referrer/cookie check.
    res.redirect(downloadUrl);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
