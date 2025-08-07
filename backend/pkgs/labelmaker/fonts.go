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
	regularFont *truetype.Font
	boldFont    *truetype.Font
}

// NewFontManager creates a new font manager with multi-language support
func NewFontManager() (*FontManager, error) {
	fm := &FontManager{}

	// Try to load Noto Sans CJK (supports Chinese, Japanese, Korean)
	if regularFont, err := loadEmbeddedFont("fonts/NotoSansCJK-Regular.ttf"); err == nil {
		fm.regularFont = regularFont
		log.Println("Loaded Noto Sans CJK Regular font for multi-language support")
	} else {
		// Fallback to default Go fonts
		log.Printf("Could not load Noto Sans CJK Regular font (%v), falling back to Go fonts", err)
		if regularFont, err := truetype.Parse(gomedium.TTF); err != nil {
			return nil, fmt.Errorf("failed to parse regular font: %w", err)
		} else {
			fm.regularFont = regularFont
		}
	}

	// Try to load Noto Sans CJK Bold
	if boldFont, err := loadEmbeddedFont("fonts/NotoSansCJK-Bold.ttf"); err == nil {
		fm.boldFont = boldFont
		log.Println("Loaded Noto Sans CJK Bold font for multi-language support")
	} else {
		// Fallback to default Go fonts
		log.Printf("Could not load Noto Sans CJK Bold font (%v), falling back to Go fonts", err)
		if boldFont, err := truetype.Parse(gobold.TTF); err != nil {
			return nil, fmt.Errorf("failed to parse bold font: %w", err)
		} else {
			fm.boldFont = boldFont
		}
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

// GetRegularFace returns a regular font face
func (fm *FontManager) GetRegularFace(size, dpi float64) font.Face {
	return truetype.NewFace(fm.regularFont, &truetype.Options{
		Size: size,
		DPI:  dpi,
	})
}

// GetBoldFace returns a bold font face
func (fm *FontManager) GetBoldFace(size, dpi float64) font.Face {
	return truetype.NewFace(fm.boldFont, &truetype.Options{
		Size: size,
		DPI:  dpi,
	})
}

// GetRegularFont returns the regular font
func (fm *FontManager) GetRegularFont() *truetype.Font {
	return fm.regularFont
}

// GetBoldFont returns the bold font
func (fm *FontManager) GetBoldFont() *truetype.Font {
	return fm.boldFont
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
