const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourcePng = path.join(__dirname, '../public/replyflow-r-logo.png');
const publicDir = path.join(__dirname, '../public');
const appDir = path.join(__dirname, '../src/app');

async function generateFavicons() {
  console.log('Generating favicons with dark navy square background...');

  try {
    // Create a function to generate favicon with dark navy background
    const generateFavicon = async (size, outputPath) => {
      // Create dark navy square background
      const background = Buffer.from(
        `<svg width="${size}" height="${size}">
          <rect width="${size}" height="${size}" fill="#0F172A"/>
        </svg>`
      );
      
      // Resize logo to fit within the square (70% of size, centered)
      const logoSize = Math.round(size * 0.7);
      const padding = Math.round((size - logoSize) / 2);
      
      const logoBuffer = await sharp(sourcePng)
        .resize(logoSize, logoSize)
        .png()
        .toBuffer();
      
      // Composite logo onto dark navy background
      await sharp(background)
        .composite([
          {
            input: logoBuffer,
            left: padding,
            top: padding
          }
        ])
        .png()
        .toFile(outputPath);
    };

    // Generate favicon-16x16.png
    await generateFavicon(16, path.join(publicDir, 'favicon-16x16.png'));
    console.log('✓ Generated favicon-16x16.png');

    // Generate favicon-32x32.png
    await generateFavicon(32, path.join(publicDir, 'favicon-32x32.png'));
    console.log('✓ Generated favicon-32x32.png');

    // Generate apple-touch-icon.png (180x180)
    await generateFavicon(180, path.join(publicDir, 'apple-touch-icon.png'));
    console.log('✓ Generated apple-touch-icon.png');

    // Generate icon-192.png
    await generateFavicon(192, path.join(publicDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // Generate icon-512.png
    await generateFavicon(512, path.join(publicDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    // Generate src/app/icon.png (512x512 for App Router)
    await generateFavicon(512, path.join(appDir, 'icon.png'));
    console.log('✓ Generated src/app/icon.png');

    // Generate favicon.ico (48x48)
    await generateFavicon(48, path.join(publicDir, 'favicon.ico'));
    console.log('✓ Generated favicon.ico (PNG format for browser compatibility)');

    console.log('\n✅ All favicons generated successfully!');
  } catch (error) {
    console.error('Error generating favicons:', error);
    process.exit(1);
  }
}

generateFavicons();
