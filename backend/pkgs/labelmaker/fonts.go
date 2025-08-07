package labelmaker

import (
	"embed"
	"fmt"
	"log"

	"github.com/golang/freetype/truetype"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/gomedium"
)

//go:embed fonts/*
var fontFiles embed.FS

// FontManager handles font loading and selection for different languages
type FontManager struct {
	latinRegularFont *truetype.Font // Go default font for Latin characters
	latinBoldFont    *truetype.Font // Go default font for Latin characters
	cjkRegularFont   *truetype.Font // Noto Sans CJK for CJK characters
	cjkBoldFont      *truetype.Font // Noto Sans CJK for CJK characters
}

// NewFontManager creates a new font manager with multi-language support
func NewFontManager() (*FontManager, error) {
	fm := &FontManager{}

	// Load Go's default fonts for Latin characters (to avoid number 4 artifact)
	if latinRegularFont, err := truetype.Parse(gomedium.TTF); err != nil {
		return nil, fmt.Errorf("failed to parse Go regular font: %w", err)
	} else {
		fm.latinRegularFont = latinRegularFont
		log.Println("Loaded Go default regular font for Latin characters")
	}

	if latinBoldFont, err := truetype.Parse(gobold.TTF); err != nil {
		return nil, fmt.Errorf("failed to parse Go bold font: %w", err)
	} else {
		fm.latinBoldFont = latinBoldFont
		log.Println("Loaded Go default bold font for Latin characters")
	}

	// Load Noto Sans CJK fonts for CJK characters
	if cjkRegularFont, err := loadEmbeddedFont("fonts/NotoSansCJK-Regular.ttf"); err == nil {
		fm.cjkRegularFont = cjkRegularFont
		log.Println("Loaded Noto Sans CJK Regular font for CJK characters")
	} else {
		log.Printf("Could not load Noto Sans CJK Regular font (%v), CJK characters may not render properly", err)
		fm.cjkRegularFont = fm.latinRegularFont // Fallback to Go font
	}

	if cjkBoldFont, err := loadEmbeddedFont("fonts/NotoSansCJK-Bold.ttf"); err == nil {
		fm.cjkBoldFont = cjkBoldFont
		log.Println("Loaded Noto Sans CJK Bold font for CJK characters")
	} else {
		log.Printf("Could not load Noto Sans CJK Bold font (%v), CJK characters may not render properly", err)
		fm.cjkBoldFont = fm.latinBoldFont // Fallback to Go font
	}

	return fm, nil
}

// loadEmbeddedFont loads a font from embedded files
func loadEmbeddedFont(path string) (*truetype.Font, error) {
	fontData, err := fontFiles.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return truetype.Parse(fontData)
}

// GetRegularFace returns a regular font face (defaults to Latin font)
func (fm *FontManager) GetRegularFace(size, dpi float64) font.Face {
	return truetype.NewFace(fm.latinRegularFont, &truetype.Options{
		Size:    size,
		DPI:     dpi,
		Hinting: font.HintingNone,
	})
}

// GetBoldFace returns a bold font face (defaults to Latin font)
func (fm *FontManager) GetBoldFace(size, dpi float64) font.Face {
	return truetype.NewFace(fm.latinBoldFont, &truetype.Options{
		Size:    size,
		DPI:     dpi,
		Hinting: font.HintingNone,
	})
}

// GetRegularFaceForText returns appropriate font face based on text content
func (fm *FontManager) GetRegularFaceForText(text string, size, dpi float64) font.Face {
	if fm.ContainsCJKCharacters(text) {
		return truetype.NewFace(fm.cjkRegularFont, &truetype.Options{
			Size:    size,
			DPI:     dpi,
			Hinting: font.HintingNone,
		})
	}
	return fm.GetRegularFace(size, dpi)
}

// GetBoldFaceForText returns appropriate font face based on text content
func (fm *FontManager) GetBoldFaceForText(text string, size, dpi float64) font.Face {
	if fm.ContainsCJKCharacters(text) {
		return truetype.NewFace(fm.cjkBoldFont, &truetype.Options{
			Size:    size,
			DPI:     dpi,
			Hinting: font.HintingNone,
		})
	}
	return fm.GetBoldFace(size, dpi)
}

// ContainsCJKCharacters checks if text contains Chinese, Japanese, or Korean characters
func (fm *FontManager) ContainsCJKCharacters(text string) bool {
	for _, r := range text {
		// Chinese characters (CJK Unified Ideographs)
		if r >= 0x4E00 && r <= 0x9FFF {
			return true
		}
		// Japanese Hiragana
		if r >= 0x3040 && r <= 0x309F {
			return true
		}
		// Japanese Katakana
		if r >= 0x30A0 && r <= 0x30FF {
			return true
		}
		// Korean Hangul
		if r >= 0xAC00 && r <= 0xD7AF {
			return true
		}
	}
	return false
}

// GetRegularFont returns the Latin regular font
func (fm *FontManager) GetRegularFont() *truetype.Font {
	return fm.latinRegularFont
}

// GetBoldFont returns the Latin bold font
func (fm *FontManager) GetBoldFont() *truetype.Font {
	return fm.latinBoldFont
}

// SupportsText checks if the current fonts support the given text
func (fm *FontManager) SupportsText(text string) bool {
	// Create a temporary face to test character support
	face := fm.GetRegularFace(12, 72)
	defer face.Close()

	for _, r := range text {
		if _, ok := face.GlyphAdvance(r); !ok {
			return false
		}
	}
	return true
}
