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

// Initialize map when data is loaded
window.initmap = function() {
    console.log("Initializing map with data:", window.dataObject);
    
    if (!window.dataObject || window.dataObject.length === 0) {
        showError("No data available. Please check the data source.");
        hideLoading();
        return;
    }

    allData = window.dataObject;
    initializeMap();
    createCategoryButtons();
    setupEventListeners();
    
    // Render markers after map loads to ensure proper bounds calculation
    if (map.loaded()) {
        renderMarkersAndPanel();
    } else {
        map.on('load', () => {
            renderMarkersAndPanel();
        });
    }
    
    hideLoading();
};

// Initialize MapLibre map
function initializeMap() {
    map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                "satellite": {
                    type: "raster",
                    tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
                    tileSize: 256,
                    attribution: "© Google",
                    maxzoom: 21
                }
            },
            layers: [
                {
                    id: "satellite-layer",
                    type: "raster",
                    source: "satellite"
                }
            ]
        },
        center: CONFIG.center,
        zoom: CONFIG.zoom
    });

    // Add watercolor overlay when map loads
    let mapLoaded = false;
    map.on('load', () => {
        if (!mapLoaded) {
            mapLoaded = true;
            addWatercolorOverlay();
            // Satellite layer stays visible as the base
        }
    });

    // Navigation controls removed per user request
}

// Add watercolor basemap overlay
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

    // Get unique categories from data
    const categoriesInData = new Set();
    allData.forEach(item => {
        const cat = (item.category || "場所").trim();
        categoriesInData.add(cat);
    });

    // Add "All" button
    const allBtn = createButton('すべて', '#333');
    allBtn.classList.add('active');
    allBtn.addEventListener('click', () => toggleCategory('all', allBtn));
    container.appendChild(allBtn);

    // Define the fixed order for categories
    const categoryOrder = [
        'ゲストイベント',
        '一日目',
        '二日目',
        '屋外出店',
        '屋内出店',
        '展示'
    ];

    // Add category buttons in the specified order (only if present in data)
    categoryOrder.forEach(category => {
        if (categoriesInData.has(category)) {
            const config = CATEGORIES[category] || { color: DEFAULT_COLOR, label: category };
            const btn = createButton(category, config.color);
            btn.addEventListener('click', () => toggleCategory(category, btn));
            container.appendChild(btn);
        }
    });

    // Add any remaining categories not in the predefined order
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
        el.textContent = count;
        el.title = `${count}件の場所`;

        // Create marker
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lon, lat])
            .addTo(map);

        // Click handler: highlight with red ring and update panel
        el.addEventListener('click', () => {
            if (selectedMarkerEl && selectedMarkerEl !== el) {
                selectedMarkerEl.classList.remove('selected');
            }
            selectedMarkerEl = el;
            el.classList.add('selected');
            // If mobile and panel is closed, open to 30%
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const panelEl = document.getElementById('side-panel');
                if (panelEl && (panelEl.classList.contains('closed') || panelEl.offsetHeight <= 56)) {
                    panelEl.classList.remove('closed');
                    panelEl.classList.remove('expanded');
                    panelEl.style.height = '30%';
                    // Avoid basemap toggle collision when opening
                    updateBasemapTogglePosition();
                }
            }
            updatePanelWithItems(items);
            map.flyTo({
                center: [lon, lat],
                zoom: 18,
                duration: 1000
            });
        });

        markers.push(marker);
    });

    // Update side panel
    updateSidePanel(filteredData);
    
    // Zoom to fit all visible markers
    fitMapToMarkers(filteredData);
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
    
    count.textContent = `このマーカーに${items.length}件の場所`;
    content.innerHTML = '';

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

            // Center map to the clicked item's location
            map.flyTo({
                center: [item.lon, item.lat],
                zoom: 18,
                duration: 1000
            });
        });

        content.appendChild(itemEl);
    });
}

// Update side panel with filtered data
function updateSidePanel(data) {
    const content = document.getElementById('panel-content');
    const count = document.getElementById('panel-count');
    
    count.textContent = `${data.length}件の場所が見つかりました`;
    content.innerHTML = '';

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

            map.flyTo({
                center: [item.lon, item.lat],
                zoom: 18,
                duration: 1000
            });

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

    // Basemap toggle
    const basemapButtons = document.querySelectorAll('.basemap-btn');
    basemapButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const basemap = btn.dataset.basemap;
            switchBasemap(basemap);
            
            // Update active state
            basemapButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Mobile panel drag functionality
    setupMobilePanelDrag();
    // Adjust basemap toggle initially and on resize
    setTimeout(updateBasemapTogglePosition, 0);
    window.addEventListener('resize', updateBasemapTogglePosition);
}

// Setup draggable panel for mobile
function setupMobilePanelDrag() {
    const panel = document.getElementById('side-panel');
    const handle = document.getElementById('panel-drag-handle');
    const panelContent = document.getElementById('panel-content');
    
    if (!handle) return;

    let startY = 0;
    let startHeight = 0;
    let isDragging = false;
    const handleMinHeight = 48; // keep handle visible when closed

    const startDrag = (e) => {
        if (window.innerWidth > 768) return; // Only on mobile
        
        isDragging = true;
        const touch = e.type.includes('touch') ? e.touches[0] : e;
        startY = touch.clientY;
        startHeight = panel.offsetHeight;
        
        document.body.style.userSelect = 'none';
        panel.style.transition = 'none';
        
        // Prevent default to avoid text selection
        if (e.type === 'mousedown') {
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
            // Live adjust basemap toggle while dragging
            updateBasemapTogglePosition();
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
        // Snap adjustment for basemap toggle
        updateBasemapTogglePosition();
    };

    // Mouse events
    handle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', endDrag);

    // Touch events - use passive: true for touchstart, but capture touchmove if dragging
    handle.addEventListener('touchstart', (e) => {
        startDrag(e);
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            e.preventDefault();
            doDrag(e);
        }
    }, { passive: false });
    
    document.addEventListener('touchend', endDrag);

    // Tap/click handle to toggle open/close when not dragging
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
        updateBasemapTogglePosition();
    });
}

// Prevent the basemap toggle button from colliding with the bottom sheet (mobile only)
function updateBasemapTogglePosition() {
    const toggle = document.getElementById('basemap-toggle');
    const panel = document.getElementById('side-panel');
    if (!toggle || !panel) return;

    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
        toggle.style.bottom = '';
        toggle.style.opacity = '';
        toggle.style.pointerEvents = '';
        return;
    }

    const windowHeight = window.innerHeight;
    const panelHeight = panel.offsetHeight || 0;
    const isClosed = panel.classList.contains('closed') || panelHeight <= 52;
    const isExpanded = panel.classList.contains('expanded') || panelHeight >= windowHeight * 0.98;

    if (isExpanded) {
        // Panel covers screen; hide toggle under it
        toggle.style.opacity = '0';
        toggle.style.pointerEvents = 'none';
        toggle.style.bottom = '20px';
    } else if (isClosed) {
        // Keep near bottom when closed
        toggle.style.opacity = '1';
        toggle.style.pointerEvents = '';
        toggle.style.bottom = '20px';
    } else {
        // Place above the sheet top edge
        const bottomPx = Math.min(windowHeight - 80, panelHeight + 20);
        toggle.style.opacity = '1';
        toggle.style.pointerEvents = '';
        toggle.style.bottom = `${bottomPx}px`;
    }
}

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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('hidden');
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
