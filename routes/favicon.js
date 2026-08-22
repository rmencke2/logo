// ================================
//  Favicon Generation Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const TextToSVG = require('text-to-svg');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../auth');
const { abuseProtectionMiddleware, logUsage } = require('../abuseProtection');
const { resolveGeneratedImgPath } = require('../utils/safePath');
const { fontCategories, FAVICON_SIZES } = require('../config/constants');
const { getFontPath, generateShape } = require('../utils/logoUtils');

const router = express.Router();

// Ensure output folder exists
const outputDir = path.join(__dirname, '..', 'generated_img');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate favicon (protected with abuse protection and authentication)
router.post(
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

      const safeName = `favicon-${text.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
      const generatedFiles = {};

      // Generate each size
      for (const { size, name } of FAVICON_SIZES) {
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
router.post(
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

      const resolved = resolveGeneratedImgPath(logoPath, path.join(__dirname, '..'));
      if (!resolved.ok) {
        return res.status(resolved.status || 400).json({ error: resolved.error });
      }
      const logoFilePath = resolved.filePath;

      const safeName = `favicon-from-logo-${Date.now()}`;
      const generatedFiles = {};

      // Generate each size from the logo
      for (const { size, name } of FAVICON_SIZES) {
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

module.exports = router;

