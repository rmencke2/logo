// ================================
//  Logo Generator Server
// ================================

// --- Imports ---
const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const TextToSVG = require('text-to-svg');
const { body, validationResult } = require('express-validator');
const session = require('express-session');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { getDatabase } = require('./database');
const { initializeAuth, requireAuth, requireVerified } = require('./auth');
const { abuseProtectionMiddleware, logUsage } = require('./abuseProtection');
const authRoutes = require('./routes/auth');

require('dotenv').config();

const app = express();

// Trust proxy - required when behind Nginx to detect HTTPS correctly
// This ensures secure cookies are set properly
app.set('trust proxy', true);

// Security middleware
const helmet = require('helmet');
// Use Helmet to disable CSP (including upgrade-insecure-requests), COOP and Origin-Agent-Cluster for HTTP origin
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false
  })
);
const rateLimit = require('express-rate-limit');

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const PORT = process.env.PORT || 4000;

// Initialize database
let db;
(async () => {
  db = await getDatabase();
  console.log('✅ Database initialized');
})();

// Session configuration
const sessionConfig = {
  name: 'connect.sid', // Explicit cookie name
  secret: process.env.SESSION_SECRET || (() => {
    console.warn('⚠️  WARNING: Using default SESSION_SECRET. Set SESSION_SECRET in .env for production!');
    return 'your-secret-key-change-in-production';
  })(),
  resave: true, // Save session even if not modified (helps with OAuth redirects)
  saveUninitialized: true, // Create session even if not modified (needed for OAuth)
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax', // Use 'lax' instead of 'strict' to allow OAuth redirects to work
    path: '/', // Ensure cookie is available for all paths
    // Don't set domain - let browser handle it automatically
  },
  // Use SQLite store for sessions (simple file-based store for development)
  // In production, consider using Redis or a proper session store
  store: new (require('express-session').MemoryStore)(),
};

app.use(session(sessionConfig));

// Initialize authentication
(async () => {
  await initializeAuth(app, session);
  console.log('✅ Authentication initialized');
})();

// Structured JSON logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
    };
    console.log(JSON.stringify(logEntry));
  });
  next();
});

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration (if needed for OAuth callbacks)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', 'true');
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',');
    const origin = req.headers.origin;
    if (origins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  }
  next();
});

// Authentication routes
app.use('/auth', authRoutes);

// --- Routes ---

// Explicitly serve app.js FIRST to ensure it's accessible (before static middleware)
app.get('/app.js', (req, res) => {
  const appJsPath = path.join(__dirname, 'public', 'app.js');
  console.log(`📦 Serving app.js from: ${appJsPath}`);
  if (fs.existsSync(appJsPath)) {
    res.type('application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(appJsPath, (err) => {
      if (err) {
        console.error(`❌ Error serving app.js: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).send('Error serving app.js');
        }
      } else {
        console.log(`✅ Successfully served app.js`);
      }
    });
  } else {
    console.error(`❌ app.js not found at: ${appJsPath}`);
    res.status(404).send('app.js not found');
  }
});

// Serve favicon requests (static middleware will also handle /favicon.svg)
app.get('/favicon.ico', (req, res) => {
  // Redirect to SVG favicon or return 204
  const svgFavicon = path.join(__dirname, 'public', 'favicon.svg');
  if (fs.existsSync(svgFavicon)) {
    res.redirect('/favicon.svg');
  } else {
    res.status(204).end(); // No content if favicon doesn't exist
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  index: false, // Don't serve index.html automatically, we have a route for it
}));

// Serve generated images
app.use(
  '/generated_img',
  express.static(path.join(__dirname, 'generated_img'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
  }),
);

// --- Ensure output folder exists ---
const outputDir = path.join(__dirname, 'generated_img');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// --- Ensure video conversion folder exists ---
const videoOutputDir = path.join(__dirname, 'generated_video');
if (!fs.existsSync(videoOutputDir)) fs.mkdirSync(videoOutputDir, { recursive: true });

// --- Configure multer for file uploads ---
const upload = multer({
  dest: videoOutputDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept AVI files
    if (file.mimetype === 'video/x-msvideo' || file.originalname.toLowerCase().endsWith('.avi')) {
      cb(null, true);
    } else {
      cb(new Error('Only AVI files are allowed'), false);
    }
  },
});

// --- Configure multer for video to GIF conversion (accepts multiple video formats) ---
const uploadVideo = multer({
  dest: videoOutputDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept common video formats and GIFs
    const videoMimeTypes = [
      'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv',
      'video/webm', 'video/x-matroska', 'video/3gpp', 'video/x-flv',
      'image/gif' // Also accept GIFs for meme generation
    ];
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.webm', '.mkv', '.3gp', '.flv', '.gif'];
    const hasValidMimeType = videoMimeTypes.includes(file.mimetype);
    const hasValidExtension = videoExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (hasValidMimeType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only video files and GIFs are allowed (MP4, AVI, MOV, WebM, GIF, etc.)'), false);
    }
  },
});

// --- Font category mapping ---
const fontCategories = {
  modern: {
    regular: 'Montserrat/static/Montserrat-Regular.ttf',
    bold: 'Montserrat/static/Montserrat-Bold.ttf',
  },
  serif: {
    regular: 'Roboto/static/Roboto-Regular.ttf',
    bold: 'Roboto/static/Roboto-Bold.ttf',
  },
  handwritten: {
    regular: 'Caveat/static/Caveat-Regular.ttf',
    bold: 'Caveat/static/Caveat-Bold.ttf',
  },
  bold: {
    regular: 'Montserrat/static/Montserrat-Bold.ttf',
    bold: 'Montserrat/static/Montserrat-ExtraBold.ttf',
  },
  elegant: {
    regular: 'Poppins/Poppins-Regular.ttf',
    bold: 'Poppins/Poppins-Medium.ttf',
  },
  retro: {
    regular: 'Bitcount_Prop_Single/static/BitcountPropSingle-Regular.ttf',
    bold: 'Bitcount_Prop_Single/static/BitcountPropSingle-Bold.ttf',
  },
};

// --- Style mapping (for default behavior) ---
const styles = {
  modern: {
    fontCategory: 'modern',
    defaultColor: '#2e7d32',
  },
  playful: {
    fontCategory: 'handwritten',
    defaultColor: '#f57c00',
  },
  minimal: {
    fontCategory: 'modern',
    defaultColor: '#212121',
  },
  digital: {
    fontCategory: 'retro',
    defaultColor: '#212121',
  },
  handwritten: {
    fontCategory: 'handwritten',
    defaultColor: '#5d4037',
  },
  vintage: {
    fontCategory: 'serif',
    defaultColor: '#8B4513',
  },
  luxury: {
    fontCategory: 'elegant',
    defaultColor: '#1a1a1a',
  },
  tech: {
    fontCategory: 'modern',
    defaultColor: '#0066cc',
  },
  organic: {
    fontCategory: 'handwritten',
    defaultColor: '#4a7c59',
  },
  corporate: {
    fontCategory: 'modern',
    defaultColor: '#1a1a1a',
  },
};

// Serve index.html
app.get('/', (req, res) => {
  console.log('🌐 Serving index.html');
  // Disable caching for index.html in development
  if (process.env.NODE_ENV !== 'production') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve terms and conditions page
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// Serve privacy policy page
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// Serve cookie policy page
app.get('/cookie', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cookie.html'));
});

// Serve video converter page
app.get('/video-converter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'video-converter.html'));
});

// Serve video to GIF converter page
app.get('/video-to-gif', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'video-to-gif.html'));
});

// Extract video metadata (protected with abuse protection and authentication)
app.post(
  '/extract-video-metadata',
  requireAuth,
  abuseProtectionMiddleware,
  uploadVideo.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;

    console.log(`📊 Extracting Video Metadata:
   ➡ Input: ${inputPath}
   ➡ File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    try {
      // Extract metadata using FFprobe
      const metadata = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) {
            reject(err);
          } else {
            resolve(metadata);
          }
        });
      });

      // Clean up input file
      try {
        fs.unlinkSync(inputPath);
        console.log('🗑️  Cleaned up input file');
      } catch (cleanupErr) {
        console.warn('⚠️  Could not delete input file:', cleanupErr);
      }

      // Format metadata for display
      const format = metadata.format || {};
      const videoStream = metadata.streams?.find(s => s.codec_type === 'video') || {};
      const audioStream = metadata.streams?.find(s => s.codec_type === 'audio') || {};

      const formattedMetadata = {
        // File info
        filename: req.file.originalname,
        fileSize: format.size ? `${(format.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
        duration: format.duration ? `${parseFloat(format.duration).toFixed(2)} seconds` : 'Unknown',
        bitrate: format.bit_rate ? `${(parseInt(format.bit_rate) / 1000).toFixed(0)} kbps` : 'Unknown',
        format: format.format_name || 'Unknown',
        formatLong: format.format_long_name || 'Unknown',
        
        // Video stream info
        videoCodec: videoStream.codec_name || 'Unknown',
        videoCodecLong: videoStream.codec_long_name || 'Unknown',
        videoResolution: videoStream.width && videoStream.height 
          ? `${videoStream.width}x${videoStream.height}` 
          : 'Unknown',
        videoAspectRatio: videoStream.display_aspect_ratio || videoStream.sample_aspect_ratio || 'Unknown',
        videoFrameRate: videoStream.r_frame_rate || videoStream.avg_frame_rate || 'Unknown',
        videoBitrate: videoStream.bit_rate ? `${(parseInt(videoStream.bit_rate) / 1000).toFixed(0)} kbps` : 'Unknown',
        videoPixelFormat: videoStream.pix_fmt || 'Unknown',
        
        // Audio stream info
        audioCodec: audioStream.codec_name || 'None',
        audioCodecLong: audioStream.codec_long_name || 'None',
        audioSampleRate: audioStream.sample_rate ? `${audioStream.sample_rate} Hz` : 'None',
        audioChannels: audioStream.channels || audioStream.channel_layout || 'None',
        audioBitrate: audioStream.bit_rate ? `${(parseInt(audioStream.bit_rate) / 1000).toFixed(0)} kbps` : 'None',
        audioChannelLayout: audioStream.channel_layout || 'None',
        
        // Raw metadata (for advanced users)
        raw: {
          format: format,
          streams: metadata.streams || [],
        },
      };

      // Log usage
      await logUsage(req, '/extract-video-metadata');

      // Return formatted metadata
      res.json({
        metadata: formattedMetadata,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error extracting metadata:', err);
      
      // Clean up file on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      } catch (cleanupErr) {
        console.warn('⚠️  Error during cleanup:', cleanupErr);
      }

      res.status(500).json({ 
        error: 'Metadata extraction failed', 
        details: err.message 
      });
    }
  },
);

// Serve video metadata extractor page
app.get('/video-metadata', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'video-metadata.html'));
});

// Convert video/GIF to meme (protected with abuse protection and authentication)
app.post(
  '/convert-to-meme',
  requireAuth,
  abuseProtectionMiddleware,
  uploadVideo.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { memeStyle, topText, bottomText, zoomSpeed, speedMultiplier, freezeDuration } = req.body;
    
    if (!memeStyle) {
      return res.status(400).json({ error: 'Meme style is required' });
    }

    const inputPath = req.file.path;
    const outputFileName = `meme-${req.file.filename}-${Date.now()}.gif`;
    const outputPath = path.join(videoOutputDir, outputFileName);

    console.log(`🎭 Converting to Meme:
   ➡ Input: ${inputPath}
   ➡ Output: ${outputPath}
   ➡ Style: ${memeStyle}
   ➡ File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    try {
      let ffmpegCommand = ffmpeg(inputPath);
      const filters = [];

      switch (memeStyle) {
        case 'text':
          // Add top and bottom text
          if (topText) {
            filters.push(`drawtext=text='${topText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=20:borderw=3:bordercolor=black`);
          }
          if (bottomText) {
            filters.push(`drawtext=text='${bottomText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-th-20:borderw=3:bordercolor=black`);
          }
          break;

        case 'zoom':
          // Zoom reaction effect
          const zoomAmount = parseFloat(zoomSpeed) || 1.5;
          filters.push(`zoompan=z='min(zoom+0.0015,${zoomAmount})':s=500x500:d=250`);
          break;

        case 'mirror':
          // Mirror/double-mirror effect
          filters.push('hflip,split[left][right];[left][right]hstack');
          break;

        case 'glitch':
          // AI-style glitch effects
          filters.push('tblend=all_mode=lighten,hue=s=2,eq=contrast=1.5');
          break;

        case 'pixelate':
          // Retro pixelate effect
          filters.push('scale=80:-1:flags=neighbor,scale=400:-1:flags=neighbor');
          break;

        case 'rewind':
          // Reverse video
          filters.push('reverse');
          ffmpegCommand = ffmpegCommand.audioFilters('areverse');
          break;

        case 'speed':
          // Speed up or slow down
          const speed = parseFloat(speedMultiplier) || 1.0;
          if (speed > 1) {
            filters.push(`setpts=${1/speed}*PTS`);
            ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed}`);
          } else if (speed < 1) {
            filters.push(`setpts=${1/speed}*PTS`);
            // For slow motion, we need to duplicate audio frames
            ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed}`);
          }
          break;

        case 'freeze':
          // Freeze frame effect
          const freeze = parseFloat(freezeDuration) || 2.0;
          filters.push(`tpad=stop_mode=clone:stop_duration=${freeze}`);
          break;

        case 'cinematic':
          // Cinematic black bars
          filters.push('drawbox=0:0:iw:60:black@0.8:t=max,drawbox=0:ih-60:iw:60:black@0.8:t=max');
          break;

        case 'outline':
          // Sticker-style border outline
          filters.push('edgedetect=mode=colormix');
          break;

        case 'text_zoom':
          // Combined: text + zoom
          if (topText) {
            filters.push(`drawtext=text='${topText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=20:borderw=3:bordercolor=black`);
          }
          if (bottomText) {
            filters.push(`drawtext=text='${bottomText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-th-20:borderw=3:bordercolor=black`);
          }
          const zoom = parseFloat(zoomSpeed) || 1.5;
          filters.push(`zoompan=z='min(zoom+0.0015,${zoom})':s=500x500:d=250`);
          break;

        case 'text_speed':
          // Combined: text + speed
          if (topText) {
            filters.push(`drawtext=text='${topText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=20:borderw=3:bordercolor=black`);
          }
          if (bottomText) {
            filters.push(`drawtext=text='${bottomText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-th-20:borderw=3:bordercolor=black`);
          }
          const speed2 = parseFloat(speedMultiplier) || 1.0;
          if (speed2 !== 1) {
            filters.push(`setpts=${1/speed2}*PTS`);
            ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed2}`);
          }
          break;

        default:
          return res.status(400).json({ error: 'Invalid meme style' });
      }

      // Apply filters
      if (filters.length > 0) {
        ffmpegCommand = ffmpegCommand.videoFilters(filters);
      }

      // Convert to GIF with optimization
      await new Promise((resolve, reject) => {
        ffmpegCommand
          .output(outputPath)
          .outputOptions([
            '-vf', 'fps=10,scale=800:-1:flags=lanczos',
            '-loop', '0',
          ])
          .format('gif')
          .on('start', (commandLine) => {
            console.log('🔄 FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}%`);
          })
          .on('end', () => {
            console.log('✅ Meme conversion completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('❌ FFmpeg error:', err);
            reject(err);
          })
          .run();
      });

      // Clean up input file
      try {
        fs.unlinkSync(inputPath);
        console.log('🗑️  Cleaned up input file');
      } catch (cleanupErr) {
        console.warn('⚠️  Could not delete input file:', cleanupErr);
      }

      // Log usage
      await logUsage(req, '/convert-to-meme');

      // Return download URL
      res.json({
        downloadUrl: `/generated_video/${outputFileName}`,
        filename: outputFileName,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error converting to meme:', err);
      
      // Clean up files on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.warn('⚠️  Error during cleanup:', cleanupErr);
      }

      res.status(500).json({ 
        error: 'Meme conversion failed', 
        details: err.message 
      });
    }
  },
);

// Serve meme generator page
app.get('/meme-generator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'meme-generator.html'));
});

// Health check endpoint for service monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get user location from IP address
app.get('/api/location', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     '8.8.8.8'; // Fallback IP

    // Use a free IP geolocation service
    const geoResponse = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,message,city,regionName,country`);
    const geoData = await geoResponse.json();

    if (geoData.status === 'success') {
      const location = [geoData.city, geoData.regionName, geoData.country]
        .filter(Boolean)
        .join(', ');
      res.json({ location });
    } else {
      res.json({ location: null });
    }
  } catch (err) {
    console.error('Location detection error:', err);
    res.json({ location: null });
  }
});

// Helper function to get font path
function getFontPath(fontCategory, useBold = false) {
  const category = fontCategories[fontCategory] || fontCategories.modern;
  const fontFile = useBold ? category.bold : category.regular;
  return path.join(__dirname, 'fonts', fontFile);
}

// Helper function to generate shape SVG
function generateShape(shape, width, height, bgColor) {
  if (shape === 'none') return '';
  
  const size = Math.max(width, height);
  const padding = 20;
  switch (shape) {
    case 'circle':
      return `<circle cx="${width / 2}" cy="${height / 2}" r="${size / 2 - padding}" fill="${bgColor}" />`;
    case 'square':
      return `<rect x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}" fill="${bgColor}" />`;
    case 'rounded':
      return `<rect x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}" rx="30" fill="${bgColor}" />`;
    default:
      return '';
  }
}

// Generate logo (protected with abuse protection)
app.post(
  '/generate-logo',
  abuseProtectionMiddleware,
  [
    body('name').isString().notEmpty(),
    body('style').optional().isString().isIn(Object.keys(styles)),
    body('fontCategory').optional().isString().isIn(Object.keys(fontCategories)),
    body('fontColor').matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    body('bgColor').matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    body('shape').optional().isString().isIn(['none', 'circle', 'square', 'rounded']),
    body('layout').optional().isString().isIn(['none', 'left', 'top']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const {
        name,
        tagline,
        style = 'minimal',
        fontCategory,
        icon,
        layout = 'none',
        shape = 'none',
        fontColor,
        bgColor,
      } = req.body;

      console.log(`🎯 Incoming Request:
   ➡ Name: ${name}
   ➡ Tagline: ${tagline || '(none)'}
   ➡ Style: ${style}
   ➡ Font Category: ${fontCategory || '(default)'}
   ➡ Icon: ${icon || '(none)'}
   ➡ Layout: ${layout}
   ➡ Shape: ${shape}
   ➡ Font Color: ${fontColor}
   ➡ Background Color: ${bgColor}`);

      // --- Determine font category ---
      let finalFontCategory = fontCategory;
      if (!finalFontCategory) {
        const styleConfig = styles[style.toLowerCase()] || styles.minimal;
        finalFontCategory = styleConfig.fontCategory || 'modern';
      }

      // --- Load font ---
      const fontPath = getFontPath(finalFontCategory, false);
      if (!fs.existsSync(fontPath)) {
        console.error(`❌ Font not found at: ${fontPath}`);
        return res.status(400).json({ error: 'Font not found' });
      }

      console.log(`✅ Font loaded: ${fontPath}`);
      const textToSVG = TextToSVG.loadSync(fontPath);

      // --- Calculate text metrics ---
      const mainTextSize = 120;
      const taglineSize = tagline ? 60 : 0;
      const mainMetrics = textToSVG.getMetrics(name, { fontSize: mainTextSize });
      const taglineMetrics = tagline
        ? textToSVG.getMetrics(tagline, { fontSize: taglineSize })
        : { width: 0, height: 0 };

      // Icon dimensions
      const iconSize = icon ? 80 : 0;
      const iconSpacing = icon && layout !== 'none' ? 20 : 0;

      // Calculate dimensions based on layout
      let width, height, textX, textY, taglineX, taglineY, iconX, iconY;

      if (layout === 'left' && icon) {
        // Icon on left, text on right
        width = Math.max(mainMetrics.width, taglineMetrics.width) + iconSize + iconSpacing + 100;
        height = Math.max(mainMetrics.height + (tagline ? taglineMetrics.height + 20 : 0), iconSize) + 100;
        iconX = 50;
        iconY = height / 2;
        textX = iconSize + iconSpacing + 50;
        textY = height / 2 - (tagline ? taglineMetrics.height / 2 + 10 : 0);
        taglineX = textX;
        taglineY = textY + mainMetrics.height + 20;
      } else if (layout === 'top' && icon) {
        // Icon on top, text below
        width = Math.max(mainMetrics.width, taglineMetrics.width, iconSize) + 100;
        height = mainMetrics.height + (tagline ? taglineMetrics.height + 20 : 0) + iconSize + iconSpacing + 100;
        iconX = width / 2;
        iconY = 50 + iconSize / 2;
        textX = width / 2;
        textY = iconSize + iconSpacing + 50 + mainMetrics.height / 2;
        taglineX = width / 2;
        taglineY = textY + mainMetrics.height / 2 + taglineMetrics.height / 2 + 20;
      } else {
        // No icon or layout = none
        width = Math.max(mainMetrics.width, taglineMetrics.width) + 100;
        height = mainMetrics.height + (tagline ? taglineMetrics.height + 20 : 0) + 100;
        textX = width / 2;
        textY = height / 2 - (tagline ? taglineMetrics.height / 2 + 10 : 0);
        taglineX = width / 2;
        taglineY = textY + mainMetrics.height / 2 + taglineMetrics.height / 2 + 20;
        iconX = 0;
        iconY = 0;
      }

      // Adjust for shape (ensure square dimensions for circle/square shapes)
      if (shape === 'circle' || shape === 'square') {
        const maxDim = Math.max(width, height);
        width = maxDim;
        height = maxDim;
        
        // Re-center all content for circular/square shapes
        if (layout === 'left' && icon) {
          // Icon on left, text on right - keep horizontal layout
          iconY = height / 2;
          textY = height / 2 - (tagline ? taglineMetrics.height / 2 + 10 : 0);
          taglineY = textY + mainMetrics.height + 20;
        } else if (layout === 'top' && icon) {
          // Icon on top, text below - keep vertical layout
          iconX = width / 2;
          iconY = 50 + iconSize / 2;
          textX = width / 2;
          textY = iconSize + iconSpacing + 50 + mainMetrics.height / 2;
          taglineX = width / 2;
          taglineY = textY + mainMetrics.height / 2 + taglineMetrics.height / 2 + 20;
        } else {
          // No icon - center everything
          textX = width / 2;
          textY = height / 2 - (tagline ? taglineMetrics.height / 2 + 10 : 0);
          taglineX = width / 2;
          taglineY = textY + mainMetrics.height / 2 + taglineMetrics.height / 2 + 20;
          iconX = width / 2;
          iconY = height / 2;
        }
      }

      console.log(`📏 Dimensions: width=${width}, height=${height}`);

      // --- Generate text paths ---
      const mainTextPath = textToSVG.getPath(name, {
        x: textX,
        y: textY,
        fontSize: mainTextSize,
        anchor: 'center middle',
        attributes: { fill: fontColor },
      });

      let taglinePath = '';
      if (tagline) {
        taglinePath = textToSVG.getPath(tagline, {
          x: taglineX,
          y: taglineY,
          fontSize: taglineSize,
          anchor: 'center middle',
          attributes: { fill: fontColor, opacity: '0.8' },
        });
      }

      // --- Generate icon (using emoji as text) ---
      let iconPath = '';
      if (icon && layout !== 'none') {
        // For emoji/icons, we'll use a text element in SVG
        iconPath = `<text x="${iconX}" y="${iconY}" font-size="${iconSize}" text-anchor="middle" dominant-baseline="middle" fill="${fontColor}">${icon}</text>`;
      }

      // --- Generate shape background ---
      const shapeSvg = generateShape(shape, width, height, bgColor);

      // --- Build SVG ---
      const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${shapeSvg}
        ${iconPath}
        ${mainTextPath}
        ${taglinePath}
      </svg>
    `;

      // --- Save files ---
      const safeName = `${name.replace(/[^a-zA-Z0-9]/g, '-')}-${style}-${Date.now()}`;
      const svgPathFile = path.join(outputDir, `${safeName}.svg`);
      const pngPathFile = path.join(outputDir, `${safeName}.png`);

      fs.writeFileSync(svgPathFile, svg);
      console.log(`💾 SVG saved: ${svgPathFile}`);

      // Generate PNG - transparent background if no shape
      const svgBuffer = Buffer.from(svg);
      if (shape === 'none') {
        await sharp(svgBuffer).png({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile(pngPathFile);
      } else {
        await sharp(svgBuffer).png().toFile(pngPathFile);
      }
      console.log(`💾 PNG saved: ${pngPathFile}`);

      // Log usage
      await logUsage(req, '/generate-logo');

      // --- Return paths to client ---
      res.json({
        svgPath: `/generated_img/${safeName}.svg`,
        pngPath: `/generated_img/${safeName}.png`,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error generating logo:', err);
      res.status(500).json({ error: 'Logo generation failed', details: err.message });
    }
  },
);

// Generate favicon (protected with abuse protection and authentication)
app.post(
  '/generate-favicon',
  requireAuth,
  abuseProtectionMiddleware,
  [
    body('text').isString().notEmpty().isLength({ min: 1, max: 2 }),
    body('fontCategory').optional().isString().isIn(Object.keys(fontCategories)),
    body('fontColor').matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    body('bgColor').matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    body('shape').optional().isString().isIn(['none', 'circle', 'square', 'rounded']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const {
        text,
        fontCategory = 'modern',
        fontColor,
        bgColor,
        shape = 'square',
      } = req.body;

      console.log(`🎯 Favicon Generation Request:
   ➡ Text: ${text}
   ➡ Font Category: ${fontCategory}
   ➡ Shape: ${shape}
   ➡ Font Color: ${fontColor}
   ➡ Background Color: ${bgColor}`);

      // --- Load font ---
      const fontPath = getFontPath(fontCategory, false);
      if (!fs.existsSync(fontPath)) {
        console.error(`❌ Font not found at: ${fontPath}`);
        return res.status(400).json({ error: 'Font not found' });
      }

      console.log(`✅ Font loaded: ${fontPath}`);
      const textToSVG = TextToSVG.loadSync(fontPath);

      // Favicon sizes (standard sizes)
      const sizes = [
        { size: 16, name: 'favicon-16x16' },
        { size: 32, name: 'favicon-32x32' },
        { size: 48, name: 'favicon-48x48' },
        { size: 180, name: 'apple-touch-icon' },
        { size: 192, name: 'android-chrome-192x192' },
        { size: 512, name: 'android-chrome-512x512' },
      ];

      const safeName = `favicon-${text.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
      const generatedFiles = {};

      // Generate each size
      for (const { size, name } of sizes) {
        const fontSize = Math.floor(size * 0.6); // Text takes 60% of the size
        const metrics = textToSVG.getMetrics(text, { fontSize });
        
        // Center the text
        const textX = size / 2;
        const textY = size / 2;

        // Generate text path
        const textPath = textToSVG.getPath(text, {
          x: textX,
          y: textY,
          fontSize: fontSize,
          anchor: 'center middle',
          attributes: { fill: fontColor },
        });

        // Generate shape background
        const shapeSvg = generateShape(shape, size, size, bgColor);

        // Build SVG
        const svg = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          ${shapeSvg}
          ${textPath}
        </svg>
      `;

        // Save SVG
        const svgPathFile = path.join(outputDir, `${safeName}-${name}.svg`);
        fs.writeFileSync(svgPathFile, svg);
        console.log(`💾 SVG saved: ${svgPathFile}`);

        // Generate PNG
        const svgBuffer = Buffer.from(svg);
        const pngPathFile = path.join(outputDir, `${safeName}-${name}.png`);
        
        if (shape === 'none') {
          await sharp(svgBuffer)
            .resize(size, size)
            .png({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toFile(pngPathFile);
        } else {
          await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(pngPathFile);
        }
        console.log(`💾 PNG saved: ${pngPathFile}`);

        generatedFiles[name] = {
          svg: `/generated_img/${safeName}-${name}.svg`,
          png: `/generated_img/${safeName}-${name}.png`,
        };
      }

      // Log usage
      await logUsage(req, '/generate-favicon');

      // --- Return paths to client ---
      res.json({
        files: generatedFiles,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error generating favicon:', err);
      res.status(500).json({ error: 'Favicon generation failed', details: err.message });
    }
  },
);

// Generate favicon from logo
app.post(
  '/generate-favicon-from-logo',
  requireAuth,
  abuseProtectionMiddleware,
  [
    body('logoPath').isString().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { logoPath } = req.body;

      console.log(`🎯 Favicon from Logo Request: ${logoPath}`);

      // Read the logo file - logoPath should be like /generated_img/filename.png
      const logoFilePath = path.join(__dirname, logoPath.replace(/^\//, ''));
      if (!fs.existsSync(logoFilePath)) {
        console.error(`❌ Logo file not found at: ${logoFilePath}`);
        return res.status(404).json({ error: 'Logo file not found' });
      }

      // Favicon sizes
      const sizes = [
        { size: 16, name: 'favicon-16x16' },
        { size: 32, name: 'favicon-32x32' },
        { size: 48, name: 'favicon-48x48' },
        { size: 180, name: 'apple-touch-icon' },
        { size: 192, name: 'android-chrome-192x192' },
        { size: 512, name: 'android-chrome-512x512' },
      ];

      const safeName = `favicon-from-logo-${Date.now()}`;
      const generatedFiles = {};

      // Generate each size from the logo
      for (const { size, name } of sizes) {
        const pngPathFile = path.join(outputDir, `${safeName}-${name}.png`);
        
        // Resize logo to favicon size
        await sharp(logoFilePath)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toFile(pngPathFile);
        
        console.log(`💾 PNG saved: ${pngPathFile}`);

        // Also create SVG version (simplified - just reference the PNG for now)
        const svgPathFile = path.join(outputDir, `${safeName}-${name}.svg`);
        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
          <image href="/generated_img/${safeName}-${name}.png" width="${size}" height="${size}"/>
        </svg>`;
        fs.writeFileSync(svgPathFile, svg);

        generatedFiles[name] = {
          svg: `/generated_img/${safeName}-${name}.svg`,
          png: `/generated_img/${safeName}-${name}.png`,
        };
      }

      // Log usage
      await logUsage(req, '/generate-favicon-from-logo');

      res.json({
        files: generatedFiles,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error generating favicon from logo:', err);
      res.status(500).json({ error: 'Favicon generation failed', details: err.message });
    }
  },
);

// Convert AVI to MP4 (protected with abuse protection and authentication)
app.post(
  '/convert-avi-to-mp4',
  requireAuth,
  abuseProtectionMiddleware,
  upload.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const outputFileName = `${req.file.filename}-${Date.now()}.mp4`;
    const outputPath = path.join(videoOutputDir, outputFileName);

    console.log(`🎬 Converting AVI to MP4:
   ➡ Input: ${inputPath}
   ➡ Output: ${outputPath}
   ➡ File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    try {
      // Convert using FFmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .format('mp4')
          .on('start', (commandLine) => {
            console.log('🔄 FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}%`);
          })
          .on('end', () => {
            console.log('✅ Conversion completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('❌ FFmpeg error:', err);
            reject(err);
          })
          .run();
      });

      // Clean up input file
      try {
        fs.unlinkSync(inputPath);
        console.log('🗑️  Cleaned up input file');
      } catch (cleanupErr) {
        console.warn('⚠️  Could not delete input file:', cleanupErr);
      }

      // Log usage
      await logUsage(req, '/convert-avi-to-mp4');

      // Return download URL
      res.json({
        downloadUrl: `/generated_video/${outputFileName}`,
        filename: outputFileName,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error converting video:', err);
      
      // Clean up files on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.warn('⚠️  Error during cleanup:', cleanupErr);
      }

      res.status(500).json({ 
        error: 'Video conversion failed', 
        details: err.message 
      });
    }
  },
);

// Convert video to animated GIF (protected with abuse protection and authentication)
app.post(
  '/convert-video-to-gif',
  requireAuth,
  abuseProtectionMiddleware,
  uploadVideo.single('video'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const inputPath = req.file.path;
    const outputFileName = `${req.file.filename}-${Date.now()}.gif`;
    const outputPath = path.join(videoOutputDir, outputFileName);

    console.log(`🎬 Converting Video to GIF:
   ➡ Input: ${inputPath}
   ➡ Output: ${outputPath}
   ➡ File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

    try {
      // Convert using FFmpeg
      // We'll limit the GIF to reasonable dimensions and optimize it
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .outputOptions([
            '-vf', 'fps=10,scale=800:-1:flags=lanczos', // 10 fps, max width 800px, maintain aspect ratio
            '-loop', '0', // Loop forever
          ])
          .format('gif')
          .on('start', (commandLine) => {
            console.log('🔄 FFmpeg command:', commandLine);
          })
          .on('progress', (progress) => {
            console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}%`);
          })
          .on('end', () => {
            console.log('✅ Conversion completed');
            resolve();
          })
          .on('error', (err) => {
            console.error('❌ FFmpeg error:', err);
            reject(err);
          })
          .run();
      });

      // Clean up input file
      try {
        fs.unlinkSync(inputPath);
        console.log('🗑️  Cleaned up input file');
      } catch (cleanupErr) {
        console.warn('⚠️  Could not delete input file:', cleanupErr);
      }

      // Log usage
      await logUsage(req, '/convert-video-to-gif');

      // Return download URL
      res.json({
        downloadUrl: `/generated_video/${outputFileName}`,
        filename: outputFileName,
        usageLimits: req.usageLimits,
      });
    } catch (err) {
      console.error('❌ Error converting video to GIF:', err);
      
      // Clean up files on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.warn('⚠️  Error during cleanup:', cleanupErr);
      }

      res.status(500).json({ 
        error: 'GIF conversion failed', 
        details: err.message 
      });
    }
  },
);

// Serve generated videos
app.use('/generated_video', express.static(videoOutputDir, {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

// Get usage limits endpoint
app.get('/api/usage-limits', requireAuth, async (req, res) => {
  try {
    const { checkUserLimits } = require('./abuseProtection');
    const limits = await checkUserLimits(req.user.id, req.user.subscription_tier);
    res.json(limits);
  } catch (err) {
    console.error('Error getting usage limits:', err);
    res.status(500).json({ error: 'Failed to get usage limits' });
  }
});

// Global error handling middleware
/* eslint-disable-next-line no-unused-vars */
app.use((err, req, res, _next) => {
  console.error(err);
  
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  
  // Handle other errors
  if (err.message) {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- Start server ---
// Note: If using Nginx as reverse proxy, keep Node.js on PORT (4000)
// Nginx will handle HTTPS on ports 80/443 and proxy to this app
// If NOT using Nginx, set USE_DIRECT_HTTPS=true in .env to have Node.js handle HTTPS directly

const USE_DIRECT_HTTPS = process.env.USE_DIRECT_HTTPS === 'true';
const HTTPS_PORT = 443;
const HTTP_PORT = 80;

if (USE_DIRECT_HTTPS && process.env.NODE_ENV === 'production') {
  // Direct HTTPS mode: Node.js handles HTTPS (requires root privileges or setcap)
  const certPath = '/etc/letsencrypt/live/influzer.ai';
  const hasSSL = fs.existsSync(`${certPath}/fullchain.pem`) && fs.existsSync(`${certPath}/privkey.pem`);

  if (hasSSL) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(`${certPath}/privkey.pem`),
        cert: fs.readFileSync(`${certPath}/fullchain.pem`),
      };

      // Create HTTPS server
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`🚀 Logo Generator HTTPS server running on port ${HTTPS_PORT}`);
      });

      // Create HTTP redirect server on port 80 (redirects to HTTPS)
      http.createServer((req, res) => {
        const host = req.headers.host || 'influzer.ai';
        const url = req.url;
        res.writeHead(301, { 
          "Location": `https://${host}${url}`,
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
        });
        res.end();
      }).listen(HTTP_PORT, () => {
        console.log(`🔄 HTTP redirect server running on port ${HTTP_PORT} (redirects to HTTPS)`);
      });
    } catch (err) {
      console.error('❌ Error starting HTTPS server:', err.message);
      console.error('💡 Tip: If you get EACCES error, you need root privileges or use Nginx instead');
      console.error('💡 Falling back to HTTP on port', PORT);
      app.listen(PORT, () => {
        console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
      });
    }
  } else {
    console.warn('⚠️  SSL certificates not found, falling back to HTTP');
    app.listen(PORT, () => {
      console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
    });
  }
} else {
  // Standard mode: Use HTTP on configured PORT (Nginx handles HTTPS)
  app.listen(PORT, () => {
    console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
    if (process.env.NODE_ENV === 'production') {
      console.log('💡 Using Nginx for HTTPS - make sure Nginx is configured to proxy to this port');
    }
  });
}
