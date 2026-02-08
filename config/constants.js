// ================================
//  Shared Constants
// ================================

// Font category mapping
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

// Style mapping (for default behavior)
const styles = {
  modern: {
    fontCategory: 'modern',
    defaultColor: '#2e7d32',
  },
  playful: {
    fontCategory: 'handwritten',
    defaultColor: '#f57c00',
  },
  minimal: {
    fontCategory: 'modern',
    defaultColor: '#212121',
  },
  digital: {
    fontCategory: 'retro',
    defaultColor: '#212121',
  },
  handwritten: {
    fontCategory: 'handwritten',
    defaultColor: '#5d4037',
  },
  vintage: {
    fontCategory: 'serif',
    defaultColor: '#8B4513',
  },
  luxury: {
    fontCategory: 'elegant',
    defaultColor: '#1a1a1a',
  },
  tech: {
    fontCategory: 'modern',
    defaultColor: '#0066cc',
  },
  organic: {
    fontCategory: 'handwritten',
    defaultColor: '#4a7c59',
  },
  corporate: {
    fontCategory: 'modern',
    defaultColor: '#1a1a1a',
  },
};

// Favicon sizes (standard sizes)
const FAVICON_SIZES = [
  { size: 16, name: 'favicon-16x16' },
  { size: 32, name: 'favicon-32x32' },
  { size: 48, name: 'favicon-48x48' },
  { size: 180, name: 'apple-touch-icon' },
  { size: 192, name: 'android-chrome-192x192' },
  { size: 512, name: 'android-chrome-512x512' },
];

module.exports = {
  fontCategories,
  styles,
  FAVICON_SIZES,
};

