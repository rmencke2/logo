// ================================
//  Logo Generation Utilities
// ================================

const path = require('path');
const { fontCategories } = require('../config/constants');

/**
 * Get the font file path for a given font category
 * @param {string} fontCategory - The font category (modern, serif, etc.)
 * @param {boolean} useBold - Whether to use the bold variant
 * @returns {string} The full path to the font file
 */
function getFontPath(fontCategory, useBold = false) {
  const category = fontCategories[fontCategory] || fontCategories.modern;
  const fontFile = useBold ? category.bold : category.regular;
  return path.join(__dirname, '..', 'fonts', fontFile);
}

/**
 * Generate SVG shape element based on shape type
 * @param {string} shape - Shape type: 'none', 'circle', 'square', 'rounded'
 * @param {number} width - Width of the shape
 * @param {number} height - Height of the shape
 * @param {string} bgColor - Background color (hex format)
 * @returns {string} SVG element string
 */
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

module.exports = {
  getFontPath,
  generateShape,
};

