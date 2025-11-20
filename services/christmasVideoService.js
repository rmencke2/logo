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
function initializeChristmasVideoService(app) {
  // Ensure output folder exists
  const videoOutputDir = path.join(__dirname, '..', 'generated_video');
  if (!fs.existsSync(videoOutputDir)) fs.mkdirSync(videoOutputDir, { recursive: true });

  // Ensure assets folder exists for Christmas overlays/music
  const assetsDir = path.join(__dirname, '..', 'assets', 'christmas');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  // Configure multer for video uploads
  const upload = multer({
    dest: videoOutputDir,
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB max file size
    },
    fileFilter: (req, file, cb) => {
      const videoMimeTypes = [
        'video/mp4',
        'video/quicktime',
        'video/x-matroska',
        'video/webm',
        'video/ogg',
      ];
      if (videoMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed'));
      }
    },
  });

  // Helper: get snowflake image path
  function getSnowflakePath() {
    const snowflakePath = path.join(assetsDir, 'snowflake.png');
    if (fs.existsSync(snowflakePath)) {
      return snowflakePath;
    }
    return null;
  }

  // Helper: get garland frame image path
  function getGarlandPath() {
    const garlandPath = path.join(assetsDir, 'garland_frame.png');
    if (fs.existsSync(garlandPath)) {
      return garlandPath;
    }
    return null;
  }

  // Preset 1: Snow Magic - Snow overlay + warm colors + optional music
  async function applySnowMagic(inputPath, outputPath, includeMusic = false) {
    return new Promise((resolve, reject) => {
      // Get video dimensions
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);

        const width = metadata.streams[0].width;
        const height = metadata.streams[0].height;
        const duration = metadata.format.duration || 10; // Default to 10 seconds if not available

        // Check for rotation metadata
        const rotationTag = metadata.streams[0].tags?.rotate;
        const sideData = metadata.streams[0].side_data || [];
        const rotationSideData = sideData.find((sd) => sd.rotation !== undefined);
        const displayMatrix = sideData.find((sd) => sd.displaymatrix);

        let rotationAngle = 0;
        if (rotationTag) {
          rotationAngle = parseInt(rotationTag, 10) || 0;
        } else if (rotationSideData && typeof rotationSideData.rotation === 'number') {
          rotationAngle = Math.round(rotationSideData.rotation);
        } else if (displayMatrix && typeof displayMatrix.displaymatrix === 'string') {
          const matrixStr = displayMatrix.displaymatrix;
          const match = matrixStr.match(/rotation of ([-+]?\d+\.?\d*) degrees/);
          if (match) {
            rotationAngle = Math.round(parseFloat(match[1]));
          }
        }

        // Adjust orientation detection based on rotation
        let effectiveWidth = width;
        let effectiveHeight = height;
        if (
          rotationAngle === 90 ||
          rotationAngle === -90 ||
          rotationAngle === 270 ||
          rotationAngle === -270
        ) {
          effectiveWidth = height;
          effectiveHeight = width;
        }

        const isVertical = effectiveHeight > effectiveWidth;

        console.log(`\n❄️  ========== VIDEO ORIENTATION: ${isVertical ? 'VERTICAL' : 'HORIZONTAL'} ==========`);
        console.log(`❄️  Stored dimensions: ${width}x${height}`);
        console.log(`❄️  Rotation metadata: ${rotationAngle}°`);
        console.log(`❄️  Effective dimensions: ${effectiveWidth}x${effectiveHeight}`);
        console.log('❄️  ============================================\n');

        // Get snowflake image path
        const snowflakePath = getSnowflakePath();

        if (!snowflakePath) {
          // Fallback: just apply color grading if snowflake image not found
          console.log('⚠️  Snowflake image not found, using color grading only');
          const command = ffmpeg(inputPath);
          command.inputOptions(['-noautorotate']);
          command.complexFilter([
            `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v]`,
          ]);

          // Handle audio
          if (includeMusic) {
            const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
            if (fs.existsSync(musicPath)) {
              command.input(musicPath);
              command.complexFilter([
                `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v]`,
                '[0:a:0]volume=0.7[a0]',
                '[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]',
                '[a0][a1]amix=inputs=2:duration=first:normalize=1[a]',
              ]);
              command.outputOptions(['-map', '[v]', '-map', '[a]', '-ignore_unknown']);
            } else {
              command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
            }
          } else {
            command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
          }

          command
            .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
          return;
        }

        // Get snowflake image dimensions
        ffmpeg.ffprobe(snowflakePath, (err2, snowflakeMetadata) => {
          if (err2) {
            console.error('❌ Error reading snowflake image:', err2);
            const command = ffmpeg(inputPath);
            command.inputOptions(['-noautorotate']);
            command.complexFilter([
              `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v]`,
            ]);
            command
              .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
              .output(outputPath)
              .on('end', () => resolve(outputPath))
              .on('error', reject)
              .run();
            return;
          }

          const snowflakeWidth = snowflakeMetadata.streams[0].width || 64;
          const snowflakeHeight = snowflakeMetadata.streams[0].height || 64;

          // Snowflake size: base it on smaller dimension (for vertical: width; for horizontal: height)
          const referenceSize = isVertical ? width : height;
          const snowflakeSize = Math.floor(referenceSize * 0.025); // 2.5% of reference
          const scaledWidth = Math.floor(snowflakeSize * (snowflakeWidth / snowflakeHeight));
          const scaledHeight = snowflakeSize;

          console.log(`❄️  Snowflake size: ${scaledWidth}x${scaledHeight} (reference: ${referenceSize})`);

          // ---------- NEW: unified snow logic (no transpose, works for both orientations) ----------
          // Create multiple snowflakes at different x positions with different speeds
          // Adjust number based on orientation
          const numSnowflakes = isVertical ? 10 : 14; // More flakes on horizontal, slightly fewer on vertical
          const filters = [];

          // Color grade main video first (no rotation; we keep original orientation)
          filters.push(
            `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v0]`,
          );

          // Add each snowflake with different position, sway, and speed
          for (let i = 0; i < numSnowflakes; i++) {
            const sliceWidth = width / numSnowflakes;
            const xPosBase = sliceWidth * i + Math.random() * sliceWidth;

            // Slightly faster snow on vertical videos so it doesn't feel too sparse
            const baseSpeed = isVertical ? 40 : 30;
            const speed = Math.floor(baseSpeed + Math.random() * 40);

            const startY = Math.floor(-scaledHeight - Math.random() * height);
            const offset = height + scaledHeight;
            const positiveStartY = startY + offset;
            const yExpr = `mod(${positiveStartY}+${speed}*t,${offset})-${scaledHeight}`;

            // A little horizontal sway using sin() – feels more natural
            const swayAmplitude = Math.floor(referenceSize * 0.01); // 1% of reference dimension
            const swayFrequency = (Math.random() * 1.2 + 0.6).toFixed(3); // 0.6–1.8
            const xExpr = `${xPosBase}+${swayAmplitude}*sin(${swayFrequency}*t)`;

            // Scale and slightly fade the snowflake
            filters.push(
              `[${i + 1}:v]scale=${scaledWidth}:${scaledHeight},format=rgba,colorchannelmixer=aa=0.8[snow${i}]`,
            );

            const prevLabel = i === 0 ? 'v0' : `v${i}`;
            filters.push(
              `[${prevLabel}][snow${i}]overlay=x='${xExpr}':y='${yExpr}':eval=frame:format=auto[v${i + 1}]`,
            );
          }

          const finalVideoLabel = `v${numSnowflakes}`;
          const actualFinalLabel = finalVideoLabel;

          const command = ffmpeg(inputPath);
          command.inputOptions(['-noautorotate']);

          // Add snowflake image once per flake
          for (let i = 0; i < numSnowflakes; i++) {
            command.input(snowflakePath);
          }

          command.complexFilter(filters);
          console.log(
            `❄️  Using snowflake image: ${snowflakePath} (${numSnowflakes} animated snowflakes, ${
              isVertical ? 'vertical' : 'horizontal'
            } video)`,
          );

          // Handle audio
          if (includeMusic) {
            const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
            if (fs.existsSync(musicPath)) {
              command.input(musicPath);
              filters.push('[0:a:0]volume=0.7[a0]');
              filters.push('[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]');
              filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
              command.complexFilter(filters);
              command.outputOptions(['-map', `[${actualFinalLabel}]`, '-map', '[a]', '-ignore_unknown']);
            } else {
              command.outputOptions(['-map', `[${actualFinalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
            }
          } else {
            command.outputOptions(['-map', `[${actualFinalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
          }

          command
            .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (ffErr) => {
              console.error('❌ FFmpeg error in SnowMagic:', ffErr);
              reject(ffErr);
            })
            .run();
        });
      });
    });
  }

  // Preset 2: North Pole (simple warm color grading + vignette)
  async function applyNorthPole(inputPath, outputPath, includeMusic = false) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      command.inputOptions(['-noautorotate']);

      const filters = [
        '[0:v]eq=brightness=0.03:saturation=1.25:contrast=1.1,curves=preset=lighter[v_base]',
        '[v_base]vignette=PI/4:0.6[v]',
      ];

      command.complexFilter(filters);

      if (includeMusic) {
        const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
        if (fs.existsSync(musicPath)) {
          command.input(musicPath);
          command.complexFilter([
            ...filters,
            '[0:a:0]volume=0.7[a0]',
            '[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]',
            '[a0][a1]amix=inputs=2:duration=first:normalize=1[a]',
          ]);
          command.outputOptions(['-map', '[v]', '-map', '[a]', '-ignore_unknown']);
        } else {
          command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
        }
      } else {
        command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
      }

      command
        .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
  }

  // Preset 3: Holiday Frame - Add Christmas garland border frame
  async function applyHolidayFrame(inputPath, outputPath, includeMusic = false) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);

        const width = metadata.streams[0].width;
        const height = metadata.streams[0].height;
        const rotationTag = metadata.streams[0].tags?.rotate;
        const rotationAngle = rotationTag ? parseInt(rotationTag, 10) || 0 : 0;
        const isVertical = height > width;

        console.log(`🎄 HolidayFrame video: ${width}x${height}, rotation=${rotationAngle}°, vertical=${isVertical}`);

        const garlandPath = getGarlandPath();
        if (!garlandPath) {
          console.log('⚠️  Garland image not found, falling back to color grading only');
          const command = ffmpeg(inputPath);
          command.inputOptions(['-noautorotate']);
          command.complexFilter(['[0:v]eq=brightness=0.03:saturation=1.2[v]']);
          command
            .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
          return;
        }

        // Read garland image via sharp to get dimensions
        fs.readFile(garlandPath, (err2, data) => {
          if (err2) return reject(err2);

          sharp(data)
            .metadata()
            .then((garlandMeta) => {
              const garlandWidth = garlandMeta.width || 1920;
              const garlandHeight = garlandMeta.height || 1080;
              const isGarlandVertical = garlandHeight > garlandWidth;

              const garlandHeightPercent = 0.2;
              const referenceDimension = isVertical ? width : height;
              const garlandStripHeight = Math.floor(referenceDimension * garlandHeightPercent);
              const scaleTarget = isVertical ? height : width;

              console.log(
                `🎄 Garland image: ${garlandWidth}x${garlandHeight} (${isGarlandVertical ? 'vertical' : 'horizontal'})`,
              );
              console.log(`🎄 Video: ${width}x${height} (${isVertical ? 'VERTICAL' : 'HORIZONTAL'})`);
              console.log(`🎄 Scale target: ${scaleTarget}, Garland strip height: ${garlandStripHeight}`);

              const filters = [
                '[0:v]eq=brightness=0.03:saturation=1.2[v0]',
              ];

              // Rotate garland if needed, then scale
              if (isGarlandVertical) {
                filters.push('[1:v]transpose=1[garland_rotated]');
                filters.push(
                  `[garland_rotated]scale=${scaleTarget}:-1,format=rgba[garland_scaled_full]`,
                );
              } else {
                filters.push(`[1:v]scale=${scaleTarget}:-1,format=rgba[garland_scaled_full]`);
              }

              // Crop top/bottom strip
              filters.push(
                `[garland_scaled_full]crop=w=iw:h=${garlandStripHeight}:x=0:y=0[garland_top]`,
              );
              filters.push(
                `[garland_scaled_full]crop=w=iw:h=${garlandStripHeight}:x=0:y=ih-${garlandStripHeight}[garland_bottom]`,
              );

              // Overlay top and bottom
              filters.push('[v0][garland_top]overlay=x=0:y=0[v1]');
              filters.push(`[v1][garland_bottom]overlay=x=0:y=H-${garlandStripHeight}[v2]`);

              const finalLabel = 'v2';
              const command = ffmpeg(inputPath);
              command.inputOptions(['-noautorotate']);
              command.input(garlandPath);
              command.complexFilter(filters);

              if (includeMusic) {
                const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
                if (fs.existsSync(musicPath)) {
                  command.input(musicPath);
                  filters.push('[0:a:0]volume=0.7[a0]');
                  filters.push('[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]');
                  filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
                  command.complexFilter(filters);
                  command.outputOptions(['-map', `[${finalLabel}]`, '-map', '[a]', '-ignore_unknown']);
                } else {
                  command.outputOptions(['-map', `[${finalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
                }
              } else {
                command.outputOptions(['-map', `[${finalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
              }

              command
                .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
                .output(outputPath)
                .on('start', (cmd) => console.log('🎄 FFmpeg command:', cmd))
                .on('progress', (progress) => {
                  if (progress.percent) {
                    console.log(`⏳ Processing: ${Math.round(progress.percent)}%`);
                  }
                })
                .on('end', () => {
                  console.log('✅ Holiday frame processing complete');
                  resolve(outputPath);
                })
                .on('error', (ffErr, stdout, stderr) => {
                  console.error('❌ FFmpeg error:', ffErr);
                  if (stderr) console.error('❌ FFmpeg stderr:', stderr);
                  reject(ffErr);
                })
                .run();
            })
            .catch(reject);
        });
      });
    });
  }

  // Main endpoint: Convert video to Christmas version
  app.post(
    '/convert-to-christmas',
    requireAuth,
    abuseProtectionMiddleware,
    upload.single('video'),
    async (req, res) => {
      console.log('🎄 Received /convert-to-christmas request');
      console.log('🎄 Request body:', req.body);
      if (req.file) {
        console.log(
          `🎥 Uploaded file: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`,
        );
      } else {
        console.log('⚠️  No file found on req.file at handler start');
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
      }

      // Validate file size (500MB max)
      if (req.file.size > 500 * 1024 * 1024) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
        return res.status(400).json({ error: 'File too large (max 500MB)' });
      }

      // Try to read duration for validation (20s max)
      try {
        const metadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(req.file.path, (probeErr, data) => {
            if (probeErr) return reject(probeErr);
            resolve(data);
          });
        });

        const duration = metadata.format.duration || 0;
        console.log(`⏱  Uploaded video duration: ${duration.toFixed(2)} seconds`);

        if (duration > 20) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {}
          return res.status(400).json({
            error: 'Video duration must be 20 seconds or less',
            duration: duration.toFixed(2),
          });
        }
      } catch (durationErr) {
        console.error('Error checking video duration:', durationErr);
        // Continue processing if we can't check duration
      }

      const { preset = 'snow_magic', includeMusic = false } = req.body;
      const inputPath = req.file.path;

      if (!fs.existsSync(videoOutputDir)) {
        fs.mkdirSync(videoOutputDir, { recursive: true });
      }

      const shortId = req.file.filename.substring(0, 8);
      const timestamp = Date.now();
      const outputFileName = `xmas-${shortId}-${timestamp}.mp4`;
      const outputPath = path.join(videoOutputDir, outputFileName);

      console.log(`📁 Input: ${inputPath}`);
      console.log(`📁 Output: ${outputPath}`);
      console.log(`🎄 Processing video with preset: ${preset}`);

      try {
        let processedPath;
        switch (preset) {
          case 'north_pole':
            processedPath = await applyNorthPole(inputPath, outputPath, includeMusic);
            break;
          case 'holiday_frame':
            processedPath = await applyHolidayFrame(inputPath, outputPath, includeMusic);
            break;
          case 'snow_magic':
          default:
            processedPath = await applySnowMagic(inputPath, outputPath, includeMusic);
            break;
        }

        // Clean up input file
        try {
          fs.unlinkSync(inputPath);
          console.log('🗑️  Cleaned up input file');
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file:', cleanupErr);
        }

        await logUsage(req, '/convert-to-christmas');

        const publicUrl = `/generated_video/${path.basename(processedPath)}`;
        return res.json({ success: true, url: publicUrl });
      } catch (processErr) {
        console.error('❌ Error processing Christmas video:', processErr);
        try {
          fs.unlinkSync(inputPath);
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file after error:', cleanupErr);
        }
        return res
          .status(500)
          .json({ error: 'Failed to process Christmas video', details: processErr.message });
      }
    },
  );

  // Serve generated videos
  app.use(
    '/generated_video',
    express.static(videoOutputDir, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
    }),
  );
}

module.exports = { initializeChristmasVideoService };
