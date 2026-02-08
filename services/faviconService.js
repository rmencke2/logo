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

// Font category mapping (shared with logo service)
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

// Helper function to get font path
function getFontPath(fontCategory, useBold = false) {
  const category = fontCategories[fontCategory] || fontCategories.modern;
  const fontFile = useBold ? category.bold : category.regular;
  return path.join(__dirname, '..', 'fonts', fontFile);
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

/**
 * Initialize favicon generation service
 * @param {express.Application} app - Express application instance
 */
function initializeFaviconService(app) {
  // Ensure output folder exists
  const outputDir = path.join(__dirname, '..', 'generated_img');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Generate favicon endpoint
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

        // Load font
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

        // Return paths to client
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

  // Generate favicon from logo endpoint
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
        const logoFilePath = path.join(__dirname, '..', logoPath.replace(/^\//, ''));
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
}

module.exports = { initializeFaviconService };

