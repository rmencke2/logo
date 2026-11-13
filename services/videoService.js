// ================================
//  Video Processing Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { requireAuth, requireVerified } = require('../auth');
const { abuseProtectionMiddleware, logUsage } = require('../abuseProtection');
const { trackService } = require('./analyticsService');
const { clientErrorPayload } = require('../utils/safeError');
const { sanitizeMemeText, finiteInRange } = require('../utils/memeText');

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
let activeVideoJobs = 0;

function reserveVideoJob(req, res, next) {
  if (activeVideoJobs >= 1) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(429).json({ error: 'A video conversion is already running. Try again shortly.' });
  }
  activeVideoJobs += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeVideoJobs -= 1;
  };
  res.on('finish', release);
  res.on('close', release);
  next();
}

function captionFilter(videoOutputDir, text, yExpr, files) {
  const safe = sanitizeMemeText(text);
  if (!safe) return null;
  const filePath = path.join(videoOutputDir, `meme-caption-${Date.now()}-${files.length}.txt`);
  fs.writeFileSync(filePath, safe, { encoding: 'utf8', mode: 0o600 });
  files.push(filePath);
  return `drawtext=textfile=${filePath}:fontcolor=white:fontsize=40:x=(w-text_w)/2:y=${yExpr}:borderw=3:bordercolor=black`;
}

/**
 * Initialize video processing service
 * @param {express.Application} app - Express application instance
 */
function initializeVideoService(app) {
  // Ensure video output folder exists
  const videoOutputDir = path.join(__dirname, '..', 'generated_video');
  if (!fs.existsSync(videoOutputDir)) fs.mkdirSync(videoOutputDir, { recursive: true });

  // Configure multer for AVI files
  const upload = multer({
    dest: videoOutputDir,
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'video/x-msvideo' || file.originalname.toLowerCase().endsWith('.avi')) {
        cb(null, true);
      } else {
        cb(new Error('Only AVI files are allowed'), false);
      }
    },
  });

  // Configure multer for video to GIF/Meme (accepts multiple video formats)
  const uploadVideo = multer({
    dest: videoOutputDir,
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
    },
    fileFilter: (req, file, cb) => {
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

  // Page routes served by staticService (EJS + shared site header)

  // Convert AVI to MP4 endpoint (requires authentication)
  app.post(
    '/convert-avi-to-mp4',
    trackService('avi-to-mp4'),
    requireAuth,
    requireVerified,
    abuseProtectionMiddleware,
    upload.single('video'),
    reserveVideoJob,
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

        await logUsage(req, '/convert-avi-to-mp4');

        res.json({
          downloadUrl: `/generated_video/${outputFileName}`,
          filename: outputFileName,
          usageLimits: req.usageLimits,
        });
      } catch (err) {
        console.error('❌ Error converting video:', err);
        
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
          console.warn('⚠️  Error during cleanup:', cleanupErr);
        }

        res.status(500).json(clientErrorPayload('Video conversion failed', err));
      }
    },
  );

  // Convert video to GIF endpoint
  app.post(
    '/convert-video-to-gif',
    trackService('video-to-gif'),
    requireAuth,
    requireVerified,
    abuseProtectionMiddleware,
    uploadVideo.single('video'),
    reserveVideoJob,
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
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
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
              console.log('✅ Conversion completed');
              resolve();
            })
            .on('error', (err) => {
              console.error('❌ FFmpeg error:', err);
              reject(err);
            })
            .run();
        });

        try {
          fs.unlinkSync(inputPath);
          console.log('🗑️  Cleaned up input file');
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file:', cleanupErr);
        }

        await logUsage(req, '/convert-video-to-gif');

        res.json({
          downloadUrl: `/generated_video/${outputFileName}`,
          filename: outputFileName,
          usageLimits: req.usageLimits,
        });
      } catch (err) {
        console.error('❌ Error converting video to GIF:', err);
        
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
          console.warn('⚠️  Error during cleanup:', cleanupErr);
        }

        res.status(500).json(clientErrorPayload('GIF conversion failed', err));
      }
    },
  );

  // Extract video metadata endpoint (requires authentication)
  app.post(
    '/extract-video-metadata',
    trackService('video-metadata'),
    requireAuth,
    requireVerified,
    abuseProtectionMiddleware,
    uploadVideo.single('video'),
    reserveVideoJob,
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const inputPath = req.file.path;

      console.log(`📊 Extracting Video Metadata:
   ➡ Input: ${inputPath}
   ➡ File size: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`);

      try {
        const metadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
              reject(err);
            } else {
              resolve(metadata);
            }
          });
        });

        try {
          fs.unlinkSync(inputPath);
          console.log('🗑️  Cleaned up input file');
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file:', cleanupErr);
        }

        const format = metadata.format || {};
        const videoStream = metadata.streams?.find(s => s.codec_type === 'video') || {};
        const audioStream = metadata.streams?.find(s => s.codec_type === 'audio') || {};

        const formattedMetadata = {
          filename: req.file.originalname,
          fileSize: format.size ? `${(format.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
          duration: format.duration ? `${parseFloat(format.duration).toFixed(2)} seconds` : 'Unknown',
          bitrate: format.bit_rate ? `${(parseInt(format.bit_rate) / 1000).toFixed(0)} kbps` : 'Unknown',
          format: format.format_name || 'Unknown',
          formatLong: format.format_long_name || 'Unknown',
          videoCodec: videoStream.codec_name || 'Unknown',
          videoCodecLong: videoStream.codec_long_name || 'Unknown',
          videoResolution: videoStream.width && videoStream.height 
            ? `${videoStream.width}x${videoStream.height}` 
            : 'Unknown',
          videoAspectRatio: videoStream.display_aspect_ratio || videoStream.sample_aspect_ratio || 'Unknown',
          videoFrameRate: videoStream.r_frame_rate || videoStream.avg_frame_rate || 'Unknown',
          videoBitrate: videoStream.bit_rate ? `${(parseInt(videoStream.bit_rate) / 1000).toFixed(0)} kbps` : 'Unknown',
          videoPixelFormat: videoStream.pix_fmt || 'Unknown',
          audioCodec: audioStream.codec_name || 'None',
          audioCodecLong: audioStream.codec_long_name || 'None',
          audioSampleRate: audioStream.sample_rate ? `${audioStream.sample_rate} Hz` : 'None',
          audioChannels: audioStream.channels || audioStream.channel_layout || 'None',
          audioBitrate: audioStream.bit_rate ? `${(parseInt(audioStream.bit_rate) / 1000).toFixed(0)} kbps` : 'None',
          audioChannelLayout: audioStream.channel_layout || 'None',
          raw: {
            format: format,
            streams: metadata.streams || [],
          },
        };

        await logUsage(req, '/extract-video-metadata');

        res.json({
          metadata: formattedMetadata,
          usageLimits: req.usageLimits,
        });
      } catch (err) {
        console.error('❌ Error extracting metadata:', err);
        
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (cleanupErr) {
          console.warn('⚠️  Error during cleanup:', cleanupErr);
        }

        res.status(500).json(clientErrorPayload('Metadata extraction failed', err));
      }
    },
  );

  // Convert video/GIF to meme endpoint
  app.post(
    '/convert-to-meme',
    trackService('meme-generator'),
    requireAuth,
    requireVerified,
    abuseProtectionMiddleware,
    uploadVideo.single('video'),
    reserveVideoJob,
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

      const captionFiles = [];
      const cleanupCaptions = () => {
        for (const file of captionFiles) {
          try { fs.unlinkSync(file); } catch { /* caption already gone */ }
        }
      };

      try {
        let ffmpegCommand = ffmpeg(inputPath);
        const filters = [];
        const addCaption = (text, yExpr) => {
          const filter = captionFilter(videoOutputDir, text, yExpr, captionFiles);
          if (filter) filters.push(filter);
        };

        switch (memeStyle) {
          case 'text':
            addCaption(topText, '20');
            addCaption(bottomText, 'h-th-20');
            break;

          case 'zoom':
            const zoomAmount = finiteInRange(zoomSpeed, 1.5, 1, 3);
            filters.push(`zoompan=z='min(zoom+0.0015,${zoomAmount})':s=500x500:d=250`);
            break;

          case 'mirror':
            filters.push('hflip,split[left][right];[left][right]hstack');
            break;

          case 'glitch':
            filters.push('tblend=all_mode=lighten,hue=s=2,eq=contrast=1.5');
            break;

          case 'pixelate':
            filters.push('scale=80:-1:flags=neighbor,scale=400:-1:flags=neighbor');
            break;

          case 'rewind':
            filters.push('reverse');
            ffmpegCommand = ffmpegCommand.audioFilters('areverse');
            break;

          case 'speed':
            const speed = finiteInRange(speedMultiplier, 1, 0.5, 2);
            if (speed !== 1) {
              filters.push(`setpts=${1 / speed}*PTS`);
              ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed}`);
            }
            break;

          case 'freeze':
            const freeze = finiteInRange(freezeDuration, 2, 0, 5);
            filters.push(`tpad=stop_mode=clone:stop_duration=${freeze}`);
            break;

          case 'cinematic':
            filters.push('drawbox=0:0:iw:60:black@0.8:t=max,drawbox=0:ih-60:iw:60:black@0.8:t=max');
            break;

          case 'outline':
            filters.push('edgedetect=mode=colormix');
            break;

          case 'text_zoom':
            addCaption(topText, '20');
            addCaption(bottomText, 'h-th-20');
            const zoom = finiteInRange(zoomSpeed, 1.5, 1, 3);
            filters.push(`zoompan=z='min(zoom+0.0015,${zoom})':s=500x500:d=250`);
            break;

          case 'text_speed':
            addCaption(topText, '20');
            addCaption(bottomText, 'h-th-20');
            const speed2 = finiteInRange(speedMultiplier, 1, 0.5, 2);
            if (speed2 !== 1) {
              filters.push(`setpts=${1 / speed2}*PTS`);
              ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed2}`);
            }
            break;

          default:
            cleanupCaptions();
            return res.status(400).json({ error: 'Invalid meme style' });
        }

        // Build video filter string
        let videoFilter = '';
        if (filters.length > 0) {
          if (filters.some(f => f.includes('split') || f.includes('hstack'))) {
            videoFilter = filters.join(';');
          } else {
            videoFilter = filters.join(',');
          }
          if (!filters.some(f => f.includes('zoompan'))) {
            videoFilter += ',fps=10,scale=800:-1:flags=lanczos';
          } else {
            videoFilter += ',fps=10';
          }
        } else {
          videoFilter = 'fps=10,scale=800:-1:flags=lanczos';
        }

        await new Promise((resolve, reject) => {
          ffmpegCommand
            .output(outputPath)
            .outputOptions([
              '-vf', videoFilter,
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

        try {
          fs.unlinkSync(inputPath);
          console.log('🗑️  Cleaned up input file');
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file:', cleanupErr);
        }
        cleanupCaptions();

        await logUsage(req, '/convert-to-meme');

        res.json({
          downloadUrl: `/generated_video/${outputFileName}`,
          filename: outputFileName,
          usageLimits: req.usageLimits,
        });
      } catch (err) {
        console.error('❌ Error converting to meme:', err);
        
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
          console.warn('⚠️  Error during cleanup:', cleanupErr);
        }
        cleanupCaptions();

        res.status(500).json(clientErrorPayload('Meme conversion failed', err));
      }
    },
  );

  // Serve generated videos (authenticated download only)
  app.get('/generated_video/:filename', requireAuth, requireVerified, (req, res) => {
    const filename = path.basename(String(req.params.filename || ''));
    if (!filename || filename !== req.params.filename) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(videoOutputDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.sendFile(filePath);
  });
}

module.exports = { initializeVideoService };

