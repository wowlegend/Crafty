const puppeteer = require('puppeteer');
const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'build')));
const server = app.listen(3030, async () => {
  console.log('Server started on http://localhost:3030');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--ignore-gpu-blocklist']
    });
    
    const page = await browser.newPage();
    
    const errors = [];
    const warnings = [];
    
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') errors.push(text);
      if (type === 'warning') warnings.push(text);
      console.log('[BROWSER ' + type.toUpperCase() + '] ' + text);
    });

    page.on('pageerror', err => {
      errors.push(err.toString());
      console.log('[BROWSER PAGE ERROR]', err.toString());
    });
    
    console.log('Navigating to game...');
    await page.goto('http://localhost:3030', { waitUntil: 'networkidle0', timeout: 30000 });
    
    console.log('Waiting for game to load and render...');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('Simulating player interactions...');
    // Click to lock pointer
    await page.mouse.click(500, 500);
    await new Promise(r => setTimeout(r, 1000));
    
    // Press WASD
    await page.keyboard.press('KeyW', { delay: 500 });
    await page.keyboard.press('Space', { delay: 100 });
    
    // Press F (Spell cast)
    await page.keyboard.press('KeyF', { delay: 200 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Switch spells
    await page.keyboard.press('Digit2');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.press('KeyF', { delay: 200 });
    
    // Open menus
    await page.keyboard.press('KeyE');
    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press('Escape');
    
    console.log('Waiting for chunks and physics to settle...');
    await new Promise(r => setTimeout(r, 5000));
    
    const result = {
      success: errors.length === 0,
      errors,
      warnings
    };
    
    console.log('\\n--- TEST RESULTS ---');
    console.log(JSON.stringify(result, null, 2));
    
    if (errors.length > 0) {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error('Test failed with exception:', e);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
    process.exit(process.exitCode || 0);
  }
});
