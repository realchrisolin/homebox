import jsPDF from 'jspdf';

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

export interface FontInfo {
  name: string;
  data: string; // base64 encoded font data
  weight: string;
}

export class PDFFontManager {
  private loadedFonts: Map<string, FontInfo> = new Map();

  // Convert ArrayBuffer to base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  // Check if local font file exists and load it
  private async tryLoadLocalFont(locale: string, weight: string): Promise<string | null> {
    const config = FONT_CONFIGS[locale as keyof typeof FONT_CONFIGS];
    if (!config) return null;

    const baseName = config.name.replace(/\s+/g, '');
    const possiblePaths = [
      `/fonts/${baseName}-${weight}.ttf`,
      `/fonts/${baseName}-${weight}.otf`,
      `/fonts/${baseName}-${weight}.woff2`,
      `/fonts/${baseName}-${weight}.woff`
    ];

    for (const fontPath of possiblePaths) {
      try {
        const response = await fetch(fontPath, { method: 'HEAD' });
        if (response.ok) {
          console.log(`Found local font: ${fontPath}`);
          const fontResponse = await fetch(fontPath);
          const buffer = await fontResponse.arrayBuffer();
          return this.arrayBufferToBase64(buffer);
        }
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  // Download font from Google Fonts
  private async downloadFromGoogleFonts(locale: string, weight: string): Promise<string | null> {
    const config = FONT_CONFIGS[locale as keyof typeof FONT_CONFIGS];
    if (!config) return null;

    try {
      console.log(`Downloading font from Google Fonts: ${config.name} ${weight}`);
      
      // Fetch CSS to get font URLs
      const cssResponse = await fetch(config.cssUrl);
      const css = await cssResponse.text();
      
      // Extract font URLs
      const fontUrls: string[] = [];
      const urlMatches = css.match(/url\(([^)]+)\)/g);
      if (urlMatches) {
        urlMatches.forEach(match => {
          const url = match.replace(/url\(([^)]+)\)/, '$1').replace(/['"]/g, '');
          fontUrls.push(url);
        });
      }

      // Find the URL for the requested weight
      const weightIndex = config.weights.indexOf(weight);
      const fontUrl = fontUrls[weightIndex] || fontUrls[0];
      
      if (!fontUrl) {
        throw new Error(`No font URL found for weight ${weight}`);
      }

      // Download the font
      const fontResponse = await fetch(fontUrl);
      const fontBuffer = await fontResponse.arrayBuffer();
      
      const base64Data = this.arrayBufferToBase64(fontBuffer);
      
      // Cache in localStorage for future use
      const cacheKey = `font-${locale}-${weight}`;
      try {
        localStorage.setItem(cacheKey, base64Data);
      } catch (e) {
        console.warn('Failed to cache font in localStorage:', e);
      }
      
      return base64Data;
    } catch (error) {
      console.error(`Failed to download font ${locale} ${weight}:`, error);
      return null;
    }
  }

  // Load font with automatic fallback chain
  async loadFont(locale: string, weight: string = '400'): Promise<FontInfo | null> {
    const config = FONT_CONFIGS[locale as keyof typeof FONT_CONFIGS];
    if (!config) {
      console.warn(`No font configuration found for locale: ${locale}`);
      return null;
    }

    const fontKey = `${config.name}-${weight}`;
    
    // Check if already loaded
    if (this.loadedFonts.has(fontKey)) {
      return this.loadedFonts.get(fontKey)!;
    }

    let base64Data: string | null = null;

    // 1. Try localStorage cache first
    const cacheKey = `font-${locale}-${weight}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        console.log(`Using cached font: ${fontKey}`);
        base64Data = cached;
      }
    } catch (e) {
      console.warn('Failed to access localStorage cache:', e);
    }

    // 2. Try local font files if not cached
    if (!base64Data) {
      base64Data = await this.tryLoadLocalFont(locale, weight);
    }

    // 3. Download from Google Fonts if local files not found
    if (!base64Data) {
      base64Data = await this.downloadFromGoogleFonts(locale, weight);
    }

    if (!base64Data) {
      console.error(`Failed to load font ${fontKey} from all sources`);
      return null;
    }
      
    const fontInfo: FontInfo = {
      name: config.name,
      data: base64Data,
      weight
    };
    
    this.loadedFonts.set(fontKey, fontInfo);
    console.log(`✓ Font loaded successfully: ${fontKey}`);
    
    return fontInfo;
  }

  // Add font to jsPDF
  async addFontToPDF(pdf: jsPDF, locale: string, weight: string = '400'): Promise<string | null> {
    try {
      const fontInfo = await this.loadFont(locale, weight);
      if (!fontInfo) {
        return null;
      }

      // Add font to jsPDF
      const fontName = `${fontInfo.name.replace(/\s+/g, '')}-${weight}`;
      pdf.addFileToVFS(`${fontName}.ttf`, fontInfo.data);
      pdf.addFont(`${fontName}.ttf`, fontName, 'normal');
      
      return fontName;
    } catch (error) {
      console.error('Failed to add font to PDF:', error);
      return null;
    }
  }

  // Detect language from text
  static detectLanguage(text: string): string {
    // Chinese (Simplified)
    if (/[\u4e00-\u9fff]/.test(text)) {
      return 'zh-CN';
    }
    // Japanese (Hiragana, Katakana, Kanji)
    if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text)) {
      return 'ja';
    }
    // Korean (Hangul)
    if (/[\uac00-\ud7af]/.test(text)) {
      return 'ko';
    }
    
    return 'en'; // Default to English
  }

  // Clear cache
  clearCache(): void {
    this.loadedFonts.clear();
    // Clear localStorage font cache
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('font-')) {
        localStorage.removeItem(key);
      }
    });
  }
}

export default PDFFontManager;