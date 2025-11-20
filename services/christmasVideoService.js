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
    const garlandPath = path.join(assetsDir, 'christmas-garland-frame.png');
    if (fs.existsSync(garlandPath)) {
      return garlandPath;
    }
    console.log(`⚠️  Garland frame not found at: ${garlandPath}`);
    return null;
  }

  // Preset 1: Snow Magic - Snow overlay + warm colors + optional music
  async function applySnowMagic(inputPath, outputPath, includeMusic = false) {
    return new Promise((resolve, reject) => {
      console.log(`🎬 Starting SnowMagic preset processing...`);
      console.log(`📥 Input: ${inputPath}`);
      console.log(`📤 Output: ${outputPath}`);
      console.log(`🎵 Include music: ${includeMusic}`);
      
      // Get video dimensions
      console.log(`🔍 Probing video metadata...`);
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          console.error('❌ Error probing video:', err);
          return reject(err);
        }
        
        console.log(`✅ Video metadata retrieved successfully`);

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
        console.log(`🔍 Looking for snowflake image...`);
        const snowflakePath = getSnowflakePath();

        if (!snowflakePath) {
          // Fallback: just apply color grading if snowflake image not found
          console.log('⚠️  Snowflake image not found, using color grading only');
          console.log(`📁 Assets directory: ${assetsDir}`);
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
        console.log(`✅ Snowflake image found: ${snowflakePath}`);
        console.log(`🔍 Probing snowflake image dimensions...`);
        ffmpeg.ffprobe(snowflakePath, (err2, snowflakeMetadata) => {
          if (err2) {
            console.error('❌ Error reading snowflake image:', err2);
            console.log('⚠️  Falling back to color grading only');
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
              console.log(`🎵 Adding music: ${musicPath}`);
              command.input(musicPath);
              // Music input index = numSnowflakes + 1 (0=video, 1..numSnowflakes=snowflakes, numSnowflakes+1=music)
              const musicInputIndex = numSnowflakes + 1;
              filters.push('[0:a:0]volume=0.7[a0]');
              filters.push(`[${musicInputIndex}:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]`);
              filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
              command.complexFilter(filters);
              command.outputOptions(['-map', `[${actualFinalLabel}]`, '-map', '[a]', '-ignore_unknown']);
              console.log(`🎵 Music mixing configured (input index: ${musicInputIndex})`);
            } else {
              console.log(`⚠️  Music file not found: ${musicPath}`);
              command.outputOptions(['-map', `[${actualFinalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
            }
          } else {
            command.outputOptions(['-map', `[${actualFinalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
          }

          console.log(`🎬 Starting FFmpeg processing for SnowMagic...`);
          console.log(`📤 Output path: ${outputPath}`);
          
          command
            .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
            .output(outputPath)
            .on('start', (cmdLine) => {
              console.log('🎬 FFmpeg command started:');
              console.log(cmdLine);
            })
            .on('progress', (progress) => {
              if (progress.percent !== undefined) {
                console.log(`⏳ SnowMagic progress: ${Math.round(progress.percent)}%`);
              }
            })
            .on('end', () => {
              console.log(`✅ SnowMagic processing complete: ${outputPath}`);
              if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`📊 Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
              }
              resolve(outputPath);
            })
            .on('error', (ffErr, stdout, stderr) => {
              console.error('❌ FFmpeg error in SnowMagic:');
              console.error('Error object:', ffErr);
              if (stdout) console.error('FFmpeg stdout:', stdout);
              if (stderr) console.error('FFmpeg stderr:', stderr);
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
      console.log(`🎬 Starting NorthPole preset processing...`);
      console.log(`📥 Input: ${inputPath}`);
      console.log(`📤 Output: ${outputPath}`);
      
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
          console.log(`🎵 Adding music: ${musicPath}`);
          command.input(musicPath);
          command.complexFilter([
            ...filters,
            '[0:a:0]volume=0.7[a0]',
            '[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]',
            '[a0][a1]amix=inputs=2:duration=first:normalize=1[a]',
          ]);
          command.outputOptions(['-map', '[v]', '-map', '[a]', '-ignore_unknown']);
        } else {
          console.log(`⚠️  Music file not found: ${musicPath}`);
          command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
        }
      } else {
        command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
      }

      command
        .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
        .output(outputPath)
        .on('start', (cmdLine) => {
          console.log('🎬 FFmpeg command started:');
          console.log(cmdLine);
        })
        .on('progress', (progress) => {
          if (progress.percent !== undefined) {
            console.log(`⏳ NorthPole progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          console.log(`✅ NorthPole processing complete: ${outputPath}`);
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`📊 Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          }
          resolve(outputPath);
        })
        .on('error', (ffErr, stdout, stderr) => {
          console.error('❌ FFmpeg error in NorthPole:');
          console.error('Error object:', ffErr);
          if (stdout) console.error('FFmpeg stdout:', stdout);
          if (stderr) console.error('FFmpeg stderr:', stderr);
          reject(ffErr);
        })
        .run();
    });
  }

  // Preset 3: Holiday Frame - Add Christmas garland border frame
  async function applyHolidayFrame(inputPath, outputPath, includeMusic = false) {
    return new Promise((resolve, reject) => {
      console.log(`🎬 Starting HolidayFrame preset processing...`);
      console.log(`📥 Input: ${inputPath}`);
      console.log(`📤 Output: ${outputPath}`);
      
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          console.error('❌ Error probing video:', err);
          return reject(err);
        }

        const width = metadata.streams[0].width;
        const height = metadata.streams[0].height;
        
        // Use same rotation detection as SnowMagic
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

        console.log(`🎄 ========== HOLIDAY FRAME VIDEO ORIENTATION ==========`);
        console.log(`🎄 Stored dimensions: ${width}x${height}`);
        console.log(`🎄 Rotation metadata: ${rotationAngle}°`);
        console.log(`🎄 Effective dimensions: ${effectiveWidth}x${effectiveHeight}`);
        console.log(`🎄 Orientation: ${isVertical ? 'VERTICAL' : 'HORIZONTAL'}`);
        console.log(`🎄 =====================================================`);

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
          if (err2) {
            console.error('❌ Error reading garland file:', err2);
            return reject(err2);
          }

          sharp(data)
            .metadata()
            .then((garlandMeta) => {
              const garlandWidth = garlandMeta.width || 1920;
              const garlandHeight = garlandMeta.height || 1080;
              const isGarlandVertical = garlandHeight > garlandWidth;

              // Garland strip thickness: 15% of the smaller video dimension
              const garlandThicknessPercent = 0.15;
              const garlandThickness = Math.floor(
                Math.min(width, height) * garlandThicknessPercent
              );

              console.log(
                `🎄 Garland image: ${garlandWidth}x${garlandHeight} (${isGarlandVertical ? 'vertical' : 'horizontal'})`,
              );
              console.log(`🎄 Video: ${width}x${height} (${isVertical ? 'VERTICAL' : 'HORIZONTAL'})`);
              console.log(`🎄 Garland thickness: ${garlandThickness}px`);

              const filters = [
                '[0:v]eq=brightness=0.03:saturation=1.2[v0]',
              ];

              // Create garland strips for all 4 sides
              // Strategy: Split garland input into 4 copies, process each for different sides
              
              // Split garland into 4 copies
              filters.push('[1:v]split=4[garland1][garland2][garland3][garland4]');
              
              // Process garland1 and garland2 for top/bottom (horizontal strips)
              // For top/bottom: need horizontal strips (width x garlandThickness)
              if (isGarlandVertical) {
                // Garland is tall, rotate it to make it wide
                filters.push('[garland1]transpose=1[garland_h1_rotated]');
                filters.push(
                  `[garland_h1_rotated]scale=${width}:-1,format=rgba[garland_h1_scaled]`,
                );
                filters.push('[garland2]transpose=1[garland_h2_rotated]');
                filters.push(
                  `[garland_h2_rotated]scale=${width}:-1,format=rgba[garland_h2_scaled]`,
                );
              } else {
                // Garland is already wide
                filters.push(
                  `[garland1]scale=${width}:-1,format=rgba[garland_h1_scaled]`,
                );
                filters.push(
                  `[garland2]scale=${width}:-1,format=rgba[garland_h2_scaled]`,
                );
              }
              
              // Crop horizontal strips for top and bottom
              filters.push(
                `[garland_h1_scaled]crop=w=${width}:h=${garlandThickness}:x=0:y=0[garland_top]`,
              );
              filters.push(
                `[garland_h2_scaled]crop=w=${width}:h=${garlandThickness}:x=0:y=ih-${garlandThickness}[garland_bottom]`,
              );

              // Process garland3 and garland4 for left/right (vertical strips)
              // For left/right: need vertical strips (garlandThickness x height)
              if (isGarlandVertical) {
                // Garland is tall, use it directly
                filters.push(
                  `[garland3]scale=-1:${height},format=rgba[garland_v1_scaled]`,
                );
                filters.push(
                  `[garland4]scale=-1:${height},format=rgba[garland_v2_scaled]`,
                );
              } else {
                // Garland is wide, rotate it to make it tall
                filters.push('[garland3]transpose=1[garland_v1_rotated]');
                filters.push(
                  `[garland_v1_rotated]scale=-1:${height},format=rgba[garland_v1_scaled]`,
                );
                filters.push('[garland4]transpose=1[garland_v2_rotated]');
                filters.push(
                  `[garland_v2_rotated]scale=-1:${height},format=rgba[garland_v2_scaled]`,
                );
              }
              
              // Crop vertical strips for left and right
              filters.push(
                `[garland_v1_scaled]crop=w=${garlandThickness}:h=${height}:x=0:y=0[garland_left]`,
              );
              filters.push(
                `[garland_v2_scaled]crop=w=${garlandThickness}:h=${height}:x=iw-${garlandThickness}:y=0[garland_right]`,
              );

              // Overlay all 4 sides: top, bottom, left, right
              filters.push('[v0][garland_top]overlay=x=0:y=0[v1]');
              filters.push(`[v1][garland_bottom]overlay=x=0:y=H-h[v2]`);
              filters.push(`[v2][garland_left]overlay=x=0:y=0[v3]`);
              filters.push(`[v3][garland_right]overlay=x=W-w:y=0[v]`);

              const finalLabel = 'v';
              const command = ffmpeg(inputPath);
              command.inputOptions(['-noautorotate']);
              command.input(garlandPath);
              command.complexFilter(filters);
              
              console.log(`🎄 Garland frame filters configured for all 4 sides`);

              if (includeMusic) {
                const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
                if (fs.existsSync(musicPath)) {
                  console.log(`🎵 Adding music: ${musicPath}`);
                  command.input(musicPath);
                  // Music is input 2 (0=video, 1=garland, 2=music)
                  filters.push('[0:a:0]volume=0.7[a0]');
                  filters.push('[2:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]');
                  filters.push('[a0][a1]amix=inputs=2:duration=first:normalize=1[a]');
                  command.complexFilter(filters);
                  command.outputOptions(['-map', `[${finalLabel}]`, '-map', '[a]', '-ignore_unknown']);
                  console.log(`🎵 Music mixing configured`);
                } else {
                  console.log(`⚠️  Music file not found: ${musicPath}`);
                  command.outputOptions(['-map', `[${finalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
                }
              } else {
                command.outputOptions(['-map', `[${finalLabel}]`, '-map', '0:a:0', '-ignore_unknown']);
              }

              console.log(`🎬 Starting FFmpeg processing for HolidayFrame...`);
              console.log(`📤 Output path: ${outputPath}`);

              command
                .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
                .output(outputPath)
                .on('start', (cmdLine) => {
                  console.log('🎬 FFmpeg command started:');
                  console.log(cmdLine);
                })
                .on('progress', (progress) => {
                  if (progress.percent !== undefined) {
                    console.log(`⏳ HolidayFrame progress: ${Math.round(progress.percent)}%`);
                  }
                })
                .on('end', () => {
                  console.log(`✅ HolidayFrame processing complete: ${outputPath}`);
                  if (fs.existsSync(outputPath)) {
                    const stats = fs.statSync(outputPath);
                    console.log(`📊 Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                  }
                  resolve(outputPath);
                })
                .on('error', (ffErr, stdout, stderr) => {
                  console.error('❌ FFmpeg error in HolidayFrame:');
                  console.error('Error object:', ffErr);
                  if (stdout) console.error('FFmpeg stdout:', stdout);
                  if (stderr) console.error('FFmpeg stderr:', stderr);
                  reject(ffErr);
                })
                .run();
            })
            .catch(reject);
        });
      });
    });
  }

  // Test endpoint to verify service is loaded
  app.get('/convert-to-christmas-test', (req, res) => {
    console.log('✅ Christmas video service test endpoint hit');
    res.json({ 
      success: true, 
      message: 'Christmas video service is loaded',
      videoOutputDir,
      assetsDir,
      snowflakeExists: fs.existsSync(path.join(assetsDir, 'snowflake.png')),
      garlandExists: fs.existsSync(path.join(assetsDir, 'christmas-garland-frame.png'))
    });
  });

  // Main endpoint: Convert video to Christmas version
  console.log('🎄 Registering /convert-to-christmas endpoint');
  app.post(
    '/convert-to-christmas',
    (req, res, next) => {
      console.log('🎄 ========== /convert-to-christmas REQUEST RECEIVED ==========');
      console.log('🎄 Method:', req.method);
      console.log('🎄 URL:', req.url);
      console.log('🎄 Content-Type:', req.headers['content-type']);
      console.log('🎄 Content-Length:', req.headers['content-length']);
      console.log('🎄 Body (before multer):', req.body);
      console.log('🎄 ========================================================');
      next();
    },
    (req, res, next) => {
      console.log('🔐 Running requireAuth middleware...');
      try {
        requireAuth(req, res, (err) => {
          if (err) {
            console.error('❌ Auth middleware error:', err);
            return next(err);
          }
          console.log('✅ Auth passed, proceeding to abuse protection');
          next();
        });
      } catch (authErr) {
        console.error('❌ Auth middleware exception:', authErr);
        next(authErr);
      }
    },
    (req, res, next) => {
      console.log('🛡️  Running abuse protection middleware...');
      try {
        abuseProtectionMiddleware(req, res, (err) => {
          if (err) {
            console.error('❌ Abuse protection middleware error:', err);
            return next(err);
          }
          console.log('✅ Abuse protection passed, proceeding to file upload');
          next();
        });
      } catch (abuseErr) {
        console.error('❌ Abuse protection middleware exception:', abuseErr);
        next(abuseErr);
      }
    },
    (req, res, next) => {
      console.log('📤 Running multer upload middleware...');
      upload.single('video')(req, res, (err) => {
        if (err) {
          console.error('❌ Multer upload error:', err);
          console.error('❌ Multer error details:', {
            message: err.message,
            code: err.code,
            field: err.field,
            storageErrors: err.storageErrors
          });
          return next(err);
        }
        console.log('🎄 After multer upload middleware');
        console.log('🎄 req.file:', req.file ? {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          encoding: req.file.encoding,
          mimetype: req.file.mimetype,
          size: req.file.size,
          filename: req.file.filename,
          path: req.file.path
        } : 'null');
        console.log('🎄 req.body:', req.body);
        next();
      });
    },
    async (req, res) => {
      console.log('🎄 ========== INSIDE HANDLER ==========');
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

      const { preset = 'snow_magic', includeMusic: includeMusicRaw = false } = req.body;
      // Convert includeMusic to boolean (handles string "true"/"false" from form data)
      const includeMusic = includeMusicRaw === true || includeMusicRaw === 'true' || includeMusicRaw === '1';
      
      const inputPath = req.file.path;

      console.log(`🎄 Preset: ${preset}, Include Music: ${includeMusic} (raw: ${includeMusicRaw})`);

      if (!fs.existsSync(videoOutputDir)) {
        console.log(`📁 Creating output directory: ${videoOutputDir}`);
        fs.mkdirSync(videoOutputDir, { recursive: true });
      }

      const shortId = req.file.filename.substring(0, 8);
      const timestamp = Date.now();
      const outputFileName = `xmas-${shortId}-${timestamp}.mp4`;
      const outputPath = path.join(videoOutputDir, outputFileName);

      console.log(`📁 Input: ${inputPath}`);
      console.log(`📁 Output: ${outputPath}`);
      console.log(`🎄 Processing video with preset: ${preset}`);
      console.log(`🎵 Music enabled: ${includeMusic}`);

      try {
        const startTime = Date.now();
        let processedPath;
        
        console.log(`🚀 Starting video processing...`);
        switch (preset) {
          case 'north_pole':
            console.log(`🎬 Applying NorthPole preset`);
            processedPath = await applyNorthPole(inputPath, outputPath, includeMusic);
            break;
          case 'holiday_frame':
            console.log(`🎬 Applying HolidayFrame preset`);
            processedPath = await applyHolidayFrame(inputPath, outputPath, includeMusic);
            break;
          case 'snow_magic':
          default:
            console.log(`🎬 Applying SnowMagic preset`);
            processedPath = await applySnowMagic(inputPath, outputPath, includeMusic);
            break;
        }
        
        const processingTime = Date.now() - startTime;
        console.log(`⏱️  Processing completed in ${(processingTime / 1000).toFixed(2)} seconds`);

        // Verify output file exists
        if (!fs.existsSync(processedPath)) {
          console.error(`❌ Output file does not exist: ${processedPath}`);
          throw new Error('Output file was not created');
        }
        
        const outputStats = fs.statSync(processedPath);
        console.log(`✅ Output file created: ${processedPath}`);
        console.log(`📊 Output file size: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);

        // Clean up input file
        try {
          fs.unlinkSync(inputPath);
          console.log('🗑️  Cleaned up input file');
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file:', cleanupErr);
        }

        await logUsage(req, '/convert-to-christmas');

        const publicUrl = `/generated_video/${path.basename(processedPath)}`;
        const filename = path.basename(processedPath);
        console.log(`✅ Success! Returning URL: ${publicUrl}, filename: ${filename}`);
        return res.json({ 
          success: true, 
          downloadUrl: publicUrl,
          url: publicUrl, // Keep for backwards compatibility
          filename: filename
        });
      } catch (processErr) {
        console.error('❌ Error processing Christmas video:');
        console.error('Error message:', processErr.message);
        console.error('Error stack:', processErr.stack);
        if (processErr.code) {
          console.error('Error code:', processErr.code);
        }
        if (processErr.signal) {
          console.error('Error signal:', processErr.signal);
        }
        
        try {
          if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
            console.log('🗑️  Cleaned up input file after error');
          }
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file after error:', cleanupErr);
        }
        
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
            console.log('🗑️  Cleaned up partial output file');
          }
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete output file after error:', cleanupErr);
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
