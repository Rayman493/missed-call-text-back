const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourcePng = path.join(__dirname, '../public/replyflow-r-logo.png');
const publicDir = path.join(__dirname, '../public');
const appDir = path.join(__dirname, '../src/app');

async function generateFavicons() {
  console.log('Generating favicons from PNG with dark navy background...');

  try {
    // Create a function to add dark navy background to the logo
    const addDarkBackground = async (size, outputPath) => {
      const logoSize = Math.round(size * 0.7);
      const padding = Math.round(size * 0.15);
      await sharp(sourcePng)
        .resize(logoSize, logoSize)
        .extend({
          top: padding,
          left: padding,
          bottom: padding,
          right: padding,
          background: '#0F172A'
        })
        .toFile(outputPath);
    };

    // Generate favicon-16x16.png
    await addDarkBackground(16, path.join(publicDir, 'favicon-16x16.png'));
    console.log('✓ Generated favicon-16x16.png');

    // Generate favicon-32x32.png
    await addDarkBackground(32, path.join(publicDir, 'favicon-32x32.png'));
    console.log('✓ Generated favicon-32x32.png');

    // Generate apple-touch-icon.png (180x180)
    await addDarkBackground(180, path.join(publicDir, 'apple-touch-icon.png'));
    console.log('✓ Generated apple-touch-icon.png');

    // Generate icon-192.png
    await addDarkBackground(192, path.join(publicDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // Generate icon-512.png
    await addDarkBackground(512, path.join(publicDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    // Generate src/app/icon.png (512x512 for App Router)
    await addDarkBackground(512, path.join(appDir, 'icon.png'));
    console.log('✓ Generated src/app/icon.png');

    // Generate favicon.ico (48x48)
    await addDarkBackground(48, path.join(publicDir, 'favicon.ico'));
    console.log('✓ Generated favicon.ico (PNG format for browser compatibility)');

    console.log('\n✅ All favicons generated successfully!');
  } catch (error) {
    console.error('Error generating favicons:', error);
    process.exit(1);
  }
}

generateFavicons();
