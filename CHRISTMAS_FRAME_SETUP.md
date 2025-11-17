# Christmas Garland Frame Setup

## Adding the Christmas Garland Border Image

To use the Christmas garland image as a border for the Holiday Frame preset:

1. **Save the image:**
   - Save the Christmas garland image as `christmas-garland-frame.png`
   - Recommended size: 1920x1080 or larger (will be scaled to match video dimensions)
   - Format: PNG with transparency (so the garland overlays on the video)

2. **Place the image:**
   - Create the directory if it doesn't exist: `mkdir -p assets/christmas`
   - Copy the image to: `assets/christmas/christmas-garland-frame.png`

3. **Verify:**
   - The Holiday Frame preset will automatically use this image when available
   - If the image is not found, it will fall back to a simple colored border

## Image Requirements

- **Format:** PNG (with transparency/alpha channel)
- **Recommended dimensions:** 1920x1080 or match your typical video resolution
- **Content:** Christmas garland/border that will overlay on videos
- **Transparency:** The center should be transparent so the video shows through

## Testing

After adding the image, test the Holiday Frame preset:
1. Upload a video (max 20 seconds or 500MB)
2. Select "Holiday Frame" preset
3. Process the video
4. The garland border should appear around your video

