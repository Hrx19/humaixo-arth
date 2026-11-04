const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const sourcePath = process.argv[2];
const imagesDirectory = path.join(__dirname, 'assets', 'images');
const iconPath = path.join(imagesDirectory, 'icon.png');
const copies = ['splash-icon.png', 'android-icon-foreground.png'];

async function main() {
  if (!sourcePath) {
    throw new Error('Provide the source image path: node generate-icon.js <image-file>');
  }

  fs.mkdirSync(imagesDirectory, { recursive: true });
  await sharp(path.resolve(sourcePath))
    .resize(1024, 1024, {
      fit: 'contain',
      background: '#0f172a',
    })
    .png()
    .toFile(iconPath);
  for (const filename of copies) {
    fs.copyFileSync(iconPath, path.join(imagesDirectory, filename));
  }
  console.log(`Generated ${iconPath} and ${copies.join(', ')}`);
}

main().catch((error) => {
  console.error('Failed to generate app icons:', error);
  process.exitCode = 1;
});
