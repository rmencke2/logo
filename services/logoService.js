// ================================
//  Logo Generation Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const TextToSVG = require('text-to-svg');
const { body, validationResult } = require('express-validator');
const { abuseProtectionMiddleware, logUsage } = require('../abuseProtection');
const { fontCategories, styles } = require('../config/constants');
const { getFontPath, generateShape } = require('../utils/logoUtils');
const { computeLogoLayout, escapeXml, contrastRatio } = require('../utils/logoLayout');
const { hasIcon, iconMarkup } = require('../utils/icons');

/**
 * Initialize logo generation service
 * @param {express.Application} app - Express application instance
 */
function initializeLogoService(app) {
  // Ensure output folder exists
  const outputDir = path.join(__dirname, '..', 'generated_img');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Generate logo endpoint
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
      body('icon').optional({ checkFalsy: true }).isString().isLength({ max: 32 }),
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

        // Determine font category
        let finalFontCategory = fontCategory;
        if (!finalFontCategory) {
          const styleConfig = styles[style.toLowerCase()] || styles.minimal;
          finalFontCategory = styleConfig.fontCategory || 'modern';
        }

        // Load font
        const fontPath = getFontPath(finalFontCategory, false);
        if (!fs.existsSync(fontPath)) {
          console.error(`❌ Font not found at: ${fontPath}`);
          return res.status(400).json({ error: 'Font not found' });
        }

        console.log(`✅ Font loaded: ${fontPath}`);
        const textToSVG = TextToSVG.loadSync(fontPath);

        // Measure text, then lay everything out around it
        const mainTextSize = 120;
        const taglineSize = 60;
        const main = textToSVG.getMetrics(name, { fontSize: mainTextSize });
        const tag = tagline ? textToSVG.getMetrics(tagline, { fontSize: taglineSize }) : null;
        const iconSize = icon ? 100 : 0;

        const geo = computeLogoLayout({ main, tagline: tag, iconSize, layout, shape });
        const { width, height } = geo;
        console.log(`📏 Dimensions: width=${width}, height=${height}`);

        // Generate text paths
        const mainTextPath = textToSVG.getPath(name, {
          x: geo.name.x,
          y: geo.name.y,
          fontSize: mainTextSize,
          anchor: geo.name.anchor,
          attributes: { fill: fontColor },
        });

        let taglinePath = '';
        if (tagline && geo.tagline) {
          taglinePath = textToSVG.getPath(tagline, {
            x: geo.tagline.x,
            y: geo.tagline.y,
            fontSize: taglineSize,
            anchor: geo.tagline.anchor,
            attributes: { fill: fontColor, opacity: '0.8' },
          });
        }

        // Icon: a named vector icon is drawn as paths in the text colour. Anything
        // else is treated as legacy emoji text, which is escaped because it is user
        // input going into markup (and renders only if the host has an emoji font).
        let iconPath = '';
        if (icon && geo.icon) {
          iconPath = hasIcon(icon)
            ? iconMarkup(icon, geo.icon.x, geo.icon.y, iconSize, fontColor)
            : `<text x="${geo.icon.x}" y="${geo.icon.y}" font-size="${iconSize}" text-anchor="middle" dominant-baseline="middle" fill="${fontColor}">${escapeXml(icon)}</text>`;
        }

        // Shape background
        const shapeSvg = generateShape(shape, width, height, bgColor);

        // Build SVG
        const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        ${shapeSvg}
        ${iconPath}
        ${mainTextPath}
        ${taglinePath}
      </svg>
    `;

        // Save files
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

        // Low contrast is reported, not silently corrected: the colours are the user's choice.
        const warnings = [];
        if (shape !== 'none' && contrastRatio(fontColor, bgColor) < 3) {
          warnings.push('Text and background colours have low contrast and may be hard to read.');
        }

        res.json({
          svgPath: `/generated_img/${safeName}.svg`,
          pngPath: `/generated_img/${safeName}.png`,
          usageLimits: req.usageLimits,
          ...(warnings.length ? { warnings } : {}),
        });
      } catch (err) {
        console.error('❌ Error generating logo:', err);
        res.status(500).json({ error: 'Logo generation failed', details: err.message });
      }
    },
  );
}

module.exports = { initializeLogoService };
