// ================================
//  Logo Generator Server
// ================================

// --- Imports ---
const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const TextToSVG = require('text-to-svg');
const { body, validationResult } = require('express-validator');

require('dotenv').config();

const app = express();

// Security middleware
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet());
// Rate limit: max 100 requests per 15 minutes per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const PORT = process.env.PORT || 4000;

// Structured JSON logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: Date.now() - start,
    };
    console.log(JSON.stringify(logEntry));
  });
  next();
});

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/generated_img',
  express.static(path.join(__dirname, 'generated_img')),
);

// --- Ensure output folder exists ---
const outputDir = path.join(__dirname, 'generated_img');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// --- Font style mapping ---
const styles = {
  modern: {
    font: 'Montserrat/static/Montserrat-Regular.ttf',
    defaultColor: '#2e7d32',
  },
  playful: { font: 'Pacifico/Pacifico-Regular.ttf', defaultColor: '#f57c00' },
  minimal: { font: 'Poppins/Poppins-Regular.ttf', defaultColor: '#212121' },
  digital: {
    font: 'Bitcount_Prop_Single/static/BitcountPropSingle-Regular.ttf',
    defaultColor: '#212121',
  },
  handwritten: {
    font: 'Caveat/static/Caveat-Regular.ttf',
    defaultColor: '#5d4037',
  },
};

// --- Routes ---

// Serve index.html
app.get('/', (req, res) => {
  console.log('🌐 Serving index.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Generate logo
app.post(
  '/generate-logo',
  [
    body('name').isString().notEmpty(),
    body('style').isString().notEmpty().isIn(Object.keys(styles)),
    body('fontColor').matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
    body('bgColor').matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { name, style, fontColor, bgColor } = req.body;
      console.log(`🎯 Incoming Request:
   ➡ Text: ${name}
   ➡ Style: ${style}
   ➡ Font Color: ${fontColor}
   ➡ Background Color: ${bgColor}`);

      // --- Load font ---
      const styleConfig = styles[style.toLowerCase()] || styles.modern;
      const fontPath = path.join(__dirname, 'fonts', styleConfig.font);

      if (!fs.existsSync(fontPath)) {
        console.error(`❌ Font not found at: ${fontPath}`);
        return res.status(400).json({ error: 'Font not found' });
      }

      console.log(`✅ Font loaded: ${fontPath}`);
      const textToSVG = TextToSVG.loadSync(fontPath);

      // --- Calculate text metrics ---
      const metrics = textToSVG.getMetrics(name, { fontSize: 120 });
      const width = metrics.width + 100; // padding
      const height = metrics.height + 100; // padding

      console.log(
        `📏 Metrics: width=${metrics.width}, height=${metrics.height}`,
      );

      // --- Generate text path ---
      const svgText = textToSVG.getPath(name, {
        x: width / 2,
        y: height / 2,
        fontSize: 120,
        anchor: 'center middle',
        attributes: { fill: fontColor },
      });

      // --- Build SVG ---
      const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${bgColor}" />
        ${svgText}
      </svg>
    `;

      // --- Save files ---
      const safeName = `${name}-${style}-${Date.now()}`;
      const svgPathFile = path.join(outputDir, `${safeName}.svg`);
      const pngPathFile = path.join(outputDir, `${safeName}.png`);

      fs.writeFileSync(svgPathFile, svg);
      console.log(`💾 SVG saved: ${svgPathFile}`);

      await sharp(Buffer.from(svg)).png().toFile(pngPathFile);
      console.log(`💾 PNG saved: ${pngPathFile}`);

      // --- Return paths to client ---
      res.json({
        svgPath: `/generated_img/${safeName}.svg`,
        pngPath: `/generated_img/${safeName}.png`,
      });
    } catch (err) {
      console.error('❌ Error generating logo:', err);
      res.status(500).json({ error: 'Logo generation failed' });
    }
  },
);

// Global error handling middleware
/* eslint-disable-next-line no-unused-vars */
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
});
