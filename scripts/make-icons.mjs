// Erzeugt die App-Icons (public/icons/*.png): Gewölbebogen auf dunklem Stein.
// Aufruf: node scripts/make-icons.mjs (braucht den Chromium von Playwright)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const draw = (size, pad) => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.fillStyle = '#1c1814';
  c.fillRect(0, 0, size, size);
  c.save();
  const s = (size / 512) * (1 - 2 * pad);
  c.translate(size / 2, size / 2);
  c.scale(s, s);
  c.translate(-256, -256);
  // Steinfugen im Hintergrund
  c.strokeStyle = 'rgba(224,181,106,.12)';
  c.lineWidth = 6;
  for (let y = 40; y < 512; y += 64) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(512, y); c.stroke();
    for (let x = (y / 64) % 2 ? 0 : 64; x < 512; x += 128) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke(); }
  }
  // Bogen
  c.lineWidth = 48;
  c.strokeStyle = '#e0b56a';
  c.lineCap = 'butt';
  c.beginPath(); c.moveTo(110, 430); c.lineTo(110, 250); c.arc(256, 250, 146, Math.PI, 0); c.lineTo(402, 430); c.stroke();
  // Tor
  c.fillStyle = '#e0b56a';
  c.beginPath(); c.moveTo(186, 430); c.lineTo(186, 290); c.arc(256, 290, 70, Math.PI, 0); c.lineTo(326, 430); c.closePath(); c.fill();
  c.fillStyle = '#1c1814';
  c.fillRect(250, 280, 12, 150);
  c.beginPath(); c.arc(300, 360, 9, 0, Math.PI * 2); c.fill();
  // Boden
  c.fillStyle = '#e0b56a';
  c.fillRect(70, 430, 372, 26);
  c.restore();
  return cv.toDataURL('image/png');
};

const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad] of [['icon-180.png', 180, 0.06], ['icon-192.png', 192, 0.06], ['icon-512.png', 512, 0.06], ['icon-maskable-512.png', 512, 0.16]]) {
  const url = await p.evaluate(`(${draw})(${size}, ${pad})`);
  writeFileSync('public/icons/' + name, Buffer.from(url.split(',')[1], 'base64'));
  console.log('public/icons/' + name);
}
await b.close();
