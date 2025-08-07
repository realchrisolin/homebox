const fs = require('fs');
const path = require('path');
const https = require('https');

// Check if fonts already exist
function fontsAlreadyExist() {
  const fontsDir = path.resolve(process.cwd(), 'public', 'fonts');
  if (!fs.existsSync(fontsDir)) return false;
  
  const files = fs.readdirSync(fontsDir);
  const fontFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.ttf', '.otf', '.woff', '.woff2'].includes(ext);
  });
  
  return fontFiles.length >= 4; // At least 4 font files (basic CJK coverage)
}

// Font configurations for different languages
const FONT_CONFIGS = {
  'zh-CN': {
    name: 'Noto Sans SC',
    weights: ['400', '700'],
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap'
  },
  'zh-TW': {
    name: 'Noto Sans TC',
    weights: ['400', '700'],
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;700&display=swap'
  },
  'ja': {
    name: 'Noto Sans JP',
    weights: ['400', '700'],
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap'
  },
  'ko': {
    name: 'Noto Sans KR',
    weights: ['400', '700'],
    cssUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap'
  }
};

// Function to fetch CSS and extract font URLs
async function fetchFontUrls(cssUrl) {
  return new Promise((resolve, reject) => {
    https.get(cssUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const fontUrls = [];
        const urlMatches = data.match(/url\(([^)]+)\)/g);
        if (urlMatches) {
          urlMatches.forEach(match => {
            const url = match.replace(/url\(([^)]+)\)/, '$1').replace(/['"]/g, '');
            fontUrls.push(url);
          });
        }
        resolve(fontUrls);
      });
    }).on('error', reject);
  });
}

// Function to download a file
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

// Font file signatures (magic numbers)
const FONT_SIGNATURES = {
  // TTF fonts start with these bytes
  TTF: [0x00, 0x01, 0x00, 0x00], // TrueType
  TTF_ALT: [0x74, 0x72, 0x75, 0x65], // 'true' - another TTF signature
  
  // OTF fonts start with these bytes
  OTF: [0x4F, 0x54, 0x54, 0x4F], // 'OTTO'
  
  // WOFF fonts start with these bytes
  WOFF: [0x77, 0x4F, 0x46, 0x46], // 'wOFF'
  
  // WOFF2 fonts start with these bytes
  WOFF2: [0x77, 0x4F, 0x46, 0x32] // 'wOF2'
};

function detectFontType(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const header = Array.from(buffer.slice(0, 4));
    
    // Check each signature
    for (const [type, signature] of Object.entries(FONT_SIGNATURES)) {
      if (arraysEqual(header, signature)) {
        return type === 'TTF_ALT' ? 'TTF' : type;
      }
    }
    
    // If no match, try to guess from content
    const headerStr = buffer.slice(0, 12).toString('ascii', 0, 4);
    if (headerStr.includes('OTTO')) return 'OTF';
    if (headerStr.includes('wOFF')) return 'WOFF';
    if (headerStr.includes('wOF2')) return 'WOFF2';
    
    return 'UNKNOWN';
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return 'ERROR';
  }
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

function getCorrectExtension(fontType) {
  switch (fontType) {
    case 'TTF': return '.ttf';
    case 'OTF': return '.otf';
    case 'WOFF': return '.woff';
    case 'WOFF2': return '.woff2';
    default: return null;
  }
}

function processFont(filePath) {
  const fontType = detectFontType(filePath);
  const correctExt = getCorrectExtension(fontType);
  
  if (!correctExt) {
    console.log(`❌ ${path.basename(filePath)}: Unknown font type (${fontType})`);
    return false;
  }
  
  const currentExt = path.extname(filePath);
  const baseName = path.basename(filePath, currentExt);
  const dir = path.dirname(filePath);
  const correctPath = path.join(dir, baseName + correctExt);
  
  if (currentExt === correctExt) {
    console.log(`✅ ${path.basename(filePath)}: Already has correct extension (${fontType})`);
    return true;
  }
  
  try {
    fs.renameSync(filePath, correctPath);
    console.log(`🔄 ${path.basename(filePath)} → ${baseName}${correctExt} (${fontType})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to rename ${filePath}:`, error.message);
    return false;
  }
}

// Download fonts function
async function downloadFonts() {
  console.log('📥 Starting font download process...');
  
  // Create fonts directory if it doesn't exist - use more robust path resolution
  const fontsDir = path.resolve(process.cwd(), 'public', 'fonts');
  console.log(`📁 Target fonts directory: ${fontsDir}`);
  
  if (!fs.existsSync(fontsDir)) {
    console.log(`📁 Creating fonts directory: ${fontsDir}`);
    fs.mkdirSync(fontsDir, { recursive: true });
  }
  
  for (const [locale, config] of Object.entries(FONT_CONFIGS)) {
    console.log(`\nProcessing ${config.name} for locale ${locale}...`);
    
    try {
      // Fetch font URLs from Google Fonts CSS
      const fontUrls = await fetchFontUrls(config.cssUrl);
      console.log(`Found ${fontUrls.length} font files`);
      
      for (let i = 0; i < fontUrls.length; i++) {
        const url = fontUrls[i];
        const weight = config.weights[i] || '400';
        const filename = `${config.name.replace(/\s+/g, '')}-${weight}`;
        
        // Download font file (keep original extension from URL)
        const urlExt = path.extname(new URL(url).pathname) || '.ttf';
        const fontPath = path.join(fontsDir, `${filename}${urlExt}`);
        console.log(`Downloading ${url}...`);
        await downloadFile(url, fontPath);
      }
      
      console.log(`✓ Completed ${config.name}`);
    } catch (error) {
      console.error(`✗ Failed to process ${config.name}:`, error.message);
    }
  }
  
  console.log('\nFont download completed!');
}

function main() {
  if (fontsAlreadyExist()) {
    console.log('✅ Fonts already exist, skipping download and sanitization');
    return;
  }
  
  console.log('🔍 Fonts not found, downloading and sanitizing...');
  
  // First download fonts
  downloadFonts().then(() => {
    // Then sanitize them
    const fontsDir = path.resolve(process.cwd(), 'public', 'fonts');
    
    if (!fs.existsSync(fontsDir)) {
      console.log('📁 Fonts directory not found after download');
      return;
    }
    
    const files = fs.readdirSync(fontsDir);
    const fontFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.ttf', '.otf', '.woff', '.woff2'].includes(ext);
    });
    
    if (fontFiles.length === 0) {
      console.log('📁 No font files found to sanitize');
      return;
    }
    
    // Check if fonts are already properly named
    const needsSanitization = fontFiles.some(file => {
      const actualType = detectFontType(path.join(fontsDir, file));
      const currentExt = path.extname(file).toLowerCase();
      const correctExt = getCorrectExtension(actualType);
      return correctExt && currentExt !== correctExt;
    });
    
    if (!needsSanitization) {
      console.log('✅ Font files already properly sanitized');
    } else {
      console.log('🔍 Detecting and sanitizing font files...\n');
      
      // Re-read files for processing (already checked above)
      const allFiles = fs.readdirSync(fontsDir);
      const processFontFiles = allFiles.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.ttf', '.otf', '.woff', '.woff2'].includes(ext);
      });
      
      let processed = 0;
      
      processFontFiles.forEach(file => {
        const filePath = path.join(fontsDir, file);
        const success = processFont(filePath);
        if (success) processed++;
      });
      
      console.log(`\n✨ Processed ${processed}/${processFontFiles.length} font files`);
    }
    
    // Update the font config paths in pdfFonts.ts
    console.log('\n📝 Updating font configuration...');
    updateFontConfig();
    
    // Copy fonts to backend directory for Go labelmaker
    console.log('\n📋 Copying fonts to backend directory...');
    copyFontsToBackend();
  }).catch(error => {
    console.error('❌ Font download failed:', error);
  });
}

function updateFontConfig() {
  const pdfFontsPath = path.resolve(process.cwd(), 'utils', 'pdfFonts.ts');
  
  try {
    let content = fs.readFileSync(pdfFontsPath, 'utf8');
    
    // Update file extensions in the FONT_CONFIGS
    content = content.replace(/\/fonts\/([^'"]+)\.woff/g, (match, basename) => {
      const fontPath = path.resolve(process.cwd(), 'public', 'fonts', basename);
      
      // Check what files actually exist
      const possibleExts = ['.ttf', '.otf', '.woff2', '.woff'];
      for (const ext of possibleExts) {
        if (fs.existsSync(fontPath + ext)) {
          return `/fonts/${basename}${ext}`;
        }
      }
      
      return match; // Keep original if no file found
    });
    
    fs.writeFileSync(pdfFontsPath, content);
    console.log('✅ Updated pdfFonts.ts configuration');
  } catch (error) {
    console.error('❌ Failed to update pdfFonts.ts:', error.message);
  }
}

function copyFontsToBackend() {
  const frontendFontsDir = path.resolve(process.cwd(), 'public', 'fonts');
  
  // Determine backend path based on environment
  // In Docker: working directory is /app, so backend is at /app/backend/pkgs/labelmaker/fonts
  // In local dev: working directory is frontend/, so backend is at ../backend/pkgs/labelmaker/fonts
  const isDocker = process.cwd().startsWith('/app');
  const backendFontsDir = isDocker
    ? path.resolve('/app', 'backend', 'pkgs', 'labelmaker', 'fonts')
    : path.resolve(process.cwd(), '..', 'backend', 'pkgs', 'labelmaker', 'fonts');
  
  console.log(`📁 Frontend fonts directory: ${frontendFontsDir}`);
  console.log(`📁 Backend fonts directory: ${backendFontsDir}`);
  console.log(`📁 Environment: ${isDocker ? 'Docker' : 'Local development'}`);
  
  try {
    // Create backend fonts directory if it doesn't exist
    if (!fs.existsSync(backendFontsDir)) {
      fs.mkdirSync(backendFontsDir, { recursive: true });
    }
    
    // Create copies of the CJK fonts with the expected names for Go embedding
    const fontsToFind = [
      { pattern: /NotoSansSC-400\.(ttf|otf)$/, target: 'NotoSansCJK-Regular.ttf' },
      { pattern: /NotoSansSC-700\.(ttf|otf)$/, target: 'NotoSansCJK-Bold.ttf' }
    ];
    
    const files = fs.readdirSync(frontendFontsDir);
    
    for (const { pattern, target } of fontsToFind) {
      const sourceFile = files.find(file => pattern.test(file));
      if (sourceFile) {
        const sourcePath = path.join(frontendFontsDir, sourceFile);
        
        // Create copy in frontend directory with expected name
        const frontendTargetPath = path.join(frontendFontsDir, target);
        fs.copyFileSync(sourcePath, frontendTargetPath);
        console.log(`✅ Created frontend copy: ${sourceFile} → ${target}`);
        
        // Copy to backend directory for Go embedding
        const backendTargetPath = path.join(backendFontsDir, target);
        fs.copyFileSync(sourcePath, backendTargetPath);
        console.log(`✅ Copied to backend: ${sourceFile} → ${target}`);
      } else {
        console.log(`⚠️  Could not find font matching pattern: ${pattern}`);
      }
    }
    
    console.log('✅ Backend font copying completed');
  } catch (error) {
    console.error('❌ Failed to copy fonts to backend:', error.message);
  }
}

if (require.main === module) {
  main();
}