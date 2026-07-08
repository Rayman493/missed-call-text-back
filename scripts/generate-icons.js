const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '../public/icons/replyflow-r-logo-smaller.png');
const publicPath = path.join(__dirname, '../public');
const appPath = path.join(__dirname, '../src/app');

// Icon sizes to generate
const sizes = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon.png', size: 512, dest: appPath },
];

async function generateIcons() {
  console.log('Generating icons from:', sourcePath);
  
  // Check if source file exists
  if (!fs.existsSync(sourcePath)) {
    console.error('Source file not found:', sourcePath);
    process.exit(1);
  }

  for (const { name, size, dest } of sizes) {
    const outputPath = path.join(dest || publicPath, name);
    
    try {
      await sharp(sourcePath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Generated ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`✗ Error generating ${name}:`, error.message);
    }
  }

  // Generate favicon.ico (contains 16x16 and 32x32)
  try {
    const faviconPath = path.join(publicPath, 'favicon.ico');
    const icon16 = await sharp(sourcePath).resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const icon32 = await sharp(sourcePath).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    
    // For favicon.ico, we'll use a simple approach - just use the 32x32 as favicon.ico
    // (proper .ico generation requires additional libraries)
    await sharp(sourcePath)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(faviconPath);
    
    console.log('✓ Generated favicon.ico (32x32)');
  } catch (error) {
    console.error('✗ Error generating favicon.ico:', error.message);
  }

  console.log('\nIcon generation complete!');
}

generateIcons().catch(console.error);
