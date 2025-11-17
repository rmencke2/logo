// ================================
//  Christmas Video Service - Add Christmas Effects to Videos
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
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
        'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv',
        'video/webm', 'video/x-matroska', 'video/3gpp', 'video/x-flv',
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

  // Helper function to generate snow overlay using FFmpeg
  // Uses a simpler approach: animated noise filter with transparency
  function generateSnowOverlay(width, height, duration) {
    const snowPath = path.join(videoOutputDir, `snow_${width}x${height}_${Date.now()}.mp4`);
    
    return new Promise((resolve, reject) => {
      // Use noise filter to create snow effect
      ffmpeg()
        .input(`color=c=white:s=${width}x${height}:d=${duration}`)
        .inputFormat('lavfi')
        .videoFilters([
          // Create random white dots that look like snow
          `geq=lum='if(lt(random(1),0.03),255,0)':a='if(lt(random(1),0.03),180,0)'`,
          'fps=30',
        ])
        .outputOptions([
          '-t', duration.toString(),
          '-pix_fmt', 'rgba',
          '-shortest',
        ])
        .output(snowPath)
        .on('start', (cmd) => console.log('❄️  Generating snow overlay...'))
        .on('end', () => {
          console.log('✅ Snow overlay generated');
          resolve(snowPath);
        })
        .on('error', (err) => {
          console.error('❌ Snow overlay generation error:', err);
          // If snow generation fails, continue without it
          console.log('⚠️  Continuing without snow overlay');
          resolve(null);
        })
        .run();
    });
  }

  // Helper function to apply Christmas color grading
  function applyChristmasColorGrading(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters([
          // Warm tones with red/green enhancement
          'eq=brightness=0.05:saturation=1.3:contrast=1.1',
          // Add warm glow
          'curves=preset=lighter',
          // Slight vignette
          'vignette=angle=PI/4:x=0.5:y=0.5',
        ])
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run();
    });
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

        // Generate snow overlay
        generateSnowOverlay(width, height, duration)
          .then(snowPath => {
            const command = ffmpeg(inputPath);
            
            // Preserve original orientation - apply to input
            command.inputOptions(['-noautorotate']);
            
            if (snowPath) {
              // Apply warm color grading and overlay snow
              command.complexFilter([
                // Color grade main video
                `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v0]`,
                // Scale snow overlay
                `[1:v]scale=${width}:${height}[snow]`,
                // Overlay snow on video
                '[v0][snow]overlay=format=auto[v]'
              ]);
              command.input(snowPath);
            } else {
              // Just apply color grading if snow generation failed
              command.videoFilters([
                'eq=brightness=0.05:saturation=1.3:contrast=1.1',
                'curves=preset=lighter',
              ]);
            }

            // Handle audio
            if (includeMusic) {
              const musicPath = path.join(assetsDir, 'jingle_bells.mp3');
              if (fs.existsSync(musicPath)) {
                command.input(musicPath);
                if (snowPath) {
                  command.complexFilter([
                    `[0:v]eq=brightness=0.05:saturation=1.3:contrast=1.1,curves=preset=lighter[v0]`,
                    `[1:v]scale=${width}:${height}[snow]`,
                    '[v0][snow]overlay=format=auto[v]',
                    '[0:a:0]volume=0.7[a0]',
                    '[2:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]',
                    '[a0][a1]amix=inputs=2:duration=first:normalize=1[a]'
                  ]);
                  command.outputOptions(['-map', '[v]', '-map', '[a]', '-ignore_unknown']);
                } else {
                  command.complexFilter([
                    '[0:a:0]volume=0.7[a0]',
                    '[1:a]volume=0.3,aloop=loop=-1:size=2e+09[a1]',
                    '[a0][a1]amix=inputs=2:duration=first:normalize=1[a]'
                  ]);
                  command.outputOptions(['-map', '0:v', '-map', '[a]', '-ignore_unknown']);
                }
              } else {
                if (snowPath) {
                  command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
                } else {
                  command.outputOptions(['-map', '0:v', '-map', '0:a:0', '-ignore_unknown']);
                }
              }
            } else {
              if (snowPath) {
                command.outputOptions(['-map', '[v]', '-map', '0:a:0', '-ignore_unknown']);
              } else {
                command.outputOptions(['-map', '0:v', '-map', '0:a:0', '-ignore_unknown']);
              }
            }

            command
              .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k'])
              .output(outputPath)
              .on('start', (commandLine) => {
                console.log('🎄 FFmpeg command:', commandLine);
              })
              .on('progress', (progress) => {
                console.log(`⏳ Processing: ${Math.round(progress.percent || 0)}%`);
              })
              .on('end', () => {
                // Clean up snow overlay
                if (snowPath) {
                  try { fs.unlinkSync(snowPath); } catch (e) {}
                }
                resolve(outputPath);
              })
              .on('error', (err) => {
                if (snowPath) {
                  try { fs.unlinkSync(snowPath); } catch (e) {}
                }
                reject(err);
              })
              .run();
          })
          .catch(reject);
      });
    });
  }

  // Preset 2: North Pole Cinematic - LUT + vignette + sparkles
  async function applyNorthPole(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions(['-noautorotate']) // Preserve original orientation
        .videoFilters([
          // Warm cinematic look
          'eq=brightness=0.08:saturation=1.4:contrast=1.15',
          'curves=preset=strong_contrast',
          // Vignette with warm colors
          'vignette=angle=PI/4:x=0.5:y=0.5',
          // Add sparkle effect (simulated with noise)
          'noise=alls=20:allf=t+u',
        ])
        .outputOptions([
          '-map', '0:v',
          '-map', '0:a:0',
          '-ignore_unknown',
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

  // Preset 3: Holiday Frame - Add Christmas garland border frame
  async function applyHolidayFrame(inputPath, outputPath, includeMusic = false) {
    return new Promise((resolve, reject) => {
      // Get video dimensions and metadata
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);
        
        const width = metadata.streams[0].width;
        const height = metadata.streams[0].height;
        
        // Check for rotation metadata and preserve it
        const rotation = metadata.streams[0].tags?.rotate || 
                        metadata.streams[0].side_data?.find(sd => sd.rotation)?.rotation || 
                        null;
        
        // Path to Christmas garland frame image
        const framePath = path.join(assetsDir, 'christmas-garland-frame.png');
        
        if (fs.existsSync(framePath)) {
          // Use garland image as overlay for all 4 sides
          const command = ffmpeg(inputPath);
          
          // Preserve original orientation - apply to input
          command.inputOptions(['-noautorotate']);
          
          // Add garland image as input
          command.input(framePath);
          
          // Get garland image dimensions to determine orientation
          ffmpeg.ffprobe(framePath, (err, garlandMetadata) => {
            if (err) {
              console.error('Error reading garland image:', err);
              return reject(err);
            }
            
            const garlandWidth = garlandMetadata.streams[0].width;
            const garlandHeight_img = garlandMetadata.streams[0].height;
            const isGarlandVertical = garlandHeight_img > garlandWidth;
            
            // Scale garland to video width, but keep it narrow (about 8% of video height for top/bottom)
            // You can adjust this percentage to make the garland narrower or wider
            const garlandHeightPercent = 0.20; // 8% of video height (adjust this value: 0.05 = 5%, 0.15 = 15%)
            const garlandHeight = Math.floor(height * garlandHeightPercent);
            
            console.log(`🎄 Garland image: ${garlandWidth}x${garlandHeight_img} (${isGarlandVertical ? 'vertical' : 'horizontal'})`);
            console.log(`🎄 Video: ${width}x${height}, Garland strip height: ${garlandHeight}`);
            
            // Process garlands for all 4 sides
            // Scale frame to match video width, but keep it narrow
            // We need to extract horizontal strips for top/bottom placement
            // IMPORTANT: Final strip must be horizontal (width > height) for top/bottom placement
            const filters = [
              // Apply color grading to main video and preserve rotation
              `[0:v]eq=brightness=0.03:saturation=1.2[v0]`,
            ];
            
            // ALWAYS create horizontal strips (wide x short) for top/bottom placement
            // Strategy: Scale garland to video WIDTH while maintaining aspect ratio, then crop height from center
            // This GUARANTEES width > height (horizontal strip) and prevents ugly stretching
            
            // Step 1: Rotate if needed, then scale to video WIDTH (maintains aspect ratio, no stretching)
            if (isGarlandVertical) {
              // Garland is vertical (tall): rotate 90° clockwise to make it horizontal
              // transpose=1 rotates 90° clockwise: tall becomes wide
              filters.push(`[1:v]transpose=1[garland_rotated]`);
              // Scale rotated garland to video WIDTH (maintains aspect ratio, height calculated automatically)
              filters.push(`[garland_rotated]scale=${width}:-1[garland_scaled]`);
            } else {
              // Garland is already horizontal (wide): scale to video WIDTH (maintains aspect ratio)
              // This preserves the garland's natural proportions - no ugly stretching!
              filters.push(`[1:v]scale=${width}:-1[garland_scaled]`);
            }
            
            // Step 2: Crop a horizontal strip from the CENTER vertically to avoid cutting branches
            // After scaling to width, garland_scaled has width=${width}, height is calculated
            // For 6193x2612 garland scaled to 1920 width: height becomes ~810 pixels
            // Crop from center: y = (input_height - output_height) / 2
            // This creates a horizontal strip: width=${width} > height=${garlandHeight}
            // CRITICAL: crop=WIDTH:HEIGHT where WIDTH (${width}) MUST be > HEIGHT (${garlandHeight})
            // Result: ${width}x${garlandHeight} = horizontal strip (WIDE x SHORT) for top/bottom
            filters.push(`[garland_scaled]crop=${width}:${garlandHeight}:0:'(in_h-${garlandHeight})/2'[garland_strip]`);
            
            // Verify strip dimensions are correct (this is just for logging, FFmpeg will process it)
            // After this filter, garland_strip should be ${width}x${garlandHeight} (horizontal)
            
            // DEBUG: Log expected dimensions
            console.log(`🎄 CRITICAL: garland_strip MUST be ${width}x${garlandHeight} (WIDE x SHORT)`);
            console.log(`🎄 If strip is ${garlandHeight}x${width} (SHORT x WIDE), it will appear on SIDES (WRONG!)`);
            
            // Verify: garland_strip should be ${width}x${garlandHeight} (horizontal: wide and short)
            // If it's appearing on sides, the strip is vertical (tall and narrow) - that's the bug
            
            // Create garlands for all 4 sides: top, bottom, left, right
            // Use same garland for all sides, flip bottom
            filters.push(`[garland_strip]split=4[garland_h1][garland_h2][garland_h3][garland_h4]`);
            filters.push(`[garland_h1]copy[garland_top]`);
            // Bottom: rotate 180 degrees (upside down) using hflip and vflip
            filters.push(`[garland_h2]hflip,vflip[garland_bottom]`);
            
            // Left and right: rotate horizontal strip 90° to make vertical strips
            filters.push(`[garland_h3]transpose=2[garland_left]`);
            filters.push(`[garland_h4]transpose=2,vflip[garland_right]`);
            
            // Calculate vertical strip width (same as horizontal strip height)
            // Use garlandHeight as the width for vertical strips
            
            // Overlay all 4 sides:
            // - Top: horizontal strip at (0, 0)
            // - Bottom: horizontal strip at (0, height-garlandHeight)
            // - Left: vertical strip at (0, 0) - will span full height
            // - Right: vertical strip at (width-garlandHeight, 0) - will span full height
            filters.push(`[v0][garland_top]overlay=0:0[v1]`);
            filters.push(`[v1][garland_bottom]overlay=0:${height - garlandHeight}[v2]`);
            filters.push(`[v2][garland_left]overlay=0:0[v3]`);
            filters.push(`[v3][garland_right]overlay=${width - garlandHeight}:0[v]`);
            
            console.log(`🎄 Expected garland strip: ${width}x${garlandHeight} (horizontal: WIDE x SHORT)`);
            console.log(`🎄 Overlay: top at (x=0, y=0), bottom at (x=0, y=${height - garlandHeight})`);
            console.log(`🎄 If garland appears on SIDES, the strip is VERTICAL (wrong!)`);
            console.log(`🎄 If garland appears on TOP/BOTTOM, the strip is HORIZONTAL (correct!)`);
            
            command.complexFilter(filters);
            
            command
              .outputOptions([
                '-map', '[v]',
                '-map', '0:a:0',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ignore_unknown'
              ])
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
              .on('error', (err, stdout, stderr) => {
                console.error('❌ FFmpeg error:', err);
                if (stderr) console.error('❌ FFmpeg stderr:', stderr);
                reject(err);
              })
              .run();
          }); // End of ffprobe callback
        } else {
          // Fallback to simple colored border if garland image not found
          console.log('⚠️  Christmas garland frame not found, using fallback border');
          ffmpeg(inputPath)
            .inputOptions(['-noautorotate']) // Preserve original orientation
            .videoFilters([
              // Draw Christmas-colored border (top and bottom only)
              'drawbox=x=0:y=0:w=iw:h=40:color=red@0.8:t=fill',
              'drawbox=x=0:y=ih-40:w=iw:h=40:color=green@0.8:t=fill',
              // Add warm glow
              'eq=brightness=0.03:saturation=1.2',
            ])
            .outputOptions([
              '-map', '0:v',
              '-map', '0:a:0',
              '-ignore_unknown',
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
        }
      });
    });
  }

  // Preset 4: Warm Glow - Simple warm color grading
  async function applyWarmGlow(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions(['-noautorotate']) // Preserve original orientation
        .videoFilters([
          'eq=brightness=0.05:saturation=1.3:contrast=1.1',
          'curves=preset=lighter',
        ])
        .outputOptions([
          '-map', '0:v',
          '-map', '0:a:0',
          '-ignore_unknown',
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

  // Main endpoint: Convert video to Christmas version
  app.post(
    '/convert-to-christmas',
    requireAuth,
    abuseProtectionMiddleware,
    upload.single('video'),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded' });
      }

      // Validate file size (500MB max)
      if (req.file.size > 500 * 1024 * 1024) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {}
        return res.status(400).json({ error: 'File size must be less than 500MB' });
      }

      // Validate video duration (20 seconds max)
      try {
        const metadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(req.file.path, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });

        const duration = metadata.format.duration;
        if (duration > 20) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {}
          return res.status(400).json({ 
            error: 'Video duration must be 20 seconds or less',
            duration: duration.toFixed(2)
          });
        }
      } catch (err) {
        console.error('Error checking video duration:', err);
        // Continue processing if we can't check duration
      }

      const { preset = 'snow_magic', includeMusic = false } = req.body;
      const inputPath = req.file.path;
      
      // Ensure output directory exists
      if (!fs.existsSync(videoOutputDir)) {
        fs.mkdirSync(videoOutputDir, { recursive: true });
      }
      
      // Shorten filename to avoid path length issues
      const shortId = req.file.filename.substring(0, 8);
      const timestamp = Date.now();
      const outputFileName = `xmas-${shortId}-${timestamp}.mp4`;
      const outputPath = path.join(videoOutputDir, outputFileName);
      
      console.log(`📁 Input: ${inputPath}`);
      console.log(`📁 Output: ${outputPath}`);

      try {
        console.log(`🎄 Processing video with preset: ${preset}`);

        let processedPath;
        switch (preset) {
          case 'snow_magic':
            processedPath = await applySnowMagic(inputPath, outputPath, includeMusic === 'true');
            break;
          case 'north_pole':
            processedPath = await applyNorthPole(inputPath, outputPath);
            break;
          case 'holiday_frame':
            processedPath = await applyHolidayFrame(inputPath, outputPath, includeMusic === 'true');
            break;
          case 'warm_glow':
            processedPath = await applyWarmGlow(inputPath, outputPath);
            break;
          default:
            processedPath = await applySnowMagic(inputPath, outputPath, false);
        }

        // Clean up input file
        try {
          fs.unlinkSync(inputPath);
          console.log('🗑️  Cleaned up input file');
        } catch (cleanupErr) {
          console.warn('⚠️  Could not delete input file:', cleanupErr);
        }

        await logUsage(req, '/convert-to-christmas');

        res.json({
          success: true,
          downloadUrl: `/generated_video/${outputFileName}`,
          filename: outputFileName,
          preset: preset,
        });
      } catch (err) {
        console.error('❌ Error processing Christmas video:', err);
        
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
          console.warn('⚠️  Error during cleanup:', cleanupErr);
        }

        res.status(500).json({ 
          error: 'Christmas video processing failed', 
          details: err.message 
        });
      }
    },
  );

  // Serve generated videos (already handled by videoService, but ensure it's available)
  app.use('/generated_video', express.static(videoOutputDir, {
    maxAge: '1d',
    etag: true,
    lastModified: true,
  }));
}

module.exports = { initializeChristmasVideoService };

