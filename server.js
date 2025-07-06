const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB setup
mongoose.connect('mongodb://localhost:27017/spaceman', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
const Multiplier = mongoose.model('Multiplier', {
  value: Number,
  createdAt: { type: Date, default: Date.now }
});

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('✅ Frontend terhubung');
});

// Ambil data multiplier terakhir
async function getLastN(n = 10) {
  const latest = await Multiplier.find().sort({ createdAt: -1 }).limit(n);
  return latest.reverse(); // dari lama ke terbaru
}

// Scrape multiplier dari Dosis77
async function scrapeLatestMultiplier() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  try {
    await page.goto('https://dosis77a.com/game/spaceman', { waitUntil: 'networkidle2' });
    await page.waitForSelector('.multiplier', { timeout: 10000 });
    const multiplierText = await page.$eval('.multiplier', el => el.textContent);
    const multiplier = parseFloat(multiplierText.replace('x', ''));
    await browser.close();
    return multiplier;
  } catch (err) {
    console.error('❌ Gagal scrape multiplier:', err.message);
    await browser.close();
    return null;
  }
}

// Prediksi AI moving average
function predictNext(data) {
  if (data.length === 0) return '0.00';
  const sum = data.reduce((a, b) => a + b.value, 0);
  const avg = sum / data.length;
  return avg.toFixed(2);
}

// Proses otomatis setiap 4 detik
setInterval(async () => {
  const current = await scrapeLatestMultiplier();
  if (!current) return;

  // Simpan ke database
  await Multiplier.create({ value: current });

  // Prediksi AI
  const last10 = await getLastN(10);
  const prediction = predictNext(last10);

  // Kirim ke frontend
  io.emit('newData', {
    value: current,
    predicted: prediction
  });

  console.log(`🎯 ${current}x | Prediksi selanjutnya: ${prediction}x`);
}, 4000);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running di http://localhost:${PORT}`);
});