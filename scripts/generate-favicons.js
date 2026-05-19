const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourcePng = path.join(__dirname, '../public/replyflow-r-logo.png');
const publicDir = path.join(__dirname, '../public');
const appDir = path.join(__dirname, '../src/app');

async function generateFavicons() {
  console.log('Generating favicons from PNG...');

  try {
    // Generate favicon-16x16.png
    await sharp(sourcePng)
      .resize(16, 16)
      .png()
      .toFile(path.join(publicDir, 'favicon-16x16.png'));
    console.log('✓ Generated favicon-16x16.png');

    // Generate favicon-32x32.png
    await sharp(sourcePng)
      .resize(32, 32)
      .png()
      .toFile(path.join(publicDir, 'favicon-32x32.png'));
    console.log('✓ Generated favicon-32x32.png');

    // Generate apple-touch-icon.png (180x180)
    await sharp(sourcePng)
      .resize(180, 180)
      .png()
      .toFile(path.join(publicDir, 'apple-touch-icon.png'));
    console.log('✓ Generated apple-touch-icon.png');

    // Generate icon-192.png
    await sharp(sourcePng)
      .resize(192, 192)
      .png()
      .toFile(path.join(publicDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // Generate icon-512.png
    await sharp(sourcePng)
      .resize(512, 512)
      .png()
      .toFile(path.join(publicDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    // Generate src/app/icon.png (512x512 for App Router)
    await sharp(sourcePng)
      .resize(512, 512)
      .png()
      .toFile(path.join(appDir, 'icon.png'));
    console.log('✓ Generated src/app/icon.png');

    // Generate favicon.ico (contains 16x16, 32x32, 48x48)
    const sizes = [16, 32, 48];
    const icoBuffers = await Promise.all(
      sizes.map(size =>
        sharp(sourcePng)
          .resize(size, size)
          .png()
          .toBuffer()
      )
    );

    // For favicon.ico, we need to create a proper ICO file
    // Sharp doesn't directly support ICO output, so we'll use the largest PNG as favicon.ico
    // Browsers will accept PNG as favicon.ico in modern browsers
    await sharp(sourcePng)
      .resize(48, 48)
      .png()
      .toFile(path.join(publicDir, 'favicon.ico'));
    console.log('✓ Generated favicon.ico (PNG format for browser compatibility)');

    console.log('\n✅ All favicons generated successfully!');
  } catch (error) {
    console.error('Error generating favicons:', error);
    process.exit(1);
  }
}

generateFavicons();
