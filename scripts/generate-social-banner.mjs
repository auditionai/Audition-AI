import sharp from 'sharp';

const source = 'public/assets/audition-characters/desktop-hero-couple-v2.webp';
const output = 'public/assets/audition-ai-social-banner.webp';

const overlay = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080b18" stop-opacity="0.9"/>
      <stop offset="0.58" stop-color="#080b18" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#ff007f" stop-opacity="0.52"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect x="70" y="70" width="12" height="190" rx="6" fill="#ff007f"/>
  <text x="112" y="125" fill="#ffffff" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="2">AUDITION AI STUDIO</text>
  <text x="112" y="222" fill="#ffffff" font-family="Arial, sans-serif" font-size="64" font-weight="800">TẠO ẢNH &amp; VIDEO AI</text>
  <text x="112" y="286" fill="#ff7ab8" font-family="Arial, sans-serif" font-size="46" font-weight="800">NHÂN VẬT AUDITION 3D</text>
  <text x="112" y="350" fill="#f8fafc" font-family="Arial, sans-serif" font-size="25">Tạo ảnh đơn, couple, nhóm và video chuyển động</text>
  <text x="112" y="402" fill="#f8fafc" font-family="Arial, sans-serif" font-size="25">AI sáng tạo nhanh, sắc nét, dành cho cộng đồng Audition</text>
  <rect x="112" y="460" width="250" height="60" rx="30" fill="#ff007f"/>
  <text x="237" y="499" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="700">BẮT ĐẦU NGAY</text>
</svg>`);

await sharp(source)
  .resize(1200, 630, { fit: 'cover', position: 'center' })
  .composite([{ input: overlay }])
  .webp({ quality: 88 })
  .toFile(output);

console.log(`Generated ${output}`);
