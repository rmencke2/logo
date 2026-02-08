// ================================
//  Multer Configuration
// ================================

const multer = require('multer');
const path = require('path');

// Video output directory
const videoOutputDir = path.join(__dirname, '..', 'generated_video');

// Ensure video output directory exists
const fs = require('fs');
if (!fs.existsSync(videoOutputDir)) {
  fs.mkdirSync(videoOutputDir, { recursive: true });
}

// Configure multer for AVI files only
const upload = multer({
  dest: videoOutputDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept AVI files
    if (file.mimetype === 'video/x-msvideo' || file.originalname.toLowerCase().endsWith('.avi')) {
      cb(null, true);
    } else {
      cb(new Error('Only AVI files are allowed'), false);
    }
  },
});

// Configure multer for video to GIF conversion (accepts multiple video formats)
const uploadVideo = multer({
  dest: videoOutputDir,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept common video formats and GIFs
    const videoMimeTypes = [
      'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv',
      'video/webm', 'video/x-matroska', 'video/3gpp', 'video/x-flv',
      'image/gif' // Also accept GIFs for meme generation
    ];
    const videoExtensions = ['.mp4', '.avi', '.mov', '.wmv', '.webm', '.mkv', '.3gp', '.flv', '.gif'];
    const hasValidMimeType = videoMimeTypes.includes(file.mimetype);
    const hasValidExtension = videoExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (hasValidMimeType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only video files and GIFs are allowed (MP4, AVI, MOV, WebM, GIF, etc.)'), false);
    }
  },
});

module.exports = {
  upload,
  uploadVideo,
  videoOutputDir,
};

