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

const router = express.Router();

// Ensure output folder exists
const outputDir = path.join(__dirname, '..', 'generated_img');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate logo (protected with abuse protection)
router.post(
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

module.exports = router;

