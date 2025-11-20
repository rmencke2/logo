// ================================
//  Christmas Video Service - Add Christmas Effects to Videos
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const { requireAuth } = require('../auth');
const { abuseProtectionMiddleware, logUsage } = require('../abuseProtection');

/**
 * Initialize Christmas video service
 * @param {express.Application} app - Express application instance
 */
function initChristmasVideoService(app) {
  // Ensure generated_video directory exists
  const generatedDir = path.join(__dirname, '..', 'generated_video');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });

  // Set up multer storage for video uploads
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, generatedDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now().toString(16) + '-' + Math.round(Math.random() * 1E9).toString(16);
      const ext = path.extname(file.originalname) || '.mp4';
      cb(null, `${uniqueSuffix}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: 200 * 1024 * 1024, // 200MB
    },
    fileFilter: function (req, file, cb) {
      // Basic video MIME type detection
      const videoMimeTypes = [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-ms-wmv',
        'video/webm',
        'video/x-matroska',
        'video/3gpp',
        'video/x-flv',
      ];
      const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.webm', '.mkv', '.3gp', '.flv'];
      const hasValidMimeType = videoMimeTypes.includes(file.mimetype);
      const hasValidExtension = videoExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));

      if (hasValidMimeType || hasValidExtension) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed (MP4, AVI, MOV, WebM, etc.)'), false);
      }
    },
  });

  // Helper function to get snowflake image path
  // Returns the path to the snowflake.png 
  function getSnowflakeImagePath(effectPreset = 'snow_magic', isVertical = false, resolution = 1080) {
    const baseAssetsDir = path.join(__dirname, '..', 'assets', 'christmas');
    let snowflakePath = path.join(baseAssetsDir, 'snowflake.png');
    
    if (fs.existsSync(snowflakePath)) {
      return snowflakePath;
    }
    
    snowflakePath = path.join(baseAssetsDir, 'snowflake-anim.png');
    if (fs.existsSync(snowflakePath)) {
      return snowflakePath;
    }
    
    return null;
  }

  // Helper to clean up a file if it exists
  function safeUnlink(filePath) {
    if (!filePath) return;
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`Error deleting file ${filePath}:`, err);
      }
    });
  }

  // Helper: ensure christmas assets exist
  function ensureChristmasAssets() {
    const assetsDir = path.join(__dirname, '..', 'assets', 'christmas');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

    const placeholderSnowflake = path.join(assetsDir, 'snowflake.png');

    if (!fs.existsSync(placeholderSnowflake)) {
      console.warn('⚠️  Placeholder snowflake.png not found. Please add one in /assets/christmas');
    }

    const framePath = path.join(assetsDir, 'christmas-garland-frame.png');
    if (!fs.existsSync(framePath)) {
      console.warn('⚠️  Placeholder christmas-garland-frame.png not found. Add to /assets/christmas for frame effect.');
    }

    const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
    if (!fs.existsSync(musicPath)) {
      console.warn('⚠️  Placeholder jingle_bells.mp3 not found. Add to /assets/christmas for music mix.');
    }

    return assetsDir;
  }

  // Analyze video orientation and size using ffprobe
  function getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find(s => s.codec_type === 'video') || metadata.streams[0];
        const width = videoStream.width || 1920;
        const height = videoStream.height || 1080;
        const duration = metadata.format.duration || 10;

        // Rotation metadata, if any
        const rotationTag = videoStream.tags?.rotate;
        const sideData = videoStream.side_data || [];
        const rotationSideData = sideData.find(sd => sd.rotation !== undefined);
        const displayMatrix = sideData.find(sd => sd.displaymatrix);

        let rotationAngle = 0;
        if (rotationTag) {
          rotationAngle = parseInt(rotationTag, 10);
        } else if (rotationSideData && rotationSideData.rotation !== undefined) {
          rotationAngle = rotationSideData.rotation;
        } else if (displayMatrix && displayMatrix.rotation) {
          rotationAngle = displayMatrix.rotation;
        }

        // For our purposes (how many flakes, sizes etc.) we mostly care about aspect ratio.
        // Use raw width/height for that – rotation is only logged.
        const isVertical = height > width;

        console.log(`\n❄️  ========== VIDEO ORIENTATION: ${isVertical ? 'VERTICAL' : 'HORIZONTAL'} ==========`);
        console.log(`❄️  Stored dimensions: ${width}x${height}`);
        console.log(`❄️  Rotation metadata: ${rotationAngle}°`);
        console.log(`❄️  Effective dimensions (for aspect): ${width}x${height}`);
        console.log(`❄️  ============================================\n`);

        resolve({
          width,
          height,
          duration,
          rotationAngle,
          isVertical,
          metadata
        });
      });
    });
  }

  /**
   * SNOW EFFECT: overlay falling snowflakes + mild color grading
   * Effect preset: "snow_magic"
   */
  async function applySnowEffect({
    inputPath,
    outputPath,
    includeMusic = false,
    effectPreset = 'snow_magic',
    logPrefix = '🎄',
  }) {
    const assetsDir = ensureChristmasAssets();

    // Probe video
    const { width, height, duration, isVertical } = await getVideoInfo(inputPath);

    // Find snowflake
    const snowflakePath = getSnowflakeImagePath(effectPreset, isVertical, height);
    if (!snowflakePath || !fs.existsSync(snowflakePath)) {
      console.warn(`⚠️  Snowflake image not found. Falling back to color grading only.`);
      
      const command = ffmpeg(inputPath);
      command.inputOptions(['-noautorotate']);
      const filters = [];

      filters.push(
        `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v]`
      );

      if (includeMusic) {
        const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
        if (fs.existsSync(musicPath)) {
          command.input(musicPath);
          filters.push('[0:a:0]volume=0.7[a0]');
          filters.push('[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]');
          filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
          command.complexFilter(filters);
          command.outputOptions(['-map', '[v]', '-map', '[a]', '-ignore_unknown']);
        } else {
          command.complexFilter(filters);
          command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
        }
      } else {
        command.complexFilter(filters);
        command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
      }

      return new Promise((resolve, reject) => {
        command
          .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', reject)
          .run();
      });
    }

    // If we have snowflake image, we do full snow logic
    const snowflakeMetadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(snowflakePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata);
      });
    });

    const snowflakeWidth = snowflakeMetadata.streams[0].width;
    const snowflakeHeight = snowflakeMetadata.streams[0].height;

    // Scale snowflake based on video orientation:
    //  - Horizontal: use height as reference
    //  - Vertical: use width as reference (smaller side)
    const referenceSize = isVertical ? width : height;
    const snowflakeSize = Math.floor(referenceSize * 0.025); // 2.5% of reference side
    const scaledWidth = Math.floor(snowflakeSize * (snowflakeWidth / snowflakeHeight));
    const scaledHeight = snowflakeSize;

    console.log(`❄️  Snowflake size: ${scaledWidth}x${scaledHeight} (reference: ${referenceSize})`);

    // Number of particles – fewer in vertical so it doesn't get too busy
    const numSnowflakes = isVertical ? 6 : 8;
    const filters = [];

    // For all videos, process with same pipeline (orientation only changes snowflake count/size)
    // Snow overlay pipeline for all orientations
    // Color grade main video first
    filters.push(
      `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v0]`
    );

    // Add each snowflake with different position and speed
    for (let i = 0; i < numSnowflakes; i++) {
      // X position: distribute across width (for both vertical & horizontal)
      const xPos = Math.floor((width / numSnowflakes) * i + (Math.random() * (width / numSnowflakes)));

      // Y position: animate from top to bottom
      const baseSpeed = 30; // pixels per second
      const speed = Math.floor(baseSpeed + (Math.random() * 40)); // 30–70 px/s
      const startY = Math.floor(-scaledHeight - (Math.random() * height));
      const offset = height + scaledHeight;
      const positiveStartY = startY + offset;
      const yExpr = `mod(${positiveStartY}+${speed}*t,${offset})-${scaledHeight}`;

      // Scale snowflake
      filters.push(`[${i + 1}:v]scale=${scaledWidth}:${scaledHeight}[snow${i}]`);

      // Overlay onto video
      const prevLabel = i === 0 ? 'v0' : `v${i}`;
      filters.push(
        `[${prevLabel}][snow${i}]overlay=${xPos}:y='${yExpr}':eval=frame:format=auto[v${i + 1}]`
      );
    }

    const finalVideoLabel = `v${numSnowflakes}`;
    const command = ffmpeg(inputPath);
    command.inputOptions(['-noautorotate']);

    // Add snowflake image inputs
    for (let i = 0; i < numSnowflakes; i++) {
      command.input(snowflakePath);
    }

    command.complexFilter(filters);
    console.log(
      `❄️  Using snowflake image: ${snowflakePath} (${numSnowflakes} animated snowflakes, ${isVertical ? 'vertical' : 'horizontal'} video)`
    );

    // Handle audio mixing (original + jingle_bells)
    if (includeMusic) {
      const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
      if (fs.existsSync(musicPath)) {
        command.input(musicPath);
        filters.push('[0:a:0]volume=0.7[a0]');
        filters.push(`[${numSnowflakes + 1}:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]`);
        filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
        command.complexFilter(filters);
        command.outputOptions(['-map', `[${finalVideoLabel}]`, '-map', '[a]', '-ignore_unknown']);
        console.log(`❄️  Processing with music`);
      } else {
        command.outputOptions(['-map', `[${finalVideoLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
      }
    } else {
      command.outputOptions(['-map', `[${finalVideoLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
    }

    return new Promise((resolve, reject) => {
      command
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k'
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * FRAME EFFECT: add garland frame around video
   * Effect preset: "garland_frame"
   */
  async function applyGarlandFrameEffect({
    inputPath,
    outputPath,
    includeMusic = false,
    effectPreset = 'garland_frame',
    logPrefix = '🎄',
  }) {
    const assetsDir = ensureChristmasAssets();
    const framePath = path.join(assetsDir, 'christmas-garland-frame.png');
    const bottomFramePath = path.join(assetsDir, 'christmas-garland-frame-bottom.png');
    const hasBottomFrame = fs.existsSync(bottomFramePath);

    console.log(`🎄 Main garland path: ${framePath}, exists: ${fs.existsSync(framePath)}`);
    console.log(`🎄 Bottom garland path: ${bottomFramePath}, exists: ${hasBottomFrame}`);

    if (!fs.existsSync(framePath)) {
      console.warn('⚠️  Garland frame not found, skipping frame effect.');
      // Fallback to just color grading
      return applySnowEffect({ inputPath, outputPath, includeMusic, effectPreset: 'snow_magic' });
    }

    const videoInfo = await getVideoInfo(inputPath);
    const { width, height } = videoInfo;

    // Resize frame(s) to match video width
    const frameTopTemp = path.join(assetsDir, `frame_top_${width}.png`);
    const frameBottomTemp = path.join(assetsDir, `frame_bottom_${width}.png`);
    const frameLeftTemp = path.join(assetsDir, `frame_left_${height}.png`);
    const frameRightTemp = path.join(assetsDir, `frame_right_${height}.png`);

    const resizePromises = [];

    resizePromises.push(
      sharp(framePath)
        .resize(width, null)
        .toFile(frameTopTemp)
    );

    if (hasBottomFrame) {
      resizePromises.push(
        sharp(bottomFramePath)
          .resize(width, null)
          .toFile(frameBottomTemp)
      );
    } else {
      // Reuse top frame as bottom if no special bottom image
      resizePromises.push(
        sharp(framePath)
          .resize(width, null)
          .toFile(frameBottomTemp)
      );
    }

    resizePromises.push(
      sharp(framePath)
        .rotate(90)
        .resize(height, null)
        .toFile(frameLeftTemp)
    );

    resizePromises.push(
      sharp(framePath)
        .rotate(270)
        .resize(height, null)
        .toFile(frameRightTemp)
    );

    await Promise.all(resizePromises);

    const command = ffmpeg(inputPath);
    command.inputOptions(['-noautorotate']);
    command
      .input(frameTopTemp)
      .input(frameBottomTemp)
      .input(frameLeftTemp)
      .input(frameRightTemp);

    const filters = [];
    filters.push('[0:v]eq=brightness=0.03:saturation=1.2:contrast=1.05,curves=preset=lighter[v0]');
    filters.push(
      `[v0][1:v]overlay=x=(W-w)/2:y=0:format=auto[v1]`
    );
    filters.push(
      `[v1][2:v]overlay=x=(W-w)/2:y=H-h:format=auto[v2]`
    );
    filters.push(
      `[v2][3:v]overlay=x=0:y=(H-h)/2:format=auto[v3]`
    );
    filters.push(
      `[v3][4:v]overlay=x=W-w:y=(H-h)/2:format=auto[v4]`
    );

    const finalVideoLabel = 'v4';
    command.complexFilter(filters);

    if (includeMusic) {
      const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
      if (fs.existsSync(musicPath)) {
        command.input(musicPath);
        filters.push('[0:a:0]volume=0.7[a0]');
        filters.push('[5:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]');
        filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
        command.complexFilter(filters);
        command.outputOptions(['-map', `[${finalVideoLabel}]`, '-map', '[a]', '-ignore_unknown']);
      } else {
        command.outputOptions(['-map', `[${finalVideoLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
      }
    } else {
      command.outputOptions(['-map', `[${finalVideoLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
    }

    return new Promise((resolve, reject) => {
      command
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k'
        ])
        .output(outputPath)
        .on('end', () => {
          // Clean temp frames
          safeUnlink(frameTopTemp);
          safeUnlink(frameBottomTemp);
          safeUnlink(frameLeftTemp);
          safeUnlink(frameRightTemp);
          resolve(outputPath);
        })
        .on('error', (err) => {
          safeUnlink(frameTopTemp);
          safeUnlink(frameBottomTemp);
          safeUnlink(frameLeftTemp);
          safeUnlink(frameRightTemp);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Decide which effect to apply based on preset
   */
  function processChristmasVideo({ inputPath, outputPath, preset = 'snow_magic', includeMusic = false }) {
    if (preset === 'garland_frame') {
      return applyGarlandFrameEffect({ inputPath, outputPath, includeMusic, effectPreset: preset });
    }
    return applySnowEffect({ inputPath, outputPath, includeMusic, effectPreset: preset });
  }

  // ============================
  //  Routes
  // ============================

  // Upload + convert endpoint
  app.post(
    '/convert-to-christmas',
    requireAuth,
    abuseProtectionMiddleware,
    upload.single('video'),
    async (req, res) => {
      const user = req.user;
      const preset = req.body.preset || 'snow_magic';
      const includeMusic = req.body.includeMusic === 'true' || req.body.includeMusic === true;

      if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
      }

      const inputPath = req.file.path;
      const outputFileName = `xmas-${path.basename(inputPath, path.extname(inputPath)).slice(0, 8)}-${Date.now()}.mp4`;
      const outputPath = path.join(generatedDir, outputFileName);

      console.log(`📁 Input: ${inputPath}`);
      console.log(`📁 Output: ${outputPath}`);
      console.log(`🎄 Processing video with preset: ${preset}`);

      try {
        const start = Date.now();
        await processChristmasVideo({ inputPath, outputPath, preset, includeMusic });

        // Log usage
        logUsage(user, 'christmas_video', {
          preset,
          includeMusic,
          inputFile: path.basename(inputPath),
          outputFile: outputFileName,
        });

        // Remove original file
        safeUnlink(inputPath);

        const durationMs = Date.now() - start;
        console.log(`✅ Christmas conversion completed in ${durationMs}ms for user ${user.email}`);

        res.status(200).json({
          success: true,
          outputFile: outputFileName,
          url: `/generated_video/${outputFileName}`,
        });
      } catch (err) {
        console.error('❌ Error converting to Christmas video:', err);
        safeUnlink(inputPath);
        safeUnlink(outputPath);
        res.status(500).json({ error: 'Failed to convert video to Christmas style' });
      }
    }
  );

  // Static hosting of generated videos
  app.use('/generated_video', express.static(generatedDir));
}

module.exports = {
  initChristmasVideoService,
};
