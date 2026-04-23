const sharp = require('sharp');
const fs = require('fs');

const svg = fs.readFileSync('icons/icon.svg');
const maskableSvg = Buffer.from(svg.toString().replace('rx="90"', 'rx="0"'));

async function generate() {
  await sharp(svg).resize(192, 192).png().toFile('icons/icon-192.png');
  console.log('icon-192.png 생성 완료');

  await sharp(svg).resize(512, 512).png().toFile('icons/icon-512.png');
  console.log('icon-512.png 생성 완료');

  await sharp(maskableSvg).resize(512, 512).png().toFile('icons/icon-maskable-512.png');
  console.log('icon-maskable-512.png 생성 완료');

  await sharp(svg).resize(180, 180).png().toFile('icons/apple-touch-icon.png');
  console.log('apple-touch-icon.png 생성 완료');
}

generate().catch(err => { console.error(err); process.exit(1); });
