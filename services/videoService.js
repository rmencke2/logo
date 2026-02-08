// ================================
//  Video Processing Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { requireAuth } = require('../auth');
const { abuseProtectionMiddleware, logUsage } = require('../abuseProtection');
const { trackService } = require('./analyticsService');

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
      fileSize: 500 * 1024 * 1024, // 500MB max file size
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
      fileSize: 500 * 1024 * 1024, // 500MB max file size
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

  // Serve video converter page
  app.get('/video-converter', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'video-converter.html'));
  });

  // Convert AVI to MP4 endpoint
  app.post(
    '/convert-avi-to-mp4',
    trackService('avi-to-mp4'),
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

        res.status(500).json({ 
          error: 'Video conversion failed', 
          details: err.message 
        });
      }
    },
  );

  // Serve video to GIF converter page
  app.get('/video-to-gif', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'video-to-gif.html'));
  });

  // Convert video to GIF endpoint
  app.post(
    '/convert-video-to-gif',
    trackService('video-to-gif'),
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

        res.status(500).json({ 
          error: 'GIF conversion failed', 
          details: err.message 
        });
      }
    },
  );

  // Serve video metadata extractor page
  app.get('/video-metadata', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'video-metadata.html'));
  });

  // Extract video metadata endpoint
  app.post(
    '/extract-video-metadata',
    trackService('video-metadata'),
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

        res.status(500).json({ 
          error: 'Metadata extraction failed', 
          details: err.message 
        });
      }
    },
  );

  // Serve meme generator page
  app.get('/meme-generator', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'meme-generator.html'));
  });

  // Convert video/GIF to meme endpoint
  app.post(
    '/convert-to-meme',
    trackService('meme-generator'),
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
            if (topText) {
              filters.push(`drawtext=text='${topText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=20:borderw=3:bordercolor=black`);
            }
            if (bottomText) {
              filters.push(`drawtext=text='${bottomText.replace(/'/g, "\\'")}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-th-20:borderw=3:bordercolor=black`);
            }
            break;

          case 'zoom':
            const zoomAmount = parseFloat(zoomSpeed) || 1.5;
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
            const speed = parseFloat(speedMultiplier) || 1.0;
            if (speed > 1) {
              filters.push(`setpts=${1/speed}*PTS`);
              ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed}`);
            } else if (speed < 1) {
              filters.push(`setpts=${1/speed}*PTS`);
              ffmpegCommand = ffmpegCommand.audioFilters(`atempo=${speed}`);
            }
            break;

          case 'freeze':
            const freeze = parseFloat(freezeDuration) || 2.0;
            filters.push(`tpad=stop_mode=clone:stop_duration=${freeze}`);
            break;

          case 'cinematic':
            filters.push('drawbox=0:0:iw:60:black@0.8:t=max,drawbox=0:ih-60:iw:60:black@0.8:t=max');
            break;

          case 'outline':
            filters.push('edgedetect=mode=colormix');
            break;

          case 'text_zoom':
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

        res.status(500).json({ 
          error: 'Meme conversion failed', 
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
}

module.exports = { initializeVideoService };

