const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const imagesDirectory = path.join(__dirname, 'assets', 'images');
const iconPath = path.join(imagesDirectory, 'icon.png');
const copies = ['splash-icon.png', 'android-icon-foreground.png'];

const svg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="background" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#10b981"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#background)"/>
    <path
      d="M302 710V314M722 710V314M302 512H722M378 638L486 530L566 590L700 414"
      fill="none"
      stroke="#ffffff"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="58"
    />
    <path
      d="M610 414H700V504"
      fill="none"
      stroke="#ffffff"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="58"
    />
  </svg>
`);

async function main() {
  fs.mkdirSync(imagesDirectory, { recursive: true });
  await sharp(svg).png().toFile(iconPath);
  for (const filename of copies) {
    fs.copyFileSync(iconPath, path.join(imagesDirectory, filename));
  }
  console.log(`Generated ${iconPath} and ${copies.join(', ')}`);
}

main().catch((error) => {
  console.error('Failed to generate app icons:', error);
  process.exitCode = 1;
});
