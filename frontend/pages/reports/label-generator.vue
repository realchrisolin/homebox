<script setup lang="ts">
  import { useI18n } from "vue-i18n";
  import DOMPurify from "dompurify";
  import { route } from "../../lib/api/base";
  import { toast, Toaster } from "@/components/ui/sonner";
  import { Separator } from "@/components/ui/separator";
  import { Button } from "@/components/ui/button";
  import { Label } from "@/components/ui/label";
  import { Input } from "@/components/ui/input";
  import { Checkbox } from "@/components/ui/checkbox";
  import jsPDF from "jspdf";
  import QRCode from "qrcode";
  import PDFFontManager from "~/utils/pdfFonts";

  const { t } = useI18n();

  definePageMeta({
    middleware: ["auth"],
    layout: false,
  });
  useHead({
    title: "HomeBox | " + t("reports.label_generator.title"),
  });

  const api = useUserApi();

  const bordered = ref(false);

  const displayProperties = reactive({
    baseURL: window.location.origin,
    assetRange: 1,
    assetRangeMax: 91,
    measure: "in",
    gapY: 0.25,
    columns: 3,
    cardHeight: 1,
    cardWidth: 2.63,
    pageWidth: 8.5,
    pageHeight: 11,
    pageTopPadding: 0.52,
    pageBottomPadding: 0.42,
    pageLeftPadding: 0.25,
    pageRightPadding: 0.1,
  });

  // Label dimension presets
  type LabelPreset = {
    name: string;
    measure: string;
    cardHeight: number;
    cardWidth: number;
    pageHeight: number;
    pageWidth: number;
    pageTopPadding: number;
    pageBottomPadding: number;
    pageLeftPadding: number;
    pageRightPadding: number;
  };

  const labelPresets = ref<LabelPreset[]>([
    {
      name: "Dymo 30252 (1-1/8\" x 3-1/2\")",
      measure: "in",
      cardHeight: 1.125,
      cardWidth: 3.5,
      pageHeight: 11,
      pageWidth: 8.5,
      pageTopPadding: 0.5,
      pageBottomPadding: 0.5,
      pageLeftPadding: 0.25,
      pageRightPadding: 0.25,
    },
    {
      name: "Avery 5160 (1\" x 2-5/8\")",
      measure: "in",
      cardHeight: 1,
      cardWidth: 2.63,
      pageHeight: 11,
      pageWidth: 8.5,
      pageTopPadding: 0.5,
      pageBottomPadding: 0.5,
      pageLeftPadding: 0.19,
      pageRightPadding: 0.19,
    },
    {
      name: "Avery 5163 (2\" x 4\")",
      measure: "in",
      cardHeight: 2,
      cardWidth: 4,
      pageHeight: 11,
      pageWidth: 8.5,
      pageTopPadding: 0.5,
      pageBottomPadding: 0.5,
      pageLeftPadding: 0.25,
      pageRightPadding: 0.25,
    },
    {
      name: "Brother DK-2205 (2.4\" Continuous)",
      measure: "in",
      cardHeight: 2.4,
      cardWidth: 3.5,
      pageHeight: 11,
      pageWidth: 8.5,
      pageTopPadding: 0.5,
      pageBottomPadding: 0.5,
      pageLeftPadding: 0.25,
      pageRightPadding: 0.25,
    },
  ]);

  // Function to apply a preset
  function applyPreset(presetIndex: number) {
    if (presetIndex >= 0 && presetIndex < labelPresets.value.length) {
      const preset = labelPresets.value[presetIndex];
      displayProperties.measure = preset.measure;
      displayProperties.cardHeight = preset.cardHeight;
      displayProperties.cardWidth = preset.cardWidth;
      displayProperties.pageHeight = preset.pageHeight;
      displayProperties.pageWidth = preset.pageWidth;
      displayProperties.pageTopPadding = preset.pageTopPadding;
      displayProperties.pageBottomPadding = preset.pageBottomPadding;
      displayProperties.pageLeftPadding = preset.pageLeftPadding;
      displayProperties.pageRightPadding = preset.pageRightPadding;
      
      // Recalculate pages with new dimensions
      calcPages();
    }
  }

  // Selection mode and related state
  const selectionMode = ref<'range' | 'assets' | 'location'>('range');
  const selectedAssets = reactive<Record<string, boolean>>({});
  const selectedLocation = ref<string | null>(null);

  // Customizable label fields
  const labelFields = reactive({
    assetId: true,
    name: true,
    location: true,
    branding: true, // The "HomeBox" text
    qrCode: true,
  });

  type LabelOptionInput = {
    measure: string;
    page: {
      height: number;
      width: number;
      pageTopPadding: number;
      pageBottomPadding: number;
      pageLeftPadding: number;
      pageRightPadding: number;
    };
    cardHeight: number;
    cardWidth: number;
  };

  type Output = {
    measure: string;
    cols: number;
    rows: number;
    gapY: number;
    gapX: number;
    card: {
      width: number;
      height: number;
    };
    page: {
      width: number;
      height: number;
      pt: number;
      pb: number;
      pl: number;
      pr: number;
    };
  };

  function calculateGridData(input: LabelOptionInput): Output {
    const { page, cardHeight, cardWidth } = input;

    const measureRegex = /in|cm|mm/;
    const measure = measureRegex.test(input.measure) ? input.measure : "in";

    const availablePageWidth = page.width - page.pageLeftPadding - page.pageRightPadding;
    const availablePageHeight = page.height - page.pageTopPadding - page.pageBottomPadding;

    if (availablePageWidth < cardWidth || availablePageHeight < cardHeight) {
      toast.error(t("reports.label_generator.toast.page_too_small_card"));
      return out.value;
    }

    const cols = Math.floor(availablePageWidth / cardWidth);
    const rows = Math.floor(availablePageHeight / cardHeight);
    const gapX = cols > 1 ? (availablePageWidth - cols * cardWidth) / (cols - 1) : 0;
    const gapY = rows > 1 ? (availablePageHeight - rows * cardHeight) / (rows - 1) : 0;

    return {
      measure,
      cols,
      rows,
      gapX,
      gapY,
      card: {
        width: cardWidth,
        height: cardHeight,
      },
      page: {
        width: page.width,
        height: page.height,
        pt: page.pageTopPadding,
        pb: page.pageBottomPadding,
        pl: page.pageLeftPadding,
        pr: page.pageRightPadding,
      },
    };
  }

  interface InputDef {
    label: string;
    ref: keyof typeof displayProperties;
    type?: "number" | "text";
  }

  const propertyInputs = computed<InputDef[]>(() => {
    return [
      {
        label: t("reports.label_generator.asset_start"),
        ref: "assetRange",
      },
      {
        label: t("reports.label_generator.asset_end"),
        ref: "assetRangeMax",
      },
      {
        label: t("reports.label_generator.measure_type"),
        ref: "measure",
        type: "text",
      },
      {
        label: t("reports.label_generator.label_height"),
        ref: "cardHeight",
      },
      {
        label: t("reports.label_generator.label_width"),
        ref: "cardWidth",
      },
      {
        label: t("reports.label_generator.page_width"),
        ref: "pageWidth",
      },
      {
        label: t("reports.label_generator.page_height"),
        ref: "pageHeight",
      },
      {
        label: t("reports.label_generator.page_top_padding"),
        ref: "pageTopPadding",
      },
      {
        label: t("reports.label_generator.page_bottom_padding"),
        ref: "pageBottomPadding",
      },
      {
        label: t("reports.label_generator.page_left_padding"),
        ref: "pageLeftPadding",
      },
      {
        label: t("reports.label_generator.page_right_padding"),
        ref: "pageRightPadding",
      },
      {
        label: t("reports.label_generator.base_url"),
        ref: "baseURL",
        type: "text",
      },
    ];
  });

  type AssetData = {
    url: string;
    name: string;
    assetID: string;
    location: string;
  };

  type LocationData = {
    url: string;
    name: string;
    locationID: string;
    location: string;
  };


  function fmtAssetID(aid: number | string) {
    aid = aid.toString();

    let aidStr = aid.toString().padStart(6, "0");
    aidStr = aidStr.slice(0, 3) + "-" + aidStr.slice(3);
    return aidStr;
  }

  function fmtLocationID(lid: number | string) {
    const lidStr = lid.toString();

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(lidStr)) {
      return lidStr;
    }
    
    return lidStr;
  }

  function getAssetQRCodeUrl(assetID: string): string {
    let origin = displayProperties.baseURL.trim();

    // remove trailing slash
    if (origin.endsWith("/")) {
      origin = origin.slice(0, -1);
    }

    const data = `${origin}/a/${assetID}`;

    return route(`/qrcode`, { data: encodeURIComponent(data) });
  }

  function getLocationQRCodeUrl(locationID: string): string {
    let origin = displayProperties.baseURL.trim();

    // remove trailing slash
    if (origin.endsWith("/")) {
      origin = origin.slice(0, -1);
    }

    const data = `${origin}/location/${locationID}`;

    return route(`/qrcode`, { data: encodeURIComponent(data) });
  }

  function getItem(n: number, item: { assetId: string; name: string; location: { name: string } } | null): AssetData {
    // format n into - seperated string with leading zeros
    const assetID = fmtAssetID(item?.assetId ?? n + 1);

    return {
      url: getAssetQRCodeUrl(assetID),
      assetID: item?.assetId ?? assetID,
      name: item?.name ?? "_______________",
      location: item?.location?.name ?? "_______________",
    };
  }

  function getLocationItem(n: number, location: { id: string; name: string } | null): LocationData {
    const locationID = fmtLocationID(location?.id)
    
    return {
      url: getLocationQRCodeUrl(locationID),
      locationID: locationID,
      name: location?.name ?? "_______________",
      location: location?.name ?? "_______________",
    };
  }

  // Fetch all assets
  const { data: allAssets } = await useAsyncData('items-data', async () => {
    console.log('=== FETCHING ITEMS DATA ===');
    const { data, error } = await api.items.getAll({ orderBy: "assetId" });

    if (error) {
      console.error('Error fetching items:', error);
      return {
        items: [],
      };
    }

    console.log('Fetched items data:', data);
    console.log('Items count:', data?.items?.length);
    
    if (data?.items) {
      console.log('Initializing selectedAssets for', data.items.length, 'items');
      data.items.forEach(item => {
        selectedAssets[item.assetId] = false;
        console.log('Initialized asset:', item.assetId, 'to false');
      });
      console.log('Final selectedAssets:', selectedAssets);
    } else {
      console.log('No items found in data:', data);
    }
    
    console.log('Returning assets data:', data);
    return data;
  });

  // Fetch all locations
  const { data: allLocations } = await useAsyncData(async () => {
    console.log('=== FETCHING LOCATIONS DATA ===');
    const { data, error } = await api.locations.getAll();
    
    if (error) {
      console.error('Error fetching locations:', error);
      return [];
    }

    console.log('Fetched locations data:', data);
    console.log('Items count:', data?.length);
    
    if (data) {
      console.log('Initializing selectedLocation for', data.length, 'items');
      data.forEach(item => {
        selectedLocation[item.id] = false;
        console.log('Initialized location:', item.id, 'to false');
      });
      console.log('Final selectedLocation:', selectedLocation);
    } else {
      console.log('No items found in data:', data);
    }

    console.log('Fetched locations data:', data);
    return data;
  });

  // Modified items computed property to handle different selection modes
  const items = computed(() => {
    console.log('Computing items - selectionMode:', selectionMode.value);
    console.log('Computing items - selectedAssets:', selectedAssets);
    console.log('Computing items - selectedLocation:', selectedLocation);
    console.log('Computing items - allAssetFields:', allAssets?.value);
    console.log('Computing items - allLocationFields:', allLocations?.value);
    
    if (selectionMode.value === 'range') {
      // Original range-based logic
      if (displayProperties.assetRange > displayProperties.assetRangeMax) {
        return [];
      }

      const diff = displayProperties.assetRangeMax - displayProperties.assetRange;

      if (diff > 999) {
        return [];
      }

      const items: AssetData[] = [];
      for (let i = displayProperties.assetRange - 1; i < displayProperties.assetRangeMax - 1; i++) {
        const item = allAssets?.value?.items?.[i];
        if (item?.location) {
          items.push(getItem(i, item as { assetId: string; location: { name: string }; name: string }));
        } else {
          items.push(getItem(i, null));
        }
      }
      console.log('Range mode - generated items:', items);
      return items;
    }
    else if (selectionMode.value === 'assets') {
      // Filter by selected assets
      console.log('Assets mode - selectedAssets object:', selectedAssets);
      console.log('Assets mode - Object.entries:', Object.entries(selectedAssets));
      
      const selectedAssetIds = Object.entries(selectedAssets)
        .filter(([_, selected]) => selected)
        .map(([id]) => id);
        
      console.log('Assets mode - selectedAssetIds:', selectedAssetIds);
      
      if (selectedAssetIds.length === 0) {
        console.log('Assets mode - no assets selected, returning empty array');
        return [];
      }
      
      const allAssetItems = allAssets?.value?.items || [];
      console.log('Assets mode - all available items:', allAssetItems);
      console.log('Assets mode - sample item assetIds:', allAssetItems.slice(0, 3).map(item => item.assetId));
      
      const filteredAssetItems = allAssetItems
        .filter(item => {
          const isSelected = selectedAssetIds.includes(item.assetId);
          console.log(`Assets mode - checking item ${item.assetId}: ${isSelected}`);
          return isSelected;
        })
        .map((item, index) => getItem(index, item as { assetId: string; location: { name: string }; name: string }));
      
      console.log('Assets mode - filteredAssetItems:', filteredAssetItems);
      return filteredAssetItems;
    }
    else if (selectionMode.value === 'location') {
      // Filter by selected location
      if (!selectedLocation.value) {
        console.log('Location mode - no location selected');
        return [];
      }

      const selectedLocationIds = Object.entries(selectedLocation)
        .filter(([_, selected]) => selected)
        .map(([id]) => id);
        
      console.log('Location mode - selectedLocationIds:', selectedLocationIds);
      
      if (selectedLocationIds.length === 0) {
        console.log('Location mode - no location selected, returning empty array');
        return [];
      }
      
      const allLocationItems = allLocations?.value || [];
      console.log('Location mode - selectedLocation:', selectedLocation.value);
      console.log('Location mode - all available items:', allLocations);
      console.log('Location mode - sample item locations:', allLocationItems);
      
      const filteredLocationItems = allLocationItems
        .filter(item => {
          const isSelected = item.id === selectedLocation.value;
          console.log(`Location mode - location ${item.id}: ${isSelected}`);
          return isSelected;
        })
        .map((item, index) => getLocationItem(index, item as { id: string; location: { name: string }; name: string }));
      
      console.log('Location mode - filteredItems:', filteredLocationItems);
      return filteredLocationItems;
    }
    
    console.log('No matching selection mode, returning empty array');
    return [];
  });

  type Row = {
    items: AssetData[];
  };

  type Page = {
    rows: Row[];
  };

  const pages = ref<Page[]>([]);

  const out = ref({
    measure: "in",
    cols: 0,
    rows: 0,
    gapY: 0,
    gapX: 0,
    card: {
      width: 0,
      height: 0,
    },
    page: {
      width: 0,
      height: 0,
      pt: 0,
      pb: 0,
      pl: 0,
      pr: 0,
    },
  });

  function calcPages() {
    // Set Out Dimensions
    out.value = calculateGridData({
      measure: displayProperties.measure,
      page: {
        height: displayProperties.pageHeight,
        width: displayProperties.pageWidth,
        pageTopPadding: displayProperties.pageTopPadding,
        pageBottomPadding: displayProperties.pageBottomPadding,
        pageLeftPadding: displayProperties.pageLeftPadding,
        pageRightPadding: displayProperties.pageRightPadding,
      },
      cardHeight: displayProperties.cardHeight,
      cardWidth: displayProperties.cardWidth,
    });

    const calc: Page[] = [];

    const perPage = out.value.rows * out.value.cols;

    const itemsCopy = [...items.value];

    while (itemsCopy.length > 0) {
      const page: Page = {
        rows: [],
      };

      for (let i = 0; i < perPage; i++) {
        const item = itemsCopy.shift();
        if (!item) {
          break;
        }

        if (i % out.value.cols === 0) {
          page.rows.push({
            items: [],
          });
        }

        page.rows[page.rows.length - 1].items.push(item);
      }

      calc.push(page);
    }

    pages.value = calc;
  }

  // PDF Preview State
  const pdfPreviewUrl = ref<string | null>(null);

  // Generate PDF Preview Function
  async function generatePDFPreview() {
    try {
      const pdfBlob = await generatePDFBlob();
      if (pdfPreviewUrl.value) {
        URL.revokeObjectURL(pdfPreviewUrl.value);
      }
      pdfPreviewUrl.value = URL.createObjectURL(pdfBlob);
    } catch (error) {
      console.error('Error generating PDF preview:', error);
      toast.error(t("reports.label_generator.pdf_preview_error") || "Error generating PDF preview");
    }
  }

  // Generate PDF Blob (shared function for preview and download)
  async function generatePDFBlob(): Promise<Blob> {
    // Ensure we have calculated pages
    if (pages.value.length === 0) {
      calcPages();
    }

    if (pages.value.length === 0 || items.value.length === 0) {
      throw new Error("No items to generate labels for");
    }

    // Create PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: displayProperties.measure as 'in' | 'cm' | 'mm',
      format: [displayProperties.pageWidth, displayProperties.pageHeight]
    });

    // Setup multi-language fonts
    console.log('Loading multi-language fonts for PDF generation...');
    const fontManager = new PDFFontManager();
 
    // Check what types of text we're dealing with
    const allItems = pages.value.flatMap(page => page.rows.flatMap(row => row.items));
    const textSamples = allItems.map(item => `${item.name} ${item.location || ''}`).join(' ');
    const detectedScript = PDFFontManager.detectLanguage(textSamples);
    console.log(`Detected text script: ${detectedScript}`);

    // Pre-load the font for the detected language
    let availableFontName = null;
    if (detectedScript !== 'en') {
      availableFontName = await fontManager.addFontToPDF(doc, detectedScript);
      if (availableFontName) {
        console.log(`Loaded font for ${detectedScript}: ${availableFontName}`);
      }
    }

    // Generate QR codes as data URLs for all items
    const allItemsForQR = pages.value.flatMap(page => page.rows.flatMap(row => row.items));
    
    // Extract actual URLs from the API endpoints for QR code content
    const qrCodeDataUrls = await Promise.all(
      allItemsForQR.map(item => {
        // Extract the actual URL from the API endpoint
        // item.url is like "/api/v1/qrcode?data=http%3A//localhost%3A3100/a/001-001"
        const urlParams = new URLSearchParams(item.url.split('?')[1]);
        const actualUrl = decodeURIComponent(urlParams.get('data') || item.url);
        
        return QRCode.toDataURL(actualUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      })
    );

    let qrCodeIndex = 0;

    // Process each page
    for (const [pageIndex, page] of pages.value.entries()) {
      if (pageIndex > 0) {
        doc.addPage();
      }

      // Process each row on the page
      for (const [rowIndex, row] of page.rows.entries()) {
        // Process each item in the row
        for (const [itemIndex, item] of row.items.entries()) {
          // Calculate position with proper spacing
          const x = displayProperties.pageLeftPadding + itemIndex * (out.value.card.width + out.value.gapX);
          const y = displayProperties.pageTopPadding + rowIndex * (out.value.card.height + out.value.gapY);

          // Add border if enabled
          if (bordered.value) {
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.01);
            doc.rect(x, y, out.value.card.width, out.value.card.height);
          }

          // Add QR code
          if (labelFields.qrCode && qrCodeIndex < qrCodeDataUrls.length) {
            const qrSize = out.value.card.height * 0.9;
            const qrX = x + 0.05;
            const qrY = y + (out.value.card.height - qrSize) / 2;
            
            doc.addImage(
              qrCodeDataUrls[qrCodeIndex],
              'PNG',
              qrX,
              qrY,
              qrSize,
              qrSize
            );
          }

          // Calculate text area with center alignment
          const textX = x + (labelFields.qrCode ? out.value.card.height * 0.9 + 0.1 : 0.05);
          const maxTextWidth = out.value.card.width - (labelFields.qrCode ? out.value.card.height * 0.9 + 0.15 : 0.1);
          
          // Calculate total text height for vertical centering
          let totalTextHeight = 0;
          const lineHeight = 0.15; // Consistent line height
          
          // Pre-calculate text lines with proper font sizes
          let nameLines: string[] = [];
          let locationLines: string[] = [];
          
          if (labelFields.name) {
            doc.setFontSize(9);
            nameLines = doc.splitTextToSize(item.name, maxTextWidth);
          }
          if (labelFields.location) {
            doc.setFontSize(9);
            locationLines = doc.splitTextToSize(item.location, maxTextWidth);
          }
          
          // Count lines for each field to calculate total height
          if (labelFields.assetId) totalTextHeight += lineHeight;
          if (labelFields.branding) totalTextHeight += lineHeight * 0.8;
          if (labelFields.name) totalTextHeight += nameLines.length * lineHeight * 0.8;
          if (labelFields.location) totalTextHeight += locationLines.length * lineHeight * 0.8;
          
          // Start Y position for vertical centering
          let textY = y + (out.value.card.height - totalTextHeight) / 2 + lineHeight * 0.7;

          // Add Asset ID (matches font-bold, default size ~16px -> 12pt in PDF)
          if (labelFields.assetId) {
            const assetText = selectionMode.value === 'location' ? item.name : item.assetID;
            const textLanguage = PDFFontManager.detectLanguage(assetText);

            if (textLanguage !== 'en' && availableFontName) {
              doc.setFont(availableFontName, 'normal');
            } else {
              doc.setFont('helvetica', 'bold');
            }

            doc.setFontSize(12);
            doc.text(assetText, textX, textY, { maxWidth: maxTextWidth });
            textY += lineHeight;
          }

          // Add HomeBox branding (matches text-xs font-light italic ~12px -> 9pt in PDF)
          if (labelFields.branding) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(128, 128, 128); // Light gray to match font-light
            doc.text('HomeBox', textX, textY, { maxWidth: maxTextWidth });
            doc.setTextColor(0, 0, 0); // Reset to black
            textY += lineHeight * 0.8;
          }

          // Add item name (matches text-xs ~12px -> 9pt in PDF)
          if (labelFields.name) {
            const textLanguage = PDFFontManager.detectLanguage(item.name);

            if (textLanguage !== 'en' && availableFontName) {
              doc.setFont(availableFontName, 'normal');
            } else {
              doc.setFont('helvetica', 'normal');
            }

            doc.setFontSize(9);
            doc.text(nameLines, textX, textY);
            textY += nameLines.length * lineHeight * 0.8;
          }

          // Add location (matches text-xs ~12px -> 9pt in PDF)
          if (labelFields.location) {
            const textLanguage = PDFFontManager.detectLanguage(item.location);

            if (textLanguage !== 'en' && availableFontName) {
              doc.setFont(availableFontName, 'normal');
            } else {
              doc.setFont('helvetica', 'normal');
            }

            doc.setFontSize(9);
            doc.text(locationLines, textX, textY);
          }

          qrCodeIndex++;
        }
      }
    }

    return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
  }

  // PDF Generation Function (now uses shared blob function)
  async function generateLabelsPDF() {
    try {
      const pdfBlob = await generatePDFBlob();
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labels_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success(t("reports.label_generator.pdf_generated") || "PDF generated successfully!");

    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error(t("reports.label_generator.pdf_generation_error") || "Error generating PDF. Please try again.");
    }
  }

  onMounted(() => {
    console.log('Component mounted, initial data:');
    console.log('- allAssets:', allAssets?.value);
    console.log('- locations:', allLocations?.value);
    console.log('- selectionMode:', selectionMode.value);
    calcPages();
  });

  // Clean up PDF preview URL when component is unmounted
  onUnmounted(() => {
    if (pdfPreviewUrl.value) {
      URL.revokeObjectURL(pdfPreviewUrl.value);
    }
  });

  // Watch for changes in selection mode and recalculate pages
  watch([selectionMode, selectedAssets, selectedLocation], () => {
    console.log('Watcher triggered - selectionMode:', selectionMode.value);
    console.log('Watcher triggered - selectedAssets:', selectedAssets);
    console.log('Watcher triggered - selectedLocation:', selectedLocation);
    calcPages();
    // Clear preview when settings change
    if (pdfPreviewUrl.value) {
      URL.revokeObjectURL(pdfPreviewUrl.value);
      pdfPreviewUrl.value = null;
    }
  }, { deep: true });

  // Watch for changes in items and recalculate pages
  watch(items, (newItems) => {
    console.log('Items changed, recalculating pages. New items count:', newItems.length);
    console.log('Items changed, new items:', newItems);
    calcPages();
    // Clear preview when items change
    if (pdfPreviewUrl.value) {
      URL.revokeObjectURL(pdfPreviewUrl.value);
      pdfPreviewUrl.value = null;
    }
  });

  // Watch for changes in display properties and label fields
  watch([displayProperties, labelFields, bordered], () => {
    console.log('Display properties or label fields changed');
    calcPages();
    // Clear preview when settings change
    if (pdfPreviewUrl.value) {
      URL.revokeObjectURL(pdfPreviewUrl.value);
      pdfPreviewUrl.value = null;
    }
  }, { deep: true });

  // Watch selectedAssets specifically
  watch(selectedAssets, (newValue, oldValue) => {
    console.log('selectedAssets changed from:', oldValue, 'to:', newValue);
  }, { deep: true });
</script>

<template>
  <div class="print:hidden">
    <Toaster />
    <div class="container prose mx-auto max-w-4xl p-4 pt-6">
      <h1>HomeBox {{ $t("reports.label_generator.title") }}</h1>
      <p>
        {{ $t("reports.label_generator.instruction_1") }}
      </p>
      <p>
        {{ $t("reports.label_generator.instruction_2") }}
      </p>
      <p v-html="DOMPurify.sanitize($t('reports.label_generator.instruction_3'))"></p>
      <h2>{{ $t("reports.label_generator.tips") }}</h2>
      <ul>
        <li v-html="DOMPurify.sanitize($t('reports.label_generator.tip_1'))"></li>
        <li v-html="DOMPurify.sanitize($t('reports.label_generator.tip_2'))"></li>
        <li v-html="DOMPurify.sanitize($t('reports.label_generator.tip_3'))"></li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <NuxtLink href="/tools">{{ $t("menu.tools") }}</NuxtLink>
        <NuxtLink href="/home">{{ $t("menu.home") }}</NuxtLink>
      </div>
    </div>
    <Separator class="mx-auto max-w-4xl" />
    <div class="container mx-auto max-w-4xl p-4">
      <!-- Label Dimension Presets -->
      <div class="mb-4">
        <Label for="preset-select">{{ $t("reports.label_generator.select_preset") || "Select Label Preset" }}</Label>
        <select 
          id="preset-select" 
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          @change="applyPreset(parseInt($event.target.value))"
        >
          <option value="-1">{{ $t("reports.label_generator.custom_dimensions") || "Custom Dimensions" }}</option>
          <option v-for="(preset, index) in labelPresets" :key="index" :value="index">
            {{ preset.name }}
          </option>
        </select>
      </div>

      <!-- Selection Mode -->
      <div class="mb-4">
        <h3 class="text-lg font-medium mb-2">{{ $t("reports.label_generator.selection_mode") || "Selection Mode" }}</h3>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input 
              type="radio" 
              id="range-mode" 
              value="range" 
              v-model="selectionMode" 
              name="selection-mode"
            />
            <Label for="range-mode">{{ $t("reports.label_generator.range_mode") || "Asset ID Range" }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <input 
              type="radio" 
              id="assets-mode" 
              value="assets" 
              v-model="selectionMode" 
              name="selection-mode"
            />
            <Label for="assets-mode">{{ $t("reports.label_generator.assets_mode") || "Select Specific Assets" }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <input 
              type="radio" 
              id="location-mode" 
              value="location" 
              v-model="selectionMode" 
              name="selection-mode"
            />
            <Label for="location-mode">{{ $t("reports.label_generator.location_mode") || "Filter by Location" }}</Label>
          </div>
        </div>
        
        <!-- Range mode fields (original fields) -->
        <div v-if="selectionMode === 'range'" class="mt-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="flex w-full max-w-xs flex-col">
              <Label for="input-assetRange">
                {{ $t("reports.label_generator.asset_start") }}
              </Label>
              <Input
                id="input-assetRange"
                v-model="displayProperties.assetRange"
                type="number"
                step="1"
                class="w-full max-w-xs"
              />
            </div>
            <div class="flex w-full max-w-xs flex-col">
              <Label for="input-assetRangeMax">
                {{ $t("reports.label_generator.asset_end") }}
              </Label>
              <Input
                id="input-assetRangeMax"
                v-model="displayProperties.assetRangeMax"
                type="number"
                step="1"
                class="w-full max-w-xs"
              />
            </div>
          </div>
        </div>
        
        <!-- Asset selection mode -->

        <div v-if="selectionMode === 'assets'" class="mt-4">
          <!--- Asset debug info -->
          <!---
          <div class="mb-4 p-2 bg-yellow-100 border border-yellow-300">
            <h4 class="font-bold">Assets Debug Info:</h4>
            <p>Selection Mode: {{ selectionMode }}</p>
            <p>Is Assets Mode: {{ selectionMode === 'assets' }}</p>
            <p>Raw allFields ref: {{ allFields }}</p>
            <p>allFields.value: {{ allFields?.value }}</p>
            <p>Full allFields object: {{ JSON.stringify(allFields?.value) }}</p>
            <p>allFields exists: {{ !!allFields?.value }}</p>
            <p>allFields.items exists: {{ !!allFields?.value?.items }}</p>
            <p>allFields.items type: {{ typeof allFields?.value?.items }}</p>
            <p>allFields.items length: {{ allFields?.value?.items?.length }}</p>
            <p>Total items available: {{ allFields?.value?.items?.length || 0 }}</p>
            <p>Selected assets: {{ JSON.stringify(selectedAssets) }}</p>
            <p>Items structure: {{ JSON.stringify(allFields?.value?.items?.slice(0, 1)) }}</p>
            <p style="color: red; font-weight: bold;">Template render time: {{ new Date().toISOString() }}</p>
            <button @click="console.log('Button click - allFields:', allFields, 'allFields.value:', allFields?.value)" class="bg-blue-500 text-white px-2 py-1 rounded">
              Log allFields to Console
            </button>
          </div>
          -->
  
          <div class="border p-2 max-h-60 overflow-y-auto bg-red-50">
            <h5 class="font-bold text-red-600">Asset Checkboxes Section:</h5>

            <div v-for="(item, index) in allAssets?.items" :key="item.assetId" class="flex items-center gap-2 mb-2 p-2 border bg-white">
              <!--
              <div class="text-xs bg-blue-100 p-1 rounded">
                Index: {{ index }}<br>
                Item: {{ item.assetId }}
              </div>
              -->
              <!-- Debug info for this specific item -->
              <!--
              <div class="text-xs text-gray-500 mr-2 bg-gray-100 p-1 rounded">
                ID: {{ item.assetId }}<br>
                Selected: {{ selectedAssets[item.assetId] }}<br>
                Initialized: {{ selectedAssets.hasOwnProperty(item.assetId) }}
              </div>
              -->
              <!-- Try regular HTML checkbox first -->
              <input
                type="checkbox"
                :id="`asset-${item.assetId}`"
                :checked="selectedAssets[item.assetId]"
                @click="console.log('Checkbox CLICKED for', item.assetId)"
                @change="console.log('Checkbox CHANGED for', item.assetId, 'event.target.checked:', $event.target.checked); selectedAssets[item.assetId] = $event.target.checked; console.log('Updated selectedAssets:', selectedAssets)"
              />
              <label :for="`asset-${item.assetId}`" class="cursor-pointer" @click="console.log('Label clicked for', item.assetId)">
                {{ item.assetId }} - {{ item.name }} ({{ item.location?.name || 'No location' }})
              </label>
            </div>
            
            <div v-if="(!allAssets?.items || allAssets?.items?.length === 0) && (!allAssets?.value?.items || allAssets?.value?.items?.length === 0)" class="text-red-600 font-bold">
              NO ITEMS TO RENDER - both allFields.items and allFields.value.items are empty or undefined
            </div>
          </div>
        </div>
        
        <!-- Location selection mode -->
        <div v-if="selectionMode === 'location'" class="mt-4">
        <!--
          <div class="mb-4 p-2 bg-blue-500 border border-blue-300">
            <h4 class="font-bold">Location Debug Info:</h4>
            <p>Available locations: {{ allLocations?.length || 0 }}</p>
            <p>Locations data: {{ JSON.stringify(allLocations?.slice(0, 2)) }}</p>
            <p>Selected location: {{ selectedLocation }}</p>
            <p>Items with selected location: {{ allLocationFields?.items?.filter(item => item.id === selectedLocation).length || 0 }}</p>
          </div>
        -->
          
          <div class="flex w-full max-w-xs flex-col">
            <h5 class="font-bold text-red-600">Location Checkboxes Section:</h5>

            <Label for="location-select">{{ $t("reports.label_generator.select_location") || "Select Location" }}</Label>
            <select
              id="location-select"
              v-model="selectedLocation"
              @change="console.log('Location selected:', selectedLocation)"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="">{{ $t("reports.label_generator.select_location_placeholder") || "Select a location..." }}</option>
              <option v-for="location in allLocations" :key="location.id" :value="location.id">
                {{ location.name }} (ID: {{ location.id }})
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Customizable Label Fields -->
      <div class="mb-4">
        <h3 class="text-lg font-medium mb-2">{{ $t("reports.label_generator.label_fields") || "Label Fields" }}</h3>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center gap-2">
            <Checkbox id="showAssetId" v-model="labelFields.assetId" />
            <Label for="showAssetId">{{ $t("reports.label_generator.show_asset_id") || "Show Asset ID" }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="showName" v-model="labelFields.name" />
            <Label for="showName">{{ $t("reports.label_generator.show_name") || "Show Name" }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="showLocation" v-model="labelFields.location" />
            <Label for="showLocation">{{ $t("reports.label_generator.show_location") || "Show Location" }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="showBranding" v-model="labelFields.branding" />
            <Label for="showBranding">{{ $t("reports.label_generator.show_branding") || "Show HomeBox Branding" }}</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="showQRCode" v-model="labelFields.qrCode" />
            <Label for="showQRCode">{{ $t("reports.label_generator.show_qr_code") || "Show QR Code" }}</Label>
          </div>
        </div>
      </div>

      <!-- Original dimension inputs -->
      <div class="mx-auto grid grid-cols-2 gap-3">
        <div v-for="(prop, i) in propertyInputs" :key="i" class="flex w-full max-w-xs flex-col">
          <Label :for="`input-${prop.ref}`">
            {{ prop.label }}
          </Label>
          <Input
            :id="`input-${prop.ref}`"
            v-model="displayProperties[prop.ref]"
            :type="prop.type ? prop.type : 'number'"
            step="0.01"
            :placeholder="$t('reports.label_generator.input_placeholder')"
            class="w-full max-w-xs"
          />
        </div>
      </div>
      <div class="max-w-xs">
        <div class="flex items-center gap-2 py-4">
          <Checkbox id="borderedLabels" v-model="bordered" />
          <Label class="cursor-pointer" for="borderedLabels">
            {{ $t("reports.label_generator.bordered_labels") }}
          </Label>
        </div>
      </div>

      <div>
        <p>{{ $t("reports.label_generator.qr_code_example") }} {{ displayProperties.baseURL }}/a/{asset_id}</p>
        <div class="flex flex-col gap-2 my-4">
          <Button size="lg" class="w-full" @click="generatePDFPreview">
            {{ $t("reports.label_generator.generate_preview") || "Generate Preview" }}
          </Button>
          <Button size="lg" class="w-full" variant="outline" @click="generateLabelsPDF">
            {{ $t("reports.label_generator.download_pdf") || "Download PDF" }}
          </Button>
        </div>
      </div>
    </div>
  </div>
  <!-- PDF Preview Section -->
  <div class="flex flex-col items-center mt-8">
    <div v-if="pdfPreviewUrl" class="w-full max-w-4xl">
      <h3 class="text-lg font-medium mb-4 text-center">{{ $t("reports.label_generator.pdf_preview") || "PDF Preview" }}</h3>
      <div class="border-2 border-gray-300 rounded-lg overflow-hidden">
        <iframe
          :src="pdfPreviewUrl"
          class="w-full h-96 md:h-[600px]"
          frameborder="0"
          title="PDF Preview"
        ></iframe>
      </div>
      <p class="text-sm text-gray-600 mt-2 text-center">
        {{ $t("reports.label_generator.pdf_preview_note") || "This preview shows exactly how your PDF will look when downloaded." }}
      </p>
    </div>
    <div v-else class="w-full max-w-4xl text-center py-12">
      <p class="text-gray-500">
        {{ $t("reports.label_generator.no_preview") || "Click 'Generate Preview' to see your labels." }}
      </p>
    </div>
  </div>
</template>
