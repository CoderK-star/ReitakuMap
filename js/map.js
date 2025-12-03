// map2.js - Clean implementation of Reitaku University Map

// Configuration
const CONFIG = {
    center: [139.955303, 35.833707], // Reitaku University
    zoom: 16,
    watercolorBounds: {
        UL: [139.948711, 35.836212],
        UR: [139.961172, 35.836212],
        LR: [139.961172, 35.829474],
        LL: [139.948711, 35.829474]
    }
};

// Category configuration with colors
const CATEGORIES = {
    "イベント": { color: "#e74c3c", label: "Events" },
    "体験": { color: "#f1c40f", label: "Activities" },
    "展示": { color: "#3498db", label: "Exhibitions" },
    "食べ物": { color: "#ff9800", label: "Food" },
    "場所": { color: "#43c59e", label: "Places" },
    "交通": { color: "#9b59b6", label: "Transport" },
    "ライブ": { color: "#e91e63", label: "Live Shows" }
};

const DEFAULT_COLOR = "#43c59e";

// Global state
let map = null;
let markers = [];
let allData = [];
let activeCategories = new Set();
let searchQuery = "";
let selectedMarkerEl = null; // currently selected DOM marker element
let streetViewState = { active: false, currentItem: null, catalog: [], contextItems: [] };
let pannellumViewer = null;
let streetViewPopup = null;
let lastMarkerItems = null;
let loadingTextAnimation = null;
let loadingGlowAnimation = null;

document.addEventListener('DOMContentLoaded', initLoadingAnimation);

// Initialize map when data is loaded
window.initmap = function() {
    console.log('Initializing map with data:', window.dataObject);

    if (!window.dataObject || window.dataObject.length === 0) {
        showError('No data available. Please check the data source.');
        hideLoading();
        return;
    }

    allData = window.dataObject;
    refreshStreetViewCatalog();
    initializeMap();
    createCategoryButtons();
    setupEventListeners();

    if (map.loaded()) {
        renderMarkersAndPanel();
    } else {
        map.on('load', () => {
            renderMarkersAndPanel();
        });
    }

    hideLoading();
};

function initializeMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                satellite: {
                    type: 'raster',
                    tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
                    tileSize: 256,
                    attribution: '© Google',
                    maxzoom: 21
                }
            },
            layers: [
                {
                    id: 'satellite-layer',
                    type: 'raster',
                    source: 'satellite'
                }
            ]
        },
        center: CONFIG.center,
        zoom: CONFIG.zoom
    });

    let mapLoaded = false;
    map.on('load', () => {
        if (!mapLoaded) {
            mapLoaded = true;
            addWatercolorOverlay();
        }
    });

    const canvasContainer = map.getCanvasContainer();
    if (canvasContainer) {
        canvasContainer.addEventListener('click', handleMapBackgroundClick);
    }
}

function addWatercolorOverlay() {
    const bounds = CONFIG.watercolorBounds;

    if (!map.getSource('watercolor-overlay')) {
        map.addSource('watercolor-overlay', {
            type: 'image',
            url: 'images/watercolorbasemap.png',
            coordinates: [bounds.UL, bounds.UR, bounds.LR, bounds.LL]
        });

        map.addLayer({
            id: 'watercolor-overlay-layer',
            type: 'raster',
            source: 'watercolor-overlay',
            paint: {
                'raster-opacity': 1
            }
        });
    }
}

// Create category filter buttons
function createCategoryButtons() {
    const container = document.getElementById('category-buttons');
    container.innerHTML = '';

    const categoriesInData = new Set();
    allData.forEach(item => {
        const cat = (item.category || '場所').trim();
        categoriesInData.add(cat);
    });

    const allBtn = createButton('すべて', '#333');
    allBtn.classList.add('active');
    allBtn.addEventListener('click', () => toggleCategory('all', allBtn));
    container.appendChild(allBtn);

    const categoryOrder = [
        'ゲストイベント',
        '一日目',
        '二日目',
        '屋外出店',
        '屋内出店',
        '展示'
    ];

    categoryOrder.forEach(category => {
        if (categoriesInData.has(category)) {
            const config = CATEGORIES[category] || { color: DEFAULT_COLOR, label: category };
            const btn = createButton(category, config.color);
            btn.addEventListener('click', () => toggleCategory(category, btn));
            container.appendChild(btn);
        }
    });

    categoriesInData.forEach(category => {
        if (!categoryOrder.includes(category)) {
            const config = CATEGORIES[category] || { color: DEFAULT_COLOR, label: category };
            const btn = createButton(category, config.color);
            btn.addEventListener('click', () => toggleCategory(category, btn));
            container.appendChild(btn);
        }
    });
}

// Create a styled button
function createButton(text, color) {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = text;
    btn.dataset.categoryColor = color;
    if (text === 'すべて') {
        btn.style.setProperty('--btn-color', color);
    } else {
        btn.style.setProperty('--btn-color', color);
    }
    btn.dataset.category = text;
    return btn;
}

// Toggle category filter - only one category at a time
function toggleCategory(category, button) {
    const allButtons = document.querySelectorAll('.category-btn');
    
    if (category === 'all') {
        // Show all categories
        activeCategories.clear();
        allButtons.forEach(btn => {
            if (btn.dataset.category === 'All') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    } else {
        // Deactivate all buttons first
        allButtons.forEach(btn => btn.classList.remove('active'));
        
        // If clicking the same category that was active, go back to "All"
        if (activeCategories.has(category)) {
            activeCategories.clear();
            document.querySelector('[data-category="All"]').classList.add('active');
        } else {
            // Activate only this category
            activeCategories.clear();
            activeCategories.add(category);
            button.classList.add('active');
        }
    }

    renderMarkersAndPanel();
}

// Filter data based on active filters
function getFilteredData() {
    const filtered = allData.filter(item => {
        const category = (item.category || "場所").trim();
        const title = (item.title || "").toLowerCase();
        const location = (item.location || "").toLowerCase();
        const explanation = (item.explanation || "").toLowerCase();

        // Category filter
        const categoryMatch = activeCategories.size === 0 || activeCategories.has(category);

        // Search filter
        const searchMatch = !searchQuery || 
            title.includes(searchQuery) ||
            location.includes(searchQuery) ||
            explanation.includes(searchQuery);

        return categoryMatch && searchMatch;
    });
    
    // Sort by category, then date, then startTime, then endTime
    return filtered.sort((a, b) => {
        // First compare categories
        const categoryA = (a.category || "場所").trim();
        const categoryB = (b.category || "場所").trim();
        
        if (categoryA !== categoryB) {
            return categoryA.localeCompare(categoryB);
        }
        
        // If categories are equal, compare dates - items without date should come last
        const dateA = a.date || '';
        const dateB = b.date || '';
        
        if (!dateA && dateB) return 1;  // a has no date, put it after b
        if (dateA && !dateB) return -1; // b has no date, put it after a
        
        if (dateA !== dateB) {
            return dateA.localeCompare(dateB);
        }
        
        // If dates are equal, compare start times
        const startA = a.startTime || '';
        const startB = b.startTime || '';
        if (startA !== startB) {
            return startA.localeCompare(startB);
        }
        
        // If start times are equal, compare end times
        // Items without end time should come last
        const endA = a.endTime || '';
        const endB = b.endTime || '';
        
        if (!endA && endB) return 1;  // a has no end time, put it after b
        if (endA && !endB) return -1; // b has no end time, put it after a
        
        return endA.localeCompare(endB);
    });
}

// Group data by coordinates
function groupByCoordinates(data) {
    const groups = new Map();
    
    data.forEach(item => {
        const key = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(item);
    });

    return groups;
}

// Render markers on map and update side panel
function renderMarkersAndPanel() {
    // Clear existing markers
    markers.forEach(marker => marker.remove());
    markers = [];
    selectedMarkerEl = null;
    hideStreetViewPopup();
    lastMarkerItems = null;
    updateStreetViewPanelButton(null, null);

    const filteredData = getFilteredData();
    const groupedData = groupByCoordinates(filteredData);

    // Create markers for each location
    groupedData.forEach((items, key) => {
        const [lat, lon] = key.split(',').map(Number);
        const count = items.length;
        
        // Get the primary category (most common in the group)
        const categories = items.map(item => (item.category || "場所").trim());
        const primaryCategory = getMostCommon(categories);
        const color = CATEGORIES[primaryCategory]?.color || DEFAULT_COLOR;

        // Create marker element
        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.backgroundColor = color;
        const previewItem = items.find(hasStreetView) || items[0];
        const thumbUrl = previewItem ? getStreetThumbnail(previewItem) : '';
        if (thumbUrl) {
            const sanitizedThumb = thumbUrl.replace(/"/g, '\\"');
            el.style.backgroundImage = `linear-gradient(0deg, rgba(0,0,0,0.25), rgba(0,0,0,0.25)), url("${sanitizedThumb}")`;
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
        }
        el.title = `${count}件の場所`;

        // Create marker
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat])
            .addTo(map);

        // Click handler: highlight with red ring, update panel, and (if possible) sync 360°ビュー
        el.addEventListener('click', () => {
            setSelectedMarker(el);
            // If mobile and panel is closed, open to 30%
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const panelEl = document.getElementById('side-panel');
                if (panelEl && (panelEl.classList.contains('closed') || panelEl.offsetHeight <= 56)) {
                    panelEl.classList.remove('closed');
                    panelEl.classList.remove('expanded');
                    panelEl.style.height = '30%';
                }
            }

            updatePanelWithItems(items);
            map.flyTo({
                center: [lon, lat],
                zoom: 18,
                duration: 1000
            });

            // ミニマップのマーカークリック時に360°ビューをその場所へ切り替える
            const streetItems = items.filter(hasStreetView);
            if (streetItems.length) {
                // まだ360°モードでなければ、このマーカーの代表スポットで開始
                if (!streetViewState.active) {
                    enterStreetView(streetItems[0], items);
                } else if (streetViewState.active) {
                    // 既に360°モードなら、そのままシーケンスをこの地点に合わせて切り替え
                    streetViewState.contextItems = items.filter(hasStreetView);
                    const target = streetItems[0];
                    enterStreetView(target, streetViewState.contextItems.length ? streetViewState.contextItems : streetViewState.catalog);
                }
            }

            showStreetViewPopup([lon, lat], items);
        });

        markers.push(marker);
    });

    // Update side panel
    updateSidePanel(filteredData);
    
    // Zoom to fit all visible markers
    fitMapToMarkers(filteredData);
}

function setSelectedMarker(element) {
    if (selectedMarkerEl && selectedMarkerEl !== element) {
        selectedMarkerEl.classList.remove('selected');
    }
    selectedMarkerEl = element || null;
    if (selectedMarkerEl) {
        selectedMarkerEl.classList.add('selected');
    }
}

function selectMarkerByCoordinates(lat, lon) {
    if (!markers.length) return;
    const tolerance = 1e-6;
    const target = markers.find(marker => {
        const position = marker.getLngLat();
        return Math.abs(position.lat - lat) < tolerance && Math.abs(position.lng - lon) < tolerance;
    });
    setSelectedMarker(target ? target.getElement() : null);
}

function focusMapOnItem(item, options = {}) {
    if (!item || !Number.isFinite(item.lon) || !Number.isFinite(item.lat) || !map) return;
    const {
        zoom = 18,
        duration = 1000
    } = options;

    map.flyTo({
        center: [item.lon, item.lat],
        zoom,
        duration
    });

    selectMarkerByCoordinates(item.lat, item.lon);
}

function clearMarkerSelection() {
    setSelectedMarker(null);
    lastMarkerItems = null;
    hideStreetViewPopup();
    updateSidePanel(getFilteredData());
}

function handleMapBackgroundClick(event) {
    if (streetViewState.active) return;
    const target = event?.target;
    if (target && typeof target.closest === 'function') {
        if (target.closest('.custom-marker') ||
            target.closest('#side-panel') ||
            target.closest('#streetview-anchor-btn') ||
            target.closest('#basemap-toggle') ||
            target.closest('#street-viewer')) {
            return;
        }
    }
    const hasPanelSelection = Array.isArray(lastMarkerItems) && lastMarkerItems.length > 0;
    if (selectedMarkerEl || hasPanelSelection) {
        clearMarkerSelection();
    }
}

// Fit map bounds to show all filtered markers
function fitMapToMarkers(data) {
    if (!data || data.length === 0) return;
    
    // Calculate bounds of all markers
    const bounds = new maplibregl.LngLatBounds();
    
    data.forEach(item => {
        bounds.extend([item.lon, item.lat]);
    });
    
    // Responsive padding based on screen size
    const isMobile = window.innerWidth <= 768;
    const padding = isMobile 
        ? { top: 200, bottom: window.innerHeight * 0.35, left: 20, right: 20 } // Mobile: account for panel at bottom (30% + buffer)
        : { top: 180, bottom: 100, left: 100, right: 450 }; // Desktop: account for side panel and category buttons
    
    // Fit map to bounds with padding
    map.fitBounds(bounds, {
        padding: padding,
        maxZoom: 18,
        duration: 1000
    });
}

// Update panel to show only items at clicked location
function updatePanelWithItems(items) {
    const content = document.getElementById('panel-content');
    const count = document.getElementById('panel-count');
    
    if (count) {
        count.textContent = `このマーカーに${items.length}件の場所`;
    }
    content.innerHTML = '';
    lastMarkerItems = items;

    if (items.length && Number.isFinite(items[0].lon) && Number.isFinite(items[0].lat)) {
        showStreetViewPopup([items[0].lon, items[0].lat], items);
    } else {
        hideStreetViewPopup();
        updateStreetViewPanelButton(null, null);
    }

    items.forEach(item => {
        const category = (item.category || "場所").trim();
        const color = CATEGORIES[category]?.color || DEFAULT_COLOR;

        const itemEl = document.createElement('div');
        itemEl.className = 'panel-item';
        itemEl.style.borderLeftColor = color;
        itemEl.style.background = 'rgba(227, 242, 253, 0.95)';
        itemEl.style.backdropFilter = 'blur(10px)';

        let html = '';
        
        // Add thumbnail if image exists
        if (item.imageUrl || item.image) {
            const imagePath = item.imageUrl || item.image;
            // Check if path already includes 'icons/', if not, prepend it
            const fullImagePath = imagePath.includes('icons/') ? imagePath : `icons/${imagePath}`;
            html += `<img src="${escapeHtml(fullImagePath)}" alt="" class="panel-item-thumbnail" onerror="this.style.display='none'">`;
        }
        
        html += `<div class="panel-item-content">`;
        html += `<div class="panel-item-title">${escapeHtml(item.title || '無題')}</div>`;
        html += `<div class="panel-item-category" style="background-color: ${color}">${escapeHtml(category)}</div>`;
        
        // Location handling (sunny and rainy)
        if (item.building || item.location) {
            const buildingPart = item.building ? escapeHtml(item.building) : '';
            const locationPart = item.location ? escapeHtml(item.location) : '';
            const fullLocation = [buildingPart, locationPart].filter(Boolean).join(' ');
            
            const sunnyLocation = [item.building, item.location].filter(Boolean).join(' ');
            const rainyLocation = [item.rain_building, item.rain_location].filter(Boolean).join(' ');
            
            // If rainy location exists and is the same, show both emojis
            if (rainyLocation && rainyLocation === sunnyLocation) {
                html += `<div class="panel-item-location">☀️🌧️ ${fullLocation}</div>`;
            } else {
                html += `<div class="panel-item-location">☀️ ${fullLocation}</div>`;
            }
        }
        
        // Rainy day location (only show separately if different from sunny location)
        if (item.rain_building || item.rain_location) {
            const rainBuildingPart = item.rain_building ? escapeHtml(item.rain_building) : '';
            const rainLocationPart = item.rain_location ? escapeHtml(item.rain_location) : '';
            const fullRainLocation = [rainBuildingPart, rainLocationPart].filter(Boolean).join(' ');
            
            const sunnyLocation = [item.building, item.location].filter(Boolean).join(' ');
            const rainyLocation = [item.rain_building, item.rain_location].filter(Boolean).join(' ');
            
            if (rainyLocation && rainyLocation !== sunnyLocation) {
                html += `<div class="panel-item-location">🌧️ ${fullRainLocation}</div>`;
            }
        }
        
        if (item.date) {
            html += `<div class="panel-item-location">📅 ${escapeHtml(item.date)}</div>`;
        }
        if (item.startTime || item.endTime) {
            html += `<div class="panel-item-location">⏰ ${escapeHtml(item.startTime || '')} - ${escapeHtml(item.endTime || '')}</div>`;
        }
        if (item.explanation) {
            html += `<div class="panel-item-location" style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(item.explanation)}</div>`;
        }
        html += `</div>`;

        itemEl.innerHTML = html;

        // Add click handler to minimize panel and center map in mobile mode
        itemEl.addEventListener('click', () => {
            const panel = document.getElementById('side-panel');
            const panelContent = document.getElementById('panel-content');
            const isMobile = window.innerWidth <= 768;
            if (isMobile && panel.classList.contains('expanded')) {
                panel.classList.remove('expanded');
                panel.style.height = '30%';
                
                // Scroll the clicked item into view in the minimized panel
                setTimeout(() => {
                    const itemOffsetTop = itemEl.offsetTop;
                    panelContent.scrollTo({ top: itemOffsetTop, behavior: 'smooth' });
                }, 350); // Wait for panel transition to complete
            }

            // Center the map/mini-map and highlight the marker
            focusMapOnItem(item);
        });

        content.appendChild(itemEl);
    });
}

// Update side panel with filtered data
function updateSidePanel(data) {
    const content = document.getElementById('panel-content');
    const count = document.getElementById('panel-count');
    
    if (count) {
        count.textContent = `${data.length}件の場所が見つかりました`;
    }
    content.innerHTML = '';
    if (!selectedMarkerEl) {
        lastMarkerItems = null;
        updateStreetViewPanelButton(null, null);
    }

    if (data.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">場所が見つかりません</p>';
        return;
    }

    data.forEach(item => {
        const category = (item.category || "場所").trim();
        const color = CATEGORIES[category]?.color || DEFAULT_COLOR;

        const itemEl = document.createElement('div');
        itemEl.className = 'panel-item';
        itemEl.style.borderLeftColor = color;
        itemEl.dataset.lat = item.lat;
        itemEl.dataset.lon = item.lon;

        let html = '';
        
        // Add thumbnail if image exists
        if (item.imageUrl || item.image) {
            const imagePath = item.imageUrl || item.image;
            // Check if path already includes 'icons/', if not, prepend it
            const fullImagePath = imagePath.includes('icons/') ? imagePath : `icons/${imagePath}`;
            html += `<img src="${escapeHtml(fullImagePath)}" alt="" class="panel-item-thumbnail" onerror="this.style.display='none'">`;
        }
        
        html += `<div class="panel-item-content">`;
        html += `<div class="panel-item-title">${escapeHtml(item.title || '無題')}</div>`;
        html += `<div class="panel-item-category" style="background-color: ${color}">${escapeHtml(category)}</div>`;
        
        // Location handling (sunny and rainy)
        if (item.building || item.location) {
            const buildingPart = item.building ? escapeHtml(item.building) : '';
            const locationPart = item.location ? escapeHtml(item.location) : '';
            const fullLocation = [buildingPart, locationPart].filter(Boolean).join(' ');
            
            const sunnyLocation = [item.building, item.location].filter(Boolean).join(' ');
            const rainyLocation = [item.rain_building, item.rain_location].filter(Boolean).join(' ');
            
            // If rainy location exists and is the same, show both emojis
            if (rainyLocation && rainyLocation === sunnyLocation) {
                html += `<div class="panel-item-location">☀️🌧️ ${fullLocation}</div>`;
            } else {
                html += `<div class="panel-item-location">☀️ ${fullLocation}</div>`;
            }
        }
        
        // Rainy day location (only show separately if different from sunny location)
        if (item.rain_building || item.rain_location) {
            const rainBuildingPart = item.rain_building ? escapeHtml(item.rain_building) : '';
            const rainLocationPart = item.rain_location ? escapeHtml(item.rain_location) : '';
            const fullRainLocation = [rainBuildingPart, rainLocationPart].filter(Boolean).join(' ');
            
            const sunnyLocation = [item.building, item.location].filter(Boolean).join(' ');
            const rainyLocation = [item.rain_building, item.rain_location].filter(Boolean).join(' ');
            
            if (rainyLocation && rainyLocation !== sunnyLocation) {
                html += `<div class="panel-item-location">🌧️ ${fullRainLocation}</div>`;
            }
        }
        
        if (item.date) {
            html += `<div class="panel-item-location">📅 ${escapeHtml(item.date)}</div>`;
        }
        if (item.startTime || item.endTime) {
            html += `<div class="panel-item-location">⏰ ${escapeHtml(item.startTime || '')} - ${escapeHtml(item.endTime || '')}</div>`;
        }
        if (item.explanation) {
            html += `<div class="panel-item-location" style="margin-top: 8px; white-space: pre-wrap;">${escapeHtml(item.explanation)}</div>`;
        }
        html += `</div>`;

        itemEl.innerHTML = html;

        // Click to fly to location and update panel
        itemEl.addEventListener('click', () => {
            // In mobile mode, if panel is expanded, minimize it
            const panel = document.getElementById('side-panel');
            const panelContent = document.getElementById('panel-content');
            const isMobile = window.innerWidth <= 768;
            const wasExpanded = panel.classList.contains('expanded');
            
            if (isMobile && wasExpanded) {
                panel.classList.remove('expanded');
                panel.style.height = '30%';
                
                // Scroll the clicked item into view in the minimized panel
                setTimeout(() => {
                    const itemOffsetTop = itemEl.offsetTop;
                    panelContent.scrollTo({ top: itemOffsetTop, behavior: 'smooth' });
                }, 350); // Wait for panel transition to complete
            }

            focusMapOnItem(item);

            // Find items at this location and update panel
            const filteredData = getFilteredData();
            const itemsAtLocation = filteredData.filter(d => 
                Math.abs(d.lat - item.lat) < 0.00001 && 
                Math.abs(d.lon - item.lon) < 0.00001
            );
            
            if (itemsAtLocation.length > 0) {
                updatePanelWithItems(itemsAtLocation);
            }
        });

        content.appendChild(itemEl);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('search-input');
    const micBtn = document.getElementById('mic-btn');
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderMarkersAndPanel();
    });

    // Voice search (Web Speech API)
    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition && micBtn) {
            const recognition = new SpeechRecognition();
            recognition.lang = 'ja-JP';
            recognition.continuous = false;
            recognition.interimResults = false;

            let isListening = false;

            const stopListeningUI = () => {
                isListening = false;
                micBtn.classList.remove('listening');
            };
            const startListeningUI = () => {
                isListening = true;
                micBtn.classList.add('listening');
            };

            micBtn.addEventListener('click', () => {
                if (!isListening) {
                    try { recognition.start(); startListeningUI(); } catch (_) {}
                } else {
                    try { recognition.stop(); } catch (_) {}
                }
            });

            recognition.onresult = (event) => {
                try {
                    const transcript = Array.from(event.results)
                        .map(r => r[0] && r[0].transcript ? r[0].transcript : '')
                        .join(' ')
                        .trim();
                    if (transcript) {
                        searchInput.value = transcript;
                        searchQuery = transcript.toLowerCase();
                        renderMarkersAndPanel();
                    }
                } catch (e) {
                    console.warn('Voice parse error', e);
                }
            };
            recognition.onerror = () => { stopListeningUI(); };
            recognition.onend = () => { stopListeningUI(); };
        } else if (micBtn) {
            // Hide mic if unsupported
            micBtn.style.display = 'none';
        }
    } catch (e) {
        if (micBtn) micBtn.style.display = 'none';
    }

    setupBasemapSwitch();

    const campusLinkBtn = document.getElementById('campus-map-link');
    if (campusLinkBtn) {
        campusLinkBtn.addEventListener('click', () => {
            window.open('https://www.reitaku-u.ac.jp/campuslife/campus-map/', '_blank', 'noopener,noreferrer');
            campusLinkBtn.classList.add('active');
            setTimeout(() => campusLinkBtn.classList.remove('active'), 600);
        });
    }

    // Mobile panel drag functionality
    setupMobilePanelDrag();
    setupMinimapControls();

    const exitBtn = document.getElementById('streetview-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', exitStreetView);
    const backBtn = document.getElementById('streetview-back-to-map');
    if (backBtn) backBtn.addEventListener('click', exitStreetView);
    const prevBtn = document.getElementById('streetview-nav-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => navigateStreetView(-1));
    const nextBtn = document.getElementById('streetview-nav-next');
    if (nextBtn) nextBtn.addEventListener('click', () => navigateStreetView(1));
    const zoomInBtn = document.getElementById('streetview-zoom-in');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => adjustStreetViewZoom(-10));
    const zoomOutBtn = document.getElementById('streetview-zoom-out');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => adjustStreetViewZoom(10));
    const panelToggle = document.getElementById('streetview-panel-toggle');
    const infoPanel = document.getElementById('streetview-info-panel');
    if (panelToggle && infoPanel) {
        panelToggle.addEventListener('click', () => {
            const collapsed = infoPanel.classList.toggle('collapsed');
            const expanded = !collapsed;
            panelToggle.setAttribute('aria-expanded', String(expanded));
            panelToggle.textContent = expanded ? '画面を隠す' : '画面を開く';
            panelToggle.setAttribute('aria-label', expanded ? '画面を隠す' : '画面を開く');
        });
    }

    // Mobile streetview info bottom-sheet drag
    setupStreetviewPanelDrag();

    document.addEventListener('keydown', (evt) => {
        if (evt.key === 'Escape' && streetViewState.active) {
            exitStreetView();
        }
    });
}

// Mobile-only drag handle for streetview info panel
function setupStreetviewPanelDrag() {
    const panel = document.getElementById('streetview-info-panel');
    const handle = document.getElementById('streetview-drag-handle');
    if (!panel || !handle) return;

    let startY = 0;
    let startTranslate = 0; // 0 (fully open) to 1 (hidden except header)
    let dragging = false;

    const getPoint = (e) => (e.type.startsWith('touch') ? e.touches[0] : e);

    const getCurrentTranslate = () => {
        const style = window.getComputedStyle(panel);
        const matrix = style.transform;
        if (!matrix || matrix === 'none') return 0;
        const match = matrix.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,([^\)]+)\)/);
        if (!match) return 0;
        const ty = parseFloat(match[1]) || 0;
        const height = panel.offsetHeight || 1;
        return Math.max(0, Math.min(1, ty / height));
    };

    const applyTranslate = (ratio) => {
        const clamped = Math.max(0, Math.min(1, ratio));
        const height = panel.offsetHeight || 1;
        const ty = clamped * height;
        panel.style.transform = `translateY(${ty}px)`;
        const collapsed = clamped > 0.7;
        panel.classList.toggle('collapsed', collapsed);
        const panelToggle = document.getElementById('streetview-panel-toggle');
        if (panelToggle) {
            const expanded = !collapsed;
            panelToggle.setAttribute('aria-expanded', String(expanded));
            panelToggle.textContent = expanded ? '画面を隠す' : '画面を開く';
            panelToggle.setAttribute('aria-label', expanded ? '画面を隠す' : '画面を開く');
        }
    };

    const onStart = (e) => {
        const pt = getPoint(e);
        dragging = true;
        startY = pt.clientY;
        startTranslate = getCurrentTranslate();
        panel.classList.add('dragging');
        panel.style.transition = 'none';
        document.body.style.userSelect = 'none';
        if (e.cancelable) e.preventDefault();
    };

    const onMove = (e) => {
        if (!dragging) return;
        const pt = getPoint(e);
        const deltaY = pt.clientY - startY;
        const height = panel.offsetHeight || 1;
        const ratioDelta = deltaY / height;
        applyTranslate(startTranslate + ratioDelta);
        if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('dragging');
        panel.style.transition = 'transform 0.3s ease';
        document.body.style.userSelect = '';

        // Snap: open (0) or collapsed (~0.85)
        const current = getCurrentTranslate();
        const target = current > 0.35 ? 0.85 : 0;
        applyTranslate(target);
    };

    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);

    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
}

// Setup draggable panel for mobile
function setupMobilePanelDrag() {
    const panel = document.getElementById('side-panel');
    const handle = document.getElementById('panel-drag-handle');
    if (!panel) return;

    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    const handleMinHeight = 64; // keep handle visible when closed
    const dragZone = 72; // px zone from top that can initiate drag

    const isPanelClosed = () =>
        panel.classList.contains('closed') || panel.offsetHeight <= handleMinHeight + 1;

    const getTouchPoint = (e) => (e.type.includes('touch') ? e.touches[0] : e);

    const withinDragZone = (point) => {
        const rect = panel.getBoundingClientRect();
        if (isPanelClosed()) {
            return point.clientY >= rect.top && point.clientY <= rect.bottom;
        }
        return point.clientY <= rect.top + dragZone;
    };

    const startDrag = (e, forced = false) => {
        if (window.innerWidth > 768) return; // Only on mobile
        const point = getTouchPoint(e);
        if (!forced && !withinDragZone(point)) return;

        isDragging = true;
        startY = point.clientY;
        startHeight = panel.offsetHeight;

        document.body.style.userSelect = 'none';
        panel.style.transition = 'none';

        if (e.cancelable) {
            e.preventDefault();
        }
    };

    const doDrag = (e) => {
        if (!isDragging) return;
        
        const touch = e.type.includes('touch') ? e.touches[0] : e;
        const currentY = touch.clientY;
        const deltaY = startY - currentY; // Positive when dragging up
        const newHeight = startHeight + deltaY;
        const windowHeight = window.innerHeight;
        
        // Constrain between handle height (closed) and 100%
        const minHeight = handleMinHeight;
        const maxHeight = windowHeight;
        
        if (newHeight >= minHeight && newHeight <= maxHeight) {
            panel.style.height = `${newHeight}px`;
        }
    };

    const endDrag = () => {
        if (!isDragging) return;
        
        isDragging = false;
        document.body.style.userSelect = '';
        panel.style.transition = 'height 0.3s ease';
        
        const currentHeight = panel.offsetHeight;
        const windowHeight = window.innerHeight;
        
        // Snap to closed (handle), 30%, or 100%
        if (currentHeight < windowHeight * 0.18) {
            panel.classList.remove('expanded');
            panel.classList.add('closed');
            panel.style.height = `${handleMinHeight}px`;
        } else if (currentHeight > windowHeight * 0.6) {
            panel.classList.add('expanded');
            panel.classList.remove('closed');
            panel.style.height = '100%';
        } else {
            panel.classList.remove('expanded');
            panel.classList.remove('closed');
            panel.style.height = '30%';
        }
    };

    // Mouse events
    if (handle) {
        handle.addEventListener('mousedown', (e) => startDrag(e, true));
        handle.addEventListener('touchstart', (e) => startDrag(e, true), { passive: false });
        handle.addEventListener('click', () => {
            if (isDragging || window.innerWidth > 768) return;
            const isClosed = panel.classList.contains('closed') || panel.offsetHeight <= handleMinHeight + 2;
            if (isClosed) {
                panel.classList.remove('closed');
                panel.classList.remove('expanded');
                panel.style.height = '30%';
            } else {
                panel.classList.remove('expanded');
                panel.classList.add('closed');
                panel.style.height = `${handleMinHeight}px`;
            }
        });
    }

    panel.addEventListener('mousedown', (e) => {
        const forced = isPanelClosed();
        startDrag(e, forced);
    });
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    panel.addEventListener('touchstart', (e) => {
        const forced = e.target === handle || isPanelClosed();
        startDrag(e, forced);
    }, { passive: false });

    const handleTouchMove = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        doDrag(e);
    };

    panel.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    
    panel.addEventListener('touchend', endDrag);
    document.addEventListener('touchend', endDrag);
}

function setupBasemapSwitch() {
    const switchBtn = document.getElementById('basemap-switch');
    if (!switchBtn) return;

    const applyState = (mode) => {
        const normalized = mode === 'satellite' ? 'satellite' : 'watercolor';
        switchBtn.dataset.basemap = normalized;
        switchBtn.classList.toggle('satellite-active', normalized === 'satellite');
        switchBtn.classList.toggle('watercolor-active', normalized === 'watercolor');
        switchBtn.setAttribute('aria-pressed', String(normalized === 'watercolor'));
        switchBtn.setAttribute(
            'aria-label',
            normalized === 'watercolor'
                ? '水彩を表示中。航空写真に切り替え'
                : '航空写真を表示中。水彩に切り替え'
        );
    };

    switchBtn.addEventListener('click', () => {
        const current = switchBtn.dataset.basemap === 'satellite' ? 'satellite' : 'watercolor';
        const next = current === 'watercolor' ? 'satellite' : 'watercolor';
        switchBasemap(next);
        applyState(next);
    });

    applyState(switchBtn.dataset.basemap || 'watercolor');
}

function setupMinimapControls() {
    const mapEl = document.getElementById('map');
    const expandBtn = document.getElementById('minimap-expand-btn');
    if (!mapEl || !expandBtn) return;

    const syncState = () => updateMinimapExpandState();

    expandBtn.addEventListener('click', () => {
        if (!document.body.classList.contains('street-mode')) return;
        const nextState = !mapEl.classList.contains('minimap-expanded');
        updateMinimapExpandState(nextState);
    });

    mapEl.addEventListener('mouseleave', syncState);
    updateMinimapExpandState(false);
}

function updateMinimapExpandState(forceState) {
    const mapEl = document.getElementById('map');
    const expandBtn = document.getElementById('minimap-expand-btn');
    if (!mapEl || !expandBtn) return;

    if (typeof forceState === 'boolean') {
        mapEl.classList.toggle('minimap-expanded', forceState);
    }

    const isExpanded = mapEl.classList.contains('minimap-expanded');
    expandBtn.setAttribute('aria-pressed', String(isExpanded));
    expandBtn.setAttribute('aria-label', isExpanded ? 'ミニマップを縮小' : 'ミニマップを拡大');
}

// Prevent the basemap toggle button from colliding with the bottom sheet (mobile only)

// Switch basemap - toggle watercolor overlay on/off (satellite always visible)
function switchBasemap(basemap) {
    if (!map.getLayer('watercolor-overlay-layer')) return;

    if (basemap === 'watercolor') {
        // Show watercolor overlay on top of satellite
        map.setPaintProperty('watercolor-overlay-layer', 'raster-opacity', 1);
    } else {
        // Hide watercolor overlay, show only satellite
        map.setPaintProperty('watercolor-overlay-layer', 'raster-opacity', 0);
    }
}

function showStreetViewPopup(lngLat, itemsAtMarker) {
    if (!map) return;
    const streetItems = Array.isArray(itemsAtMarker) ? itemsAtMarker.filter(hasStreetView) : [];
    if (!streetItems.length) {
        hideStreetViewPopup();
        updateStreetViewPanelButton(null, null);
        return;
    }

    if (!streetViewPopup) {
        streetViewPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'streetview-marker-popup',
            offset: 18
        });
    }

    const container = document.createElement('div');
    container.className = 'streetview-popup-body';

    const label = document.createElement('p');
    label.className = 'streetview-popup-label';
    label.textContent = `${streetItems.length}件の360°スポット`;
    container.appendChild(label);

    const locationName = getPopupLocationLabel(itemsAtMarker?.[0]);
    if (locationName) {
        const locationRow = document.createElement('p');
        locationRow.className = 'streetview-popup-location';
        locationRow.textContent = locationName;
        container.appendChild(locationRow);
    }

    streetViewPopup
        .setLngLat(lngLat)
        .setDOMContent(container)
        .addTo(map);

    updateStreetViewPanelButton(itemsAtMarker, itemsAtMarker);
}

function hideStreetViewPopup() {
    if (streetViewPopup) {
        streetViewPopup.remove();
    }
}

function updateStreetViewPanelButton(streetItems, itemsAtMarker) {
    const anchorBtn = document.getElementById('streetview-anchor-btn');
    if (!anchorBtn) return;

    const localItems = Array.isArray(streetItems) ? streetItems.filter(hasStreetView) : [];
    const catalogItems = streetViewState.catalog.filter(hasStreetView);
    const isActive = streetViewState.active;
    const canToggle = isActive || localItems.length > 0 || catalogItems.length > 0;

    const handleToggle = () => {
        if (streetViewState.active) {
            exitStreetView();
            return;
        }

        if (localItems.length) {
            const context = Array.isArray(itemsAtMarker) && itemsAtMarker.length ? itemsAtMarker : localItems;
            enterStreetView(localItems[0], context);
            return;
        }

        if (catalogItems.length) {
            enterStreetView(catalogItems[0], catalogItems);
            return;
        }

        showError('360°スポットが登録されていません。');
    };

    if (anchorBtn) {
        anchorBtn.disabled = !canToggle;
        anchorBtn.setAttribute('aria-pressed', String(isActive));
        anchorBtn.classList.toggle('active', isActive);
        anchorBtn.onclick = canToggle ? handleToggle : null;
    }
}

function refreshStreetViewCatalog() {
    streetViewState.catalog = allData.filter(hasStreetView);
    if (streetViewState.active && streetViewState.currentItem && !hasStreetView(streetViewState.currentItem)) {
        exitStreetView();
    } else {
        updateStreetViewInfoPanel();
    }
    const contextItems = Array.isArray(lastMarkerItems) && lastMarkerItems.length ? lastMarkerItems : null;
    updateStreetViewPanelButton(contextItems, contextItems || streetViewState.catalog);
}

function hasStreetView(item) {
    return Boolean(resolveStreetImage(item));
}

function resolveStreetImage(item) {
    if (!item) return '';
    const raw = item.streetViewImage || item.streetviewImage || item.streetview || item.panorama || '';
    if (!raw) return '';
    const trimmed = String(raw).trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\\/g, '/');
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('images/')) return normalized;
    if (normalized.startsWith('part')) return `images/${normalized}`;
    if (normalized.startsWith('/')) return normalized.slice(1);
    return `images/part2/${normalized}`;
}

function resolveStreetThumbnail(item) {
    const panorama = resolveStreetImage(item);
    if (!panorama) return '';
    const normalized = panorama.replace(/\\/g, '/');
    if (/^https?:\/\//i.test(normalized)) return normalized;
    const match = normalized.match(/^(images\/part\d+\/)(.+)$/i);
    if (match) {
        const [, basePath, rest] = match;
        if (!/^thumbs\//i.test(rest)) {
            return `${basePath}thumbs/${rest}`;
        }
    }
    return normalized;
}

function getStreetThumbnail(item) {
    const thumbnail = resolveStreetThumbnail(item);
    if (thumbnail) return thumbnail;
    const img = item?.imageUrl || item?.image;
    if (!img) return '';
    const normalized = String(img).trim().replace(/\\/g, '/');
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('images/')) return normalized;
    if (normalized.startsWith('icons/')) return normalized;
    if (normalized.startsWith('part')) return `images/${normalized}`;
    if (normalized.startsWith('/')) return normalized.slice(1);
    return normalized;
}

function enterStreetView(item, contextItems) {
    if (!item) return;
    const panorama = resolveStreetImage(item);
    if (!panorama) {
        showError('この場所には360°画像が登録されていません。');
        return;
    }

    if (!window.pannellum || typeof window.pannellum.viewer !== 'function') {
        console.error('Pannellum viewer is not available.');
        return;
    }

    if (!streetViewState.catalog.length) {
        refreshStreetViewCatalog();
    }

    const contextual = Array.isArray(contextItems) && contextItems.length
        ? contextItems.filter(hasStreetView)
        : streetViewState.catalog;

    streetViewState.currentItem = item;
    streetViewState.contextItems = contextual;
    setStreetMode(true);
    renderStreetViewer(item, panorama);
    updateStreetViewInfoPanel();
}

function navigateStreetView(step) {
    const sequence = getStreetSequence();
    if (!sequence.length) return;

    const current = streetViewState.currentItem;
    let index = sequence.indexOf(current);
    if (index === -1) index = 0;
    let nextIndex = index + step;
    const max = sequence.length;
    if (nextIndex < 0) {
        nextIndex = max - 1;
    } else if (nextIndex >= max) {
        nextIndex = 0;
    }

    const target = sequence[nextIndex];
    if (target) {
        enterStreetView(target, sequence);
    }
}

function adjustStreetViewZoom(delta) {
    if (!pannellumViewer || typeof pannellumViewer.getHfov !== 'function' || typeof pannellumViewer.setHfov !== 'function') {
        return;
    }
    const current = pannellumViewer.getHfov();
    const next = clampFov((Number.isFinite(current) ? current : 90) + delta);
    pannellumViewer.setHfov(next, false);
}

function exitStreetView() {
    if (!streetViewState.active) return;
    streetViewState.currentItem = null;
    streetViewState.contextItems = [];
    setStreetMode(false);
    updateStreetViewInfoPanel();
}

function renderStreetViewer(item, panoramaUrl) {
    const container = document.getElementById('street-viewer-canvas');
    if (!container) return;
    container.innerHTML = '';
    if (!window.pannellum || typeof window.pannellum.viewer !== 'function') {
        showError('360°ビュー用ライブラリの読み込みに失敗しました。');
        return;
    }

    const yaw = toFinite(item.streetViewYaw);
    const pitch = toFinite(item.streetViewPitch);
    const fov = toFinite(item.streetViewFov);

    pannellumViewer = pannellum.viewer('street-viewer-canvas', {
        type: 'equirectangular',
        panorama: panoramaUrl,
        autoLoad: true,
        showControls: false,
        showZoomCtrl: false,
        showFullscreenCtrl: false,
        compass: true,
        pitch: pitch ?? 0,
        yaw: yaw ?? 0,
        hfov: clampFov(fov ?? 90),
        minHfov: 45,
        maxHfov: 120,
        escapeHTML: true
    });
}

function setStreetMode(isActive) {
    const wasActive = streetViewState.active;
    streetViewState.active = isActive;
    const body = document.body;
    const overlay = document.getElementById('street-viewer');
    const infoPanel = document.getElementById('streetview-info-panel');
    const panelToggle = document.getElementById('streetview-panel-toggle');
    if (!body || !overlay) return;

    if (isActive && !wasActive) {
        body.classList.add('street-mode');
        overlay.setAttribute('aria-hidden', 'false');
        hideStreetViewPopup();
        if (infoPanel) infoPanel.classList.remove('collapsed');
        if (panelToggle) panelToggle.setAttribute('aria-expanded', 'true');
        updateMinimapExpandState(false);
    } else if (!isActive && wasActive) {
        body.classList.remove('street-mode');
        overlay.setAttribute('aria-hidden', 'true');
        updateMinimapExpandState(false);
    }

    if (map && wasActive !== isActive) {
        requestAnimationFrame(() => map.resize());
        setTimeout(() => map && map.resize(), 420);
    }
    const contextItems = streetViewState.contextItems.length ? streetViewState.contextItems : lastMarkerItems;
    const markerContext = Array.isArray(contextItems) && contextItems.length ? contextItems : null;
    updateStreetViewPanelButton(markerContext, markerContext || streetViewState.catalog);
}

function updateStreetViewInfoPanel() {
    const titleEl = document.getElementById('streetview-current-title');
    const metaEl = document.getElementById('streetview-current-meta');
    const catEl = document.getElementById('streetview-current-category');
    const carousel = document.getElementById('streetview-location-carousel');
    const prevBtn = document.getElementById('streetview-nav-prev');
    const nextBtn = document.getElementById('streetview-nav-next');
    if (!titleEl || !metaEl || !catEl || !carousel) return;
    const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

    const current = streetViewState.currentItem;
    if (!current) {
        titleEl.textContent = 'ストリートビュー';
        metaEl.textContent = '360°スポットを選択してください。';
        catEl.textContent = '';
    } else {
        titleEl.textContent = current.title || '名称未設定スポット';
        metaEl.textContent = getStreetMeta(current);
        catEl.textContent = (current.category || 'スポット');
    }

    carousel.innerHTML = '';
    const catalog = getStreetSequence();

    const canLazyLoadThumbs = 'IntersectionObserver' in window;
    const thumbObserver = canLazyLoadThumbs
        ? new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const target = entry.target;
                const dataUrl = target.dataset.thumb;
                if (dataUrl) {
                    target.style.backgroundImage = `url("${dataUrl}")`;
                    target.classList.remove('loading');
                    delete target.dataset.thumb;
                }
                observer.unobserve(target);
            });
        }, { root: carousel, rootMargin: '120px 0px', threshold: 0.05 })
        : null;

    catalog.forEach((spot) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'streetview-location-card' + (spot === current ? ' active' : '');

        const thumb = document.createElement('div');
        thumb.className = 'streetview-location-card-thumb';
        const thumbUrl = getStreetThumbnail(spot);
        const sanitizedThumb = thumbUrl ? thumbUrl.replace(/"/g, '\"') : '';
        if (sanitizedThumb) {
            if (thumbObserver) {
                thumb.dataset.thumb = sanitizedThumb;
                thumb.classList.add('loading');
                thumbObserver.observe(thumb);
            } else {
                thumb.style.backgroundImage = `url("${sanitizedThumb}")`;
            }
        } else {
            thumb.style.background = 'linear-gradient(135deg, #1e3c72, #2a5298)';
        }

        const title = document.createElement('span');
        title.className = 'streetview-location-card-title';
        const displayName = cleanText(spot.title) || cleanText(spot.location) || 'スポット';
        title.textContent = displayName;
        const normalizedDisplay = displayName.toLowerCase();
        const subtitle = document.createElement('small');
        const buildingText = cleanText(spot.building);
        const locationText = cleanText(spot.location);
        const safeCandidate = (value, compare = normalizedDisplay) => {
            if (!value) return '';
            return value.toLowerCase() === compare ? '' : value;
        };
        const buildingCandidate = safeCandidate(buildingText);
        const locationCandidate = safeCandidate(locationText, buildingCandidate ? buildingCandidate.toLowerCase() : normalizedDisplay);
        const subtitleText = buildingCandidate || locationCandidate;
        if (subtitleText) {
            subtitle.textContent = subtitleText;
            title.appendChild(subtitle);
        }

        card.appendChild(thumb);
        card.appendChild(title);

        card.addEventListener('click', () => {
            focusMapOnItem(spot, { duration: 800 });
            if (spot !== current) {
                enterStreetView(spot, catalog);
            }
        });

        carousel.appendChild(card);
    });

    if (!catalog.length) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.margin = '8px 0 0';
        emptyMsg.style.color = 'rgba(255,255,255,0.65)';
        emptyMsg.textContent = '360°スポットが登録されていません。';
        carousel.appendChild(emptyMsg);
    }

    const navDisabled = !streetViewState.active || catalog.length <= 1;
    if (prevBtn) {
        prevBtn.disabled = navDisabled;
    }
    if (nextBtn) {
        nextBtn.disabled = navDisabled;
    }
}

function getStreetSequence() {
    const catalogSeq = streetViewState.catalog.filter(hasStreetView);
    if (catalogSeq.length) return catalogSeq;
    const contextSeq = streetViewState.contextItems.filter(hasStreetView);
    if (contextSeq.length) return contextSeq;
    if (Array.isArray(lastMarkerItems) && lastMarkerItems.length) {
        const markerSeq = lastMarkerItems.filter(hasStreetView);
        if (markerSeq.length) return markerSeq;
    }
    return [];
}

function getStreetMeta(item) {
    const parts = [];
    if (item.location && item.location !== item.building) parts.push(item.location);
    if (item.date) parts.push(item.date);
    if (item.category) parts.push(item.category);
    return parts.filter(Boolean).join(' / ') || 'Reitaku University';
}

function toFinite(value) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : undefined;
}

function clampFov(value) {
    return Math.min(120, Math.max(45, value));
}

// Utility functions
function getMostCommon(arr) {
    const counts = {};
    arr.forEach(item => {
        counts[item] = (counts[item] || 0) + 1;
    });
    
    let maxCount = 0;
    let mostCommon = arr[0];
    
    for (const item in counts) {
        if (counts[item] > maxCount) {
            maxCount = counts[item];
            mostCommon = item;
        }
    }
    
    return mostCommon;
}

function initLoadingAnimation() {
    if (typeof anime === 'undefined' || loadingTextAnimation) return;
    const wordmark = document.getElementById('loading-wordmark');
    if (!wordmark) return;
    const letters = wordmark.querySelectorAll('.loading-letter');
    if (!letters.length) return;

    anime.set(letters, { opacity: 0, translateY: 24 });

    loadingTextAnimation = anime.timeline({ loop: true, autoplay: true })
        .add({
            targets: letters,
            translateY: [24, 0],
            opacity: [0, 1],
            scale: [0.85, 1],
            easing: 'easeOutExpo',
            delay: anime.stagger(75),
            duration: 620
        })
        .add({
            targets: letters,
            translateY: [0, -14],
            opacity: [1, 0],
            easing: 'easeInQuint',
            delay: anime.stagger(65, { from: 'center' }),
            duration: 520
        }, '+=260');

    const glow = document.getElementById('loading-neon-glow');
    if (glow) {
        loadingGlowAnimation = anime({
            targets: glow,
            opacity: [0.2, 0.85],
            scale: [0.85, 1.15],
            easing: 'easeInOutSine',
            direction: 'alternate',
            loop: true,
            duration: 1700
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getPopupLocationLabel(item) {
    if (!item) return '';
    const building = typeof item.building === 'string' ? item.building.trim() : '';
    const location = typeof item.location === 'string' ? item.location.trim() : '';
    if (building && location && building !== location) {
        return `${building} ${location}`;
    }
    return building || location || item.title || '';
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('hidden');
    if (loadingTextAnimation) {
        loadingTextAnimation.pause();
        loadingTextAnimation = null;
    }
    if (loadingGlowAnimation) {
        loadingGlowAnimation.pause();
        loadingGlowAnimation = null;
    }
}

function showError(message) {
    const banner = document.getElementById('error-banner');
    if (banner) {
        banner.textContent = message;
        banner.classList.add('show');
        setTimeout(() => banner.classList.remove('show'), 5000);
    }
}

// Initialize when data is ready
if (window.dataObject && window.dataObject.length > 0) {
    window.initmap();
}
