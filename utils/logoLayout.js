// ================================
//  Logo layout
// ================================
//
// Pure geometry: given measured text, work out the canvas size and where each
// element sits. The content block (icon + text) is laid out first, then the
// canvas is sized around it, so the shape always contains the content.
// (Previously the canvas was sized to the text and the shape was fitted inside
// it, which pushed the name to the edge of circles and squares.)

const TEXT_GAP = 20; // between name and tagline
const ICON_GAP = 20; // between icon and text
const PADDING = 60; // content -> canvas edge
const SHAPE_INSET = 20; // must match generateShape()
const CIRCLE_MARGIN = 30; // content corner -> circle edge

/**
 * @param {object} p
 * @param {{width:number,height:number}} p.main     measured name
 * @param {{width:number,height:number}|null} p.tagline measured tagline
 * @param {number} p.iconSize  0 when there is no icon
 * @param {'none'|'left'|'top'} p.layout
 * @param {'none'|'circle'|'square'|'rounded'} p.shape
 * @returns {{width:number,height:number,name:object,tagline:object|null,icon:object|null}}
 *   name/tagline: { x, y, anchor }  icon: { x, y }  (all in canvas coordinates)
 */
function computeLogoLayout({ main, tagline, iconSize, layout, shape }) {
  const hasTagline = !!tagline;
  const hasIcon = iconSize > 0 && layout !== 'none';

  const textW = Math.max(main.width, hasTagline ? tagline.width : 0);
  const textH = main.height + (hasTagline ? TEXT_GAP + tagline.height : 0);

  // Content block, origin top-left. Text is centred on its own axis unless the
  // icon sits to its left, where left-aligned text reads better beside an icon.
  let cw, ch, name, tag, icon;

  if (hasIcon && layout === 'left') {
    cw = iconSize + ICON_GAP + textW;
    ch = Math.max(iconSize, textH);
    const tx = iconSize + ICON_GAP;
    const top = (ch - textH) / 2;
    icon = { x: iconSize / 2, y: ch / 2 };
    name = { x: tx, y: top + main.height / 2, anchor: 'left middle' };
    tag = hasTagline
      ? { x: tx, y: top + main.height + TEXT_GAP + tagline.height / 2, anchor: 'left middle' }
      : null;
  } else if (hasIcon && layout === 'top') {
    cw = Math.max(iconSize, textW);
    ch = iconSize + ICON_GAP + textH;
    const top = iconSize + ICON_GAP;
    icon = { x: cw / 2, y: iconSize / 2 };
    name = { x: cw / 2, y: top + main.height / 2, anchor: 'center middle' };
    tag = hasTagline
      ? { x: cw / 2, y: top + main.height + TEXT_GAP + tagline.height / 2, anchor: 'center middle' }
      : null;
  } else {
    cw = textW;
    ch = textH;
    icon = null;
    name = { x: cw / 2, y: main.height / 2, anchor: 'center middle' };
    tag = hasTagline
      ? { x: cw / 2, y: main.height + TEXT_GAP + tagline.height / 2, anchor: 'center middle' }
      : null;
  }

  // Canvas sized around the content.
  let width = cw + PADDING * 2;
  let height = ch + PADDING * 2;

  if (shape === 'circle') {
    // The content's corners must clear the circle, so size by its diagonal.
    const diameter = Math.hypot(cw, ch) + CIRCLE_MARGIN * 2;
    width = height = diameter + SHAPE_INSET * 2;
  } else if (shape === 'square') {
    width = height = Math.max(width, height);
  }

  width = Math.ceil(width);
  height = Math.ceil(height);

  const ox = (width - cw) / 2;
  const oy = (height - ch) / 2;
  const shift = (o) => (o ? { ...o, x: o.x + ox, y: o.y + oy } : null);

  return { width, height, name: shift(name), tagline: shift(tag), icon: shift(icon) };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function relativeLuminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours (1 to 21). */
function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

module.exports = { computeLogoLayout, escapeXml, contrastRatio };
