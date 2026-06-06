class ParkingLotSimulator {
    constructor() {
        this.canvas = document.getElementById('parkingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvasContainer');
        
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.showGrid = true;
        this.gridSize = 20;
        
        this.currentTool = 'select';
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.tempShape = null;
        
        this.parkingSpots = [];
        this.zones = [];
        this.roads = [];
        this.entrances = [];
        this.exits = [];
        this.gates = [];
        this.cameras = [];
        this.simCars = [];
        this.routes = [];
        
        this.selectedItems = [];
        this.clipboard = [];
        this.validationIssues = [];
        this.highlightedItems = [];
        
        this.simulationRunning = false;
        this.simulationSpeed = 1;
        this.simTime = 8 * 60;
        this.simInterval = null;
        this.simStats = { entered: 0, exited: 0 };
        
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        this.suppressHistory = false;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.saveState();
        this.render();
        this.updateStats();
        this.loadFromStorage();
        this.updateUndoRedoButtons();
    }
    
    setupEventListeners() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setTool(e.target.closest('.tool-btn').dataset.tool);
            });
        });
        
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.cancelDrawing();
        });
        
        document.getElementById('btnZoomIn').addEventListener('click', () => this.zoom(0.1));
        document.getElementById('btnZoomOut').addEventListener('click', () => this.zoom(-0.1));
        document.getElementById('btnZoomFit').addEventListener('click', () => this.zoomFit());
        document.getElementById('btnGrid').addEventListener('click', (e) => {
            this.showGrid = !this.showGrid;
            e.target.classList.toggle('active');
            this.render();
        });
        
        document.getElementById('btnUndo').addEventListener('click', () => this.undo());
        document.getElementById('btnRedo').addEventListener('click', () => this.redo());
        
        document.getElementById('btnBatchCopy').addEventListener('click', () => this.batchCopy());
        document.getElementById('btnClearAll').addEventListener('click', () => {
            if (confirm('确定要清空画布吗？此操作不可撤销。')) {
                this.clearAll();
            }
        });
        
        document.getElementById('btnSave').addEventListener('click', () => this.saveDraft());
        document.getElementById('btnLoad').addEventListener('click', () => this.loadDraft());
        document.getElementById('btnExport').addEventListener('click', () => this.exportImage());
        document.getElementById('btnReport').addEventListener('click', () => this.generateReport());
        
        document.getElementById('btnExportJSON').addEventListener('click', () => this.exportJSON());
        document.getElementById('btnImportJSON').addEventListener('click', () => {
            document.getElementById('fileInputJSON').click();
        });
        document.getElementById('fileInputJSON').addEventListener('change', (e) => this.importJSON(e));
        
        document.getElementById('btnValidate').addEventListener('click', () => this.validatePlan());
        
        document.getElementById('btnStartSimulation').addEventListener('click', () => this.startSimulation());
        document.getElementById('btnStopSimulation').addEventListener('click', () => this.stopSimulation());
        document.getElementById('btnCloseSim').addEventListener('click', () => {
            document.getElementById('simulationPanel').style.display = 'none';
        });
        document.getElementById('simSpeed').addEventListener('input', (e) => {
            this.simulationSpeed = parseFloat(e.target.value);
            document.getElementById('simSpeedValue').textContent = this.simulationSpeed + 'x';
            if (this.simInterval) {
                clearInterval(this.simInterval);
                this.simInterval = setInterval(() => this.simulateTick(), 500 / this.simulationSpeed);
            }
        });
        
        ['peakTraffic', 'offPeakTraffic', 'avgParkingTime', 'firstHourRate', 'hourlyRate', 
         'dailyMax', 'freeMinutes', 'chargingFee', 'beforeSpots', 'beforeCharging',
         'evRatio', 'avgCharge'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updateStats());
        });
        
        document.getElementById('modalClose').addEventListener('click', () => this.hideModal());
        document.getElementById('modalCancel').addEventListener('click', () => this.hideModal());
        document.getElementById('modalConfirm').addEventListener('click', () => this.hideModal());
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            if (e.ctrlKey && e.key === 'y') {
                e.preventDefault();
                this.redo();
            }
            if (e.key === 'Delete' && this.currentTool === 'select') {
                this.deleteSelected();
            }
            if (e.ctrlKey && e.key === 'c') {
                this.copySelected();
            }
            if (e.ctrlKey && e.key === 'v') {
                this.pasteItems();
            }
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault();
                this.selectAll();
            }
            if (e.key === 'Escape') {
                this.cancelDrawing();
                this.clearSelection();
                this.highlightedItems = [];
                this.render();
            }
        });
    }
    
    saveState() {
        if (this.suppressHistory) return;
        
        const state = {
            parkingSpots: JSON.parse(JSON.stringify(this.parkingSpots)),
            zones: JSON.parse(JSON.stringify(this.zones)),
            roads: JSON.parse(JSON.stringify(this.roads)),
            entrances: JSON.parse(JSON.stringify(this.entrances)),
            exits: JSON.parse(JSON.stringify(this.exits)),
            gates: JSON.parse(JSON.stringify(this.gates)),
            cameras: JSON.parse(JSON.stringify(this.cameras))
        };
        
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(state);
        
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
        
        this.updateUndoRedoButtons();
    }
    
    undo() {
        if (this.historyIndex <= 0) return;
        
        this.historyIndex--;
        this.restoreState(this.history[this.historyIndex]);
        this.updateUndoRedoButtons();
    }
    
    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        
        this.historyIndex++;
        this.restoreState(this.history[this.historyIndex]);
        this.updateUndoRedoButtons();
    }
    
    restoreState(state) {
        this.suppressHistory = true;
        this.parkingSpots = JSON.parse(JSON.stringify(state.parkingSpots));
        this.zones = JSON.parse(JSON.stringify(state.zones));
        this.roads = JSON.parse(JSON.stringify(state.roads));
        this.entrances = JSON.parse(JSON.stringify(state.entrances));
        this.exits = JSON.parse(JSON.stringify(state.exits));
        this.gates = JSON.parse(JSON.stringify(state.gates));
        this.cameras = JSON.parse(JSON.stringify(state.cameras));
        this.selectedItems = [];
        this.highlightedItems = [];
        this.suppressHistory = false;
        this.render();
        this.updateStats();
        this.updatePropertiesPanel();
    }
    
    updateUndoRedoButtons() {
        document.getElementById('btnUndo').disabled = this.historyIndex <= 0;
        document.getElementById('btnRedo').disabled = this.historyIndex >= this.history.length - 1;
    }
    
    setTool(tool) {
        this.currentTool = tool;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        
        const toolNames = {
            select: '选择',
            parking: '绘制车位',
            zone: '绘制分区',
            copy: '批量复制',
            delete: '删除',
            road: '添加通道',
            oneway: '单向通道',
            entrance: '放置入口',
            exit: '放置出口',
            gate: '放置道闸',
            camera: '放置摄像机'
        };
        document.getElementById('statusTool').textContent = '当前工具: ' + toolNames[tool];
        
        if (tool === 'copy' && this.selectedItems.length === 0) {
            document.getElementById('statusTool').textContent = '批量复制: 请先选择对象，再点击目标位置';
        }
        
        this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.offsetX) / this.scale,
            y: (e.clientY - rect.top - this.offsetY) / this.scale
        };
    }
    
    snapToGrid(value) {
        return Math.round(value / this.gridSize) * this.gridSize;
    }
    
    onMouseDown(e) {
        const pos = this.getMousePos(e);
        
        if (this.currentTool === 'select') {
            this.handleSelection(pos, e);
        } else if (this.currentTool === 'copy') {
            this.pasteAtPosition(pos);
        } else if (['parking', 'zone', 'road', 'oneway'].includes(this.currentTool)) {
            this.isDrawing = true;
            this.startX = this.snapToGrid(pos.x);
            this.startY = this.snapToGrid(pos.y);
        } else if (['entrance', 'exit', 'gate', 'camera'].includes(this.currentTool)) {
            this.placeMarker(pos);
            this.saveState();
        } else if (this.currentTool === 'delete') {
            this.deleteAtPosition(pos);
        }
    }
    
    onMouseMove(e) {
        const pos = this.getMousePos(e);
        document.getElementById('statusCoords').textContent = 
            `坐标: ${Math.round(pos.x / 20 * 10) / 10}, ${Math.round(pos.y / 20 * 10) / 10}`;
        
        if (this.isDrawing) {
            const x = this.snapToGrid(pos.x);
            const y = this.snapToGrid(pos.y);
            this.tempShape = {
                x: Math.min(this.startX, x),
                y: Math.min(this.startY, y),
                width: Math.abs(x - this.startX),
                height: Math.abs(y - this.startY)
            };
            this.render();
        }
    }
    
    onMouseUp(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        const x = this.snapToGrid(pos.x);
        const y = this.snapToGrid(pos.y);
        
        const shape = {
            x: Math.min(this.startX, x),
            y: Math.min(this.startY, y),
            width: Math.abs(x - this.startX),
            height: Math.abs(y - this.startY)
        };
        
        if (shape.width > 5 && shape.height > 5) {
            if (this.currentTool === 'parking') {
                this.createParkingSpots(shape);
            } else if (this.currentTool === 'zone') {
                this.createZone(shape);
            } else if (this.currentTool === 'road' || this.currentTool === 'oneway') {
                this.createRoad(shape);
            }
            this.saveState();
        }
        
        this.isDrawing = false;
        this.tempShape = null;
        this.render();
        this.updateStats();
    }
    
    cancelDrawing() {
        this.isDrawing = false;
        this.tempShape = null;
        this.render();
    }
    
    createParkingSpots(shape) {
        const spotWidth = parseFloat(document.getElementById('spotWidth').value) * 20;
        const spotHeight = parseFloat(document.getElementById('spotHeight').value) * 20;
        const type = document.getElementById('parkingType').value;
        
        const cols = Math.max(1, Math.floor(shape.width / spotWidth));
        const rows = Math.max(1, Math.floor(shape.height / spotHeight));
        
        const newSpots = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                newSpots.push({
                    id: Date.now() + row * cols + col + Math.random(),
                    x: shape.x + col * spotWidth,
                    y: shape.y + row * spotHeight,
                    width: spotWidth - 2,
                    height: spotHeight - 2,
                    type: type,
                    occupied: false,
                    zone: null
                });
            }
        }
        this.parkingSpots.push(...newSpots);
    }
    
    createZone(shape) {
        const name = document.getElementById('zoneName').value || `分区${this.zones.length + 1}`;
        this.zones.push({
            id: Date.now() + Math.random(),
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            name: name,
            color: this.getRandomZoneColor()
        });
    }
    
    createRoad(shape) {
        const roadWidthSetting = parseFloat(document.getElementById('roadWidth').value) * 20;
        const direction = document.getElementById('roadDirection').value;
        
        let finalWidth, finalHeight;
        
        if (direction === 'horizontal') {
            finalWidth = shape.width;
            finalHeight = roadWidthSetting;
        } else {
            finalWidth = roadWidthSetting;
            finalHeight = shape.height;
        }
        
        this.roads.push({
            id: Date.now() + Math.random(),
            x: shape.x,
            y: shape.y,
            width: finalWidth,
            height: finalHeight,
            oneway: this.currentTool === 'oneway',
            direction: direction
        });
    }
    
    placeMarker(pos) {
        const x = this.snapToGrid(pos.x);
        const y = this.snapToGrid(pos.y);
        
        const marker = {
            id: Date.now() + Math.random(),
            x: x,
            y: y,
            name: ''
        };
        
        if (this.currentTool === 'entrance') {
            marker.name = `入口${this.entrances.length + 1}`;
            this.entrances.push(marker);
        } else if (this.currentTool === 'exit') {
            marker.name = `出口${this.exits.length + 1}`;
            this.exits.push(marker);
        } else if (this.currentTool === 'gate') {
            marker.name = `道闸${this.gates.length + 1}`;
            this.gates.push(marker);
        } else if (this.currentTool === 'camera') {
            marker.name = `摄像机${this.cameras.length + 1}`;
            this.cameras.push(marker);
        }
        
        this.render();
        this.updateStats();
    }
    
    getRandomZoneColor() {
        const colors = ['#e6f7ff', '#f6ffed', '#fff7e6', '#f9f0ff', '#fff1f0'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    handleSelection(pos, e) {
        const clickedItem = this.getItemAtPosition(pos);
        
        if (e.shiftKey) {
            if (clickedItem) {
                const index = this.selectedItems.findIndex(item => item.id === clickedItem.id);
                if (index >= 0) {
                    this.selectedItems.splice(index, 1);
                } else {
                    this.selectedItems.push(clickedItem);
                }
            }
        } else {
            this.selectedItems = clickedItem ? [clickedItem] : [];
            if (this.highlightedItems.length > 0) {
                this.highlightedItems = [];
            }
        }
        
        this.updatePropertiesPanel();
        this.render();
    }
    
    getItemAtPosition(pos) {
        for (let i = this.parkingSpots.length - 1; i >= 0; i--) {
            const spot = this.parkingSpots[i];
            if (pos.x >= spot.x && pos.x <= spot.x + spot.width &&
                pos.y >= spot.y && pos.y <= spot.y + spot.height) {
                return { ...spot, objType: 'parking', index: i };
            }
        }
        
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const zone = this.zones[i];
            if (pos.x >= zone.x && pos.x <= zone.x + zone.width &&
                pos.y >= zone.y && pos.y <= zone.y + zone.height) {
                return { ...zone, objType: 'zone', index: i };
            }
        }
        
        for (let i = this.roads.length - 1; i >= 0; i--) {
            const road = this.roads[i];
            if (pos.x >= road.x && pos.x <= road.x + road.width &&
                pos.y >= road.y && pos.y <= road.y + road.height) {
                return { ...road, objType: 'road', index: i };
            }
        }
        
        for (let i = this.entrances.length - 1; i >= 0; i--) {
            const e = this.entrances[i];
            if (Math.abs(pos.x - e.x) < 20 && Math.abs(pos.y - e.y) < 20) {
                return { ...e, objType: 'entrance', index: i };
            }
        }
        
        for (let i = this.exits.length - 1; i >= 0; i--) {
            const e = this.exits[i];
            if (Math.abs(pos.x - e.x) < 20 && Math.abs(pos.y - e.y) < 20) {
                return { ...e, objType: 'exit', index: i };
            }
        }
        
        for (let i = this.gates.length - 1; i >= 0; i--) {
            const g = this.gates[i];
            if (Math.abs(pos.x - g.x) < 20 && Math.abs(pos.y - g.y) < 20) {
                return { ...g, objType: 'gate', index: i };
            }
        }
        
        for (let i = this.cameras.length - 1; i >= 0; i--) {
            const c = this.cameras[i];
            if (Math.abs(pos.x - c.x) < 20 && Math.abs(pos.y - c.y) < 20) {
                return { ...c, objType: 'camera', index: i };
            }
        }
        
        return null;
    }
    
    updatePropertiesPanel() {
        const panel = document.getElementById('propertiesPanel');
        const content = document.getElementById('propertiesContent');
        
        if (this.selectedItems.length === 0) {
            panel.style.display = 'none';
            return;
        }
        
        if (this.selectedItems.length > 1) {
            panel.style.display = 'block';
            content.innerHTML = `
                <p style="font-size:12px;color:#666;margin-bottom:10px">已选择 ${this.selectedItems.length} 个对象</p>
                <button class="prop-delete-btn" onclick="window.app.deleteSelected()">删除选中</button>
            `;
            return;
        }
        
        const item = this.selectedItems[0];
        panel.style.display = 'block';
        
        let html = '';
        
        if (item.objType === 'parking') {
            const spotType = item.type;
            const zoneOptions = this.zones.map((z, i) => 
                `<option value="${i}" ${item.zone === i ? 'selected' : ''}>${z.name}</option>`
            ).join('');
            
            html = `
                <div class="form-group">
                    <label>车位类型</label>
                    <select id="propSpotType">
                        <option value="normal" ${spotType === 'normal' ? 'selected' : ''}>普通车位</option>
                        <option value="charging" ${spotType === 'charging' ? 'selected' : ''}>充电车位 🔌</option>
                        <option value="handicap" ${spotType === 'handicap' ? 'selected' : ''}>无障碍车位 ♿</option>
                        <option value="compact" ${spotType === 'compact' ? 'selected' : ''}>小型车位 🚗</option>
                        <option value="large" ${spotType === 'large' ? 'selected' : ''}>大型车位 🚐</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>宽度 (米)</label>
                    <input type="number" id="propSpotWidth" value="${Math.round(item.width / 20 * 10) / 10}" step="0.1" min="1.5" max="4">
                </div>
                <div class="form-group">
                    <label>高度 (米)</label>
                    <input type="number" id="propSpotHeight" value="${Math.round(item.height / 20 * 10) / 10}" step="0.1" min="3" max="8">
                </div>
                <div class="form-group">
                    <label>所属分区</label>
                    <select id="propSpotZone">
                        <option value="">无</option>
                        ${zoneOptions}
                    </select>
                </div>
                <div class="prop-actions">
                    <button class="prop-apply-btn" onclick="window.app.applySpotProperties()">应用</button>
                    <button class="prop-delete-btn" onclick="window.app.deleteSelected()">删除</button>
                </div>
            `;
        } else if (item.objType === 'road') {
            html = `
                <div class="form-group">
                    <label>通道类型</label>
                    <select id="propRoadType">
                        <option value="0" ${!item.oneway ? 'selected' : ''}>双向通道</option>
                        <option value="1" ${item.oneway ? 'selected' : ''}>单向通道</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>方向</label>
                    <select id="propRoadDirection">
                        <option value="horizontal" ${item.direction === 'horizontal' ? 'selected' : ''}>水平</option>
                        <option value="vertical" ${item.direction === 'vertical' ? 'selected' : ''}>垂直</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>宽度 (米)</label>
                    <input type="number" id="propRoadWidth" value="${Math.round((item.direction === 'horizontal' ? item.height : item.width) / 20 * 10) / 10}" step="0.5" min="3" max="12">
                </div>
                <div class="prop-actions">
                    <button class="prop-apply-btn" onclick="window.app.applyRoadProperties()">应用</button>
                    <button class="prop-delete-btn" onclick="window.app.deleteSelected()">删除</button>
                </div>
            `;
        } else if (item.objType === 'zone') {
            html = `
                <div class="form-group">
                    <label>分区名称</label>
                    <input type="text" id="propZoneName" value="${item.name}">
                </div>
                <div class="form-group">
                    <label>颜色</label>
                    <input type="color" id="propZoneColor" value="${this.hexFromRgb(item.color)}">
                </div>
                <div class="prop-actions">
                    <button class="prop-apply-btn" onclick="window.app.applyZoneProperties()">应用</button>
                    <button class="prop-delete-btn" onclick="window.app.deleteSelected()">删除</button>
                </div>
            `;
        } else if (['entrance', 'exit', 'gate', 'camera'].includes(item.objType)) {
            const typeNames = { entrance: '入口', exit: '出口', gate: '道闸', camera: '摄像机' };
            html = `
                <div class="form-group">
                    <label>${typeNames[item.objType]}名称</label>
                    <input type="text" id="propMarkerName" value="${item.name || ''}">
                </div>
                <div class="prop-actions">
                    <button class="prop-apply-btn" onclick="window.app.applyMarkerProperties()">应用</button>
                    <button class="prop-delete-btn" onclick="window.app.deleteSelected()">删除</button>
                </div>
            `;
        }
        
        content.innerHTML = html;
    }
    
    hexFromRgb(colorName) {
        const colors = {
            '#e6f7ff': '#e6f7ff',
            '#f6ffed': '#f6ffed',
            '#fff7e6': '#fff7e6',
            '#f9f0ff': '#f9f0ff',
            '#fff1f0': '#fff1f0'
        };
        return colors[colorName] || '#e6f7ff';
    }
    
    applySpotProperties() {
        if (this.selectedItems.length !== 1 || this.selectedItems[0].objType !== 'parking') return;
        
        const item = this.selectedItems[0];
        const spot = this.parkingSpots[item.index];
        
        spot.type = document.getElementById('propSpotType').value;
        spot.width = parseFloat(document.getElementById('propSpotWidth').value) * 20 - 2;
        spot.height = parseFloat(document.getElementById('propSpotHeight').value) * 20 - 2;
        
        const zoneVal = document.getElementById('propSpotZone').value;
        spot.zone = zoneVal === '' ? null : parseInt(zoneVal);
        
        this.saveState();
        this.render();
        this.updateStats();
    }
    
    applyRoadProperties() {
        if (this.selectedItems.length !== 1 || this.selectedItems[0].objType !== 'road') return;
        
        const item = this.selectedItems[0];
        const road = this.roads[item.index];
        
        road.oneway = document.getElementById('propRoadType').value === '1';
        road.direction = document.getElementById('propRoadDirection').value;
        const newWidth = parseFloat(document.getElementById('propRoadWidth').value) * 20;
        
        if (road.direction === 'horizontal') {
            road.height = newWidth;
        } else {
            road.width = newWidth;
        }
        
        this.saveState();
        this.render();
    }
    
    applyZoneProperties() {
        if (this.selectedItems.length !== 1 || this.selectedItems[0].objType !== 'zone') return;
        
        const item = this.selectedItems[0];
        const zone = this.zones[item.index];
        
        zone.name = document.getElementById('propZoneName').value;
        zone.color = document.getElementById('propZoneColor').value;
        
        this.saveState();
        this.render();
    }
    
    applyMarkerProperties() {
        if (this.selectedItems.length !== 1) return;
        
        const item = this.selectedItems[0];
        let target;
        
        if (item.objType === 'entrance') target = this.entrances[item.index];
        else if (item.objType === 'exit') target = this.exits[item.index];
        else if (item.objType === 'gate') target = this.gates[item.index];
        else if (item.objType === 'camera') target = this.cameras[item.index];
        
        if (target) {
            target.name = document.getElementById('propMarkerName').value;
            this.saveState();
            this.render();
        }
    }
    
    deleteAtPosition(pos) {
        const item = this.getItemAtPosition(pos);
        if (item) {
            this.deleteItem(item);
            this.saveState();
        }
    }
    
    deleteItem(item) {
        if (item.objType === 'parking') {
            this.parkingSpots.splice(item.index, 1);
        } else if (item.objType === 'zone') {
            this.zones.splice(item.index, 1);
        } else if (item.objType === 'road') {
            this.roads.splice(item.index, 1);
        } else if (item.objType === 'entrance') {
            this.entrances.splice(item.index, 1);
        } else if (item.objType === 'exit') {
            this.exits.splice(item.index, 1);
        } else if (item.objType === 'gate') {
            this.gates.splice(item.index, 1);
        } else if (item.objType === 'camera') {
            this.cameras.splice(item.index, 1);
        }
        this.selectedItems = [];
        this.highlightedItems = [];
        this.updatePropertiesPanel();
        this.render();
        this.updateStats();
    }
    
    deleteSelected() {
        if (this.selectedItems.length === 0) return;
        
        const sorted = [...this.selectedItems].sort((a, b) => {
            const order = { parking: 0, zone: 1, road: 2, entrance: 3, exit: 4, gate: 5, camera: 6 };
            return (order[b.objType] || 0) - (order[a.objType] || 0) || b.index - a.index;
        });
        
        sorted.forEach(item => {
            if (item.objType === 'parking') {
                const idx = this.parkingSpots.findIndex(s => s.id === item.id);
                if (idx >= 0) this.parkingSpots.splice(idx, 1);
            } else if (item.objType === 'zone') {
                const idx = this.zones.findIndex(z => z.id === item.id);
                if (idx >= 0) this.zones.splice(idx, 1);
            } else if (item.objType === 'road') {
                const idx = this.roads.findIndex(r => r.id === item.id);
                if (idx >= 0) this.roads.splice(idx, 1);
            } else if (item.objType === 'entrance') {
                const idx = this.entrances.findIndex(e => e.id === item.id);
                if (idx >= 0) this.entrances.splice(idx, 1);
            } else if (item.objType === 'exit') {
                const idx = this.exits.findIndex(e => e.id === item.id);
                if (idx >= 0) this.exits.splice(idx, 1);
            } else if (item.objType === 'gate') {
                const idx = this.gates.findIndex(g => g.id === item.id);
                if (idx >= 0) this.gates.splice(idx, 1);
            } else if (item.objType === 'camera') {
                const idx = this.cameras.findIndex(c => c.id === item.id);
                if (idx >= 0) this.cameras.splice(idx, 1);
            }
        });
        
        this.selectedItems = [];
        this.highlightedItems = [];
        this.updatePropertiesPanel();
        this.saveState();
        this.render();
        this.updateStats();
    }
    
    clearSelection() {
        this.selectedItems = [];
        this.highlightedItems = [];
        this.updatePropertiesPanel();
        this.render();
    }
    
    selectAll() {
        this.selectedItems = [
            ...this.parkingSpots.map((s, i) => ({ ...s, objType: 'parking', index: i })),
            ...this.zones.map((z, i) => ({ ...z, objType: 'zone', index: i })),
            ...this.roads.map((r, i) => ({ ...r, objType: 'road', index: i })),
            ...this.entrances.map((e, i) => ({ ...e, objType: 'entrance', index: i })),
            ...this.exits.map((e, i) => ({ ...e, objType: 'exit', index: i })),
            ...this.gates.map((g, i) => ({ ...g, objType: 'gate', index: i })),
            ...this.cameras.map((c, i) => ({ ...c, objType: 'camera', index: i }))
        ];
        this.updatePropertiesPanel();
        this.render();
    }
    
    copySelected() {
        this.clipboard = JSON.parse(JSON.stringify(this.selectedItems));
    }
    
    pasteItems() {
        if (this.clipboard.length === 0) return;
        
        const offset = 40;
        const newItems = [];
        
        this.clipboard.forEach(item => {
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = Date.now() + Math.random();
            newItem.x += offset;
            newItem.y += offset;
            
            if (item.objType === 'parking') {
                this.parkingSpots.push(newItem);
                newItems.push({ ...newItem, objType: 'parking', index: this.parkingSpots.length - 1 });
            } else if (item.objType === 'zone') {
                this.zones.push(newItem);
                newItems.push({ ...newItem, objType: 'zone', index: this.zones.length - 1 });
            } else if (item.objType === 'road') {
                this.roads.push(newItem);
                newItems.push({ ...newItem, objType: 'road', index: this.roads.length - 1 });
            }
        });
        
        this.selectedItems = newItems;
        this.updatePropertiesPanel();
        this.saveState();
        this.render();
        this.updateStats();
    }
    
    pasteAtPosition(pos) {
        if (this.selectedItems.length === 0) {
            alert('请先用选择工具选中要复制的对象');
            this.setTool('select');
            return;
        }
        
        this.copySelected();
        
        if (this.clipboard.length === 0) return;
        
        let minX = Infinity, minY = Infinity;
        this.clipboard.forEach(item => {
            minX = Math.min(minX, item.x);
            minY = Math.min(minY, item.y);
        });
        
        const offsetX = this.snapToGrid(pos.x) - minX;
        const offsetY = this.snapToGrid(pos.y) - minY;
        
        const newItems = [];
        
        this.clipboard.forEach(item => {
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = Date.now() + Math.random();
            newItem.x += offsetX;
            newItem.y += offsetY;
            
            if (item.objType === 'parking') {
                this.parkingSpots.push(newItem);
                newItems.push({ ...newItem, objType: 'parking', index: this.parkingSpots.length - 1 });
            } else if (item.objType === 'zone') {
                this.zones.push(newItem);
                newItems.push({ ...newItem, objType: 'zone', index: this.zones.length - 1 });
            } else if (item.objType === 'road') {
                this.roads.push(newItem);
                newItems.push({ ...newItem, objType: 'road', index: this.roads.length - 1 });
            }
        });
        
        this.selectedItems = newItems;
        this.updatePropertiesPanel();
        this.saveState();
        this.render();
        this.updateStats();
    }
    
    batchCopy() {
        if (this.selectedItems.length === 0) {
            alert('请先选择要复制的车位');
            return;
        }
        
        this.setTool('copy');
        document.getElementById('statusTool').textContent = '批量复制: 点击目标位置粘贴选中对象';
    }
    
    clearAll() {
        this.parkingSpots = [];
        this.zones = [];
        this.roads = [];
        this.entrances = [];
        this.exits = [];
        this.gates = [];
        this.cameras = [];
        this.selectedItems = [];
        this.simCars = [];
        this.validationIssues = [];
        this.highlightedItems = [];
        this.updatePropertiesPanel();
        this.saveState();
        this.render();
        this.updateStats();
        this.updateValidationResults([]);
    }
    
    zoom(delta) {
        const newScale = Math.max(0.3, Math.min(3, this.scale + delta));
        this.scale = newScale;
        document.getElementById('zoomLevel').textContent = Math.round(this.scale * 100) + '%';
        this.render();
    }
    
    zoomFit() {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        document.getElementById('zoomLevel').textContent = '100%';
        this.render();
    }
    
    render() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        this.drawGrid();
        this.drawRoads();
        this.drawZones();
        this.drawParkingSpots();
        this.drawMarkers();
        this.drawRoutes();
        this.drawSimCars();
        
        if (this.tempShape) {
            this.drawTempShape();
        }
        
        this.drawSelection();
        this.drawValidationHighlights();
        
        ctx.restore();
    }
    
    drawGrid() {
        if (!this.showGrid) return;
        
        const ctx = this.ctx;
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 0.5;
        
        for (let x = 0; x <= this.canvas.width; x += this.gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.canvas.height);
            ctx.stroke();
        }
        
        for (let y = 0; y <= this.canvas.height; y += this.gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.canvas.width, y);
            ctx.stroke();
        }
    }
    
    drawRoads() {
        const ctx = this.ctx;
        
        this.roads.forEach(road => {
            ctx.fillStyle = '#555';
            ctx.fillRect(road.x, road.y, road.width, road.height);
            
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            if (road.direction === 'horizontal') {
                const midY = road.y + road.height / 2;
                ctx.moveTo(road.x, midY);
                ctx.lineTo(road.x + road.width, midY);
            } else {
                const midX = road.x + road.width / 2;
                ctx.moveTo(midX, road.y);
                ctx.lineTo(midX, road.y + road.height);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            
            if (road.oneway) {
                ctx.fillStyle = '#fff';
                ctx.font = '16px Arial';
                const arrows = {
                    'horizontal': '➡️',
                    'vertical': '⬇️'
                };
                const arrow = arrows[road.direction] || '➡️';
                ctx.fillText(arrow, road.x + road.width / 2 - 8, road.y + road.height / 2 + 6);
            }
        });
    }
    
    drawZones() {
        const ctx = this.ctx;
        
        this.zones.forEach(zone => {
            ctx.fillStyle = zone.color;
            ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
            
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#666';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(zone.name, zone.x + 10, zone.y + 25);
        });
    }
    
    drawParkingSpots() {
        const ctx = this.ctx;
        
        this.parkingSpots.forEach(spot => {
            const colors = {
                normal: '#ffffff',
                charging: '#e6f7ff',
                handicap: '#fff1f0',
                compact: '#f6ffed',
                large: '#fff7e6'
            };
            
            const borderColors = {
                normal: '#1890ff',
                charging: '#1890ff',
                handicap: '#ff4d4f',
                compact: '#52c41a',
                large: '#fa8c16'
            };
            
            ctx.fillStyle = spot.occupied ? '#d9d9d9' : colors[spot.type];
            ctx.fillRect(spot.x, spot.y, spot.width, spot.height);
            
            ctx.strokeStyle = borderColors[spot.type];
            ctx.lineWidth = 2;
            ctx.strokeRect(spot.x, spot.y, spot.width, spot.height);
            
            ctx.font = '16px Arial';
            if (spot.type === 'charging') {
                ctx.fillText('🔌', spot.x + spot.width / 2 - 8, spot.y + spot.height / 2 + 6);
            } else if (spot.type === 'handicap') {
                ctx.fillText('♿', spot.x + spot.width / 2 - 8, spot.y + spot.height / 2 + 6);
            }
        });
    }
    
    drawMarkers() {
        const ctx = this.ctx;
        ctx.font = '24px Arial';
        
        this.entrances.forEach(e => {
            ctx.fillText('⬇️', e.x - 12, e.y + 8);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#52c41a';
            ctx.fillText(e.name || '入口', e.x - 15, e.y + 25);
            ctx.font = '24px Arial';
        });
        
        this.exits.forEach(e => {
            ctx.fillText('⬆️', e.x - 12, e.y + 8);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#ff4d4f';
            ctx.fillText(e.name || '出口', e.x - 15, e.y + 25);
            ctx.font = '24px Arial';
        });
        
        this.gates.forEach(g => {
            ctx.fillText('🚧', g.x - 12, g.y + 8);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#666';
            ctx.fillText(g.name || '道闸', g.x - 15, g.y + 25);
            ctx.font = '24px Arial';
        });
        
        this.cameras.forEach(c => {
            ctx.fillText('📹', c.x - 12, c.y + 8);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#666';
            ctx.fillText(c.name || '摄像机', c.x - 20, c.y + 25);
            ctx.font = '24px Arial';
        });
    }
    
    drawRoutes() {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(24, 144, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        this.routes.forEach(route => {
            ctx.beginPath();
            ctx.moveTo(route[0].x, route[0].y);
            for (let i = 1; i < route.length; i++) {
                ctx.lineTo(route[i].x, route[i].y);
            }
            ctx.stroke();
        });
        
        ctx.setLineDash([]);
    }
    
    drawSimCars() {
        const ctx = this.ctx;
        
        this.simCars.forEach(car => {
            if (car.blocked) {
                ctx.fillStyle = '#ff4d4f';
            } else {
                ctx.fillStyle = car.color || '#1890ff';
            }
            ctx.beginPath();
            ctx.arc(car.x, car.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            if (car.queuing) {
                ctx.strokeStyle = '#fa8c16';
                ctx.lineWidth = 2;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.arc(car.x, car.y, 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            if (car.blocked) {
                ctx.strokeStyle = '#ff4d4f';
                ctx.lineWidth = 3;
                ctx.setLineDash([4, 2]);
                ctx.beginPath();
                ctx.arc(car.x, car.y, 14, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Arial';
                ctx.fillText('!', car.x - 3, car.y + 4);
            }
        });
    }
    
    drawTempShape() {
        const ctx = this.ctx;
        const shape = this.tempShape;
        
        ctx.strokeStyle = '#1890ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(24, 144, 255, 0.1)';
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
    }
    
    drawSelection() {
        if (this.selectedItems.length === 0) return;
        
        const ctx = this.ctx;
        ctx.strokeStyle = '#1890ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        
        this.selectedItems.forEach(item => {
            let w = item.width || 30;
            let h = item.height || 30;
            let x = item.x;
            let y = item.y;
            
            if (['entrance', 'exit', 'gate', 'camera'].includes(item.objType)) {
                x = item.x - 15;
                y = item.y - 15;
                w = 30;
                h = 40;
            }
            
            ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        });
        
        ctx.setLineDash([]);
    }
    
    drawValidationHighlights() {
        if (this.highlightedItems.length === 0) return;
        
        const ctx = this.ctx;
        ctx.strokeStyle = '#ff4d4f';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        
        this.highlightedItems.forEach(item => {
            let w = item.width || 30;
            let h = item.height || 30;
            let x = item.x;
            let y = item.y;
            
            if (['entrance', 'exit', 'gate', 'camera'].includes(item.objType)) {
                x = item.x - 15;
                y = item.y - 15;
                w = 30;
                h = 40;
            }
            
            ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
        });
        
        ctx.setLineDash([]);
    }
    
    updateStats() {
        const totalSpots = this.parkingSpots.length;
        const chargingSpots = this.parkingSpots.filter(s => s.type === 'charging').length;
        const handicapSpots = this.parkingSpots.filter(s => s.type === 'handicap').length;
        
        document.getElementById('statusCount').textContent = 
            `车位总数: ${totalSpots} | 充电: ${chargingSpots} | 无障碍: ${handicapSpots}`;
        
        document.getElementById('statTotalSpots').textContent = totalSpots;
        document.getElementById('statCharging').textContent = chargingSpots;
        document.getElementById('statHandicap').textContent = handicapSpots;
        
        const avgParkingTime = parseFloat(document.getElementById('avgParkingTime').value) || 60;
        const turnoverRate = Math.round((1440 / avgParkingTime) * 10) / 10;
        document.getElementById('statTurnover').textContent = turnoverRate;
        
        const dailyCars = Math.round(totalSpots * turnoverRate * 0.8);
        document.getElementById('statDailyCars').textContent = dailyCars;
        
        const firstHourRate = parseFloat(document.getElementById('firstHourRate').value) || 8;
        const hourlyRate = parseFloat(document.getElementById('hourlyRate').value) || 5;
        const dailyMax = parseFloat(document.getElementById('dailyMax').value) || 60;
        const freeMinutes = parseFloat(document.getElementById('freeMinutes').value) || 15;
        const chargingFee = parseFloat(document.getElementById('chargingFee').value) || 1.2;
        const evRatio = parseFloat(document.getElementById('evRatio').value) || 30;
        const avgCharge = parseFloat(document.getElementById('avgCharge').value) || 20;
        
        const avgFee = this.calculateAverageFee(avgParkingTime, firstHourRate, hourlyRate, dailyMax, freeMinutes);
        const parkingRevenue = Math.round(dailyCars * avgFee);
        
        const evCars = Math.round(dailyCars * evRatio / 100);
        const chargingCars = Math.min(evCars, chargingSpots * turnoverRate * 0.8);
        const chargingRevenue = Math.round(chargingCars * avgCharge * chargingFee);
        
        const totalRevenue = parkingRevenue + chargingRevenue;
        
        document.getElementById('statDailyRevenue').textContent = '¥' + totalRevenue.toLocaleString();
        document.getElementById('statChargingRevenue').textContent = '¥' + chargingRevenue.toLocaleString();
        
        const peakTraffic = parseFloat(document.getElementById('peakTraffic').value) || 200;
        const queueLength = Math.max(0, Math.round((peakTraffic - totalSpots * 3) / 10));
        document.getElementById('statQueueLength').textContent = queueLength;
        
        const findTime = Math.round(Math.sqrt(totalSpots) * 0.5 * 10) / 10;
        document.getElementById('statFindTime').textContent = findTime;
        
        this.updateComparison(totalSpots, chargingSpots, dailyCars, totalRevenue, chargingRevenue);
    }
    
    calculateAverageFee(parkingMinutes, firstHourRate, hourlyRate, dailyMax, freeMinutes) {
        if (parkingMinutes <= freeMinutes) return 0;
        
        const billableMinutes = parkingMinutes - freeMinutes;
        let fee = 0;
        
        if (billableMinutes <= 60) {
            fee = firstHourRate;
        } else {
            fee = firstHourRate + Math.ceil((billableMinutes - 60) / 60) * hourlyRate;
        }
        
        return Math.min(fee, dailyMax);
    }
    
    updateComparison(afterSpots, afterCharging, afterDailyCars, afterRevenue, afterChargeRev) {
        const beforeSpots = parseInt(document.getElementById('beforeSpots').value) || 0;
        const beforeCharging = parseInt(document.getElementById('beforeCharging').value) || 0;
        
        const avgParkingTime = parseFloat(document.getElementById('avgParkingTime').value) || 60;
        const turnoverRate = Math.round((1440 / avgParkingTime) * 10) / 10;
        const chargingFee = parseFloat(document.getElementById('chargingFee').value) || 1.2;
        const evRatio = parseFloat(document.getElementById('evRatio').value) || 30;
        const avgCharge = parseFloat(document.getElementById('avgCharge').value) || 20;
        
        document.getElementById('afterSpots').textContent = afterSpots;
        document.getElementById('afterCharging').textContent = afterCharging;
        document.getElementById('afterDaily').textContent = afterDailyCars;
        document.getElementById('afterRevenue').textContent = '¥' + afterRevenue.toLocaleString();
        document.getElementById('afterChargeRev').textContent = '¥' + afterChargeRev.toLocaleString();
        
        const diffSpots = afterSpots - beforeSpots;
        const diffCharging = afterCharging - beforeCharging;
        const beforeDaily = beforeSpots * 4;
        const diffDaily = afterDailyCars - beforeDaily;
        const beforeRev = beforeDaily * 8;
        const diffRev = afterRevenue - beforeRev;
        
        const beforeEvCars = Math.round(beforeDaily * evRatio / 100);
        const beforeChargingCars = Math.min(beforeEvCars, beforeCharging * turnoverRate * 0.8);
        const beforeChargeRev = Math.round(beforeChargingCars * avgCharge * chargingFee);
        const diffChargeRev = afterChargeRev - beforeChargeRev;
        
        this.setDiff('diffSpots', diffSpots, '+');
        this.setDiff('diffCharging', diffCharging, '+');
        this.setDiff('diffDaily', diffDaily, '+');
        this.setDiff('diffRevenue', diffRev, '+¥');
        this.setDiff('diffChargeRev', diffChargeRev, '+¥');
        
        document.getElementById('beforeDaily').textContent = beforeDaily;
        document.getElementById('beforeRevenue').textContent = beforeRev.toLocaleString();
        document.getElementById('beforeChargeRev').textContent = beforeChargeRev.toLocaleString();
    }
    
    setDiff(id, value, prefix) {
        const el = document.getElementById(id);
        el.textContent = (value >= 0 ? prefix : '') + value;
        el.className = value >= 0 ? 'diff-positive' : 'diff-negative';
    }
    
    validatePlan() {
        const issues = [];
        this.highlightedItems = [];
        
        if (this.entrances.length === 0) {
            issues.push({
                type: 'error',
                message: '❌ 缺少入口：请至少放置一个入口',
                items: []
            });
        }
        
        if (this.exits.length === 0) {
            issues.push({
                type: 'warning',
                message: '⚠️ 缺少出口：建议至少放置一个出口',
                items: []
            });
        }
        
        if (this.parkingSpots.length > 0 && this.roads.length === 0) {
            issues.push({
                type: 'warning',
                message: '⚠️ 缺少通道：建议绘制通道以便车辆通行',
                items: []
            });
        }
        
        const overlaps = this.findOverlaps();
        if (overlaps.length > 0) {
            issues.push({
                type: 'error',
                message: `❌ 检测到 ${overlaps.length} 处车位重叠`,
                items: overlaps
            });
            this.highlightedItems.push(...overlaps);
        }
        
        const narrowRoads = this.roads.filter(r => {
            const width = r.direction === 'horizontal' ? r.height : r.width;
            return width < 80;
        });
        if (narrowRoads.length > 0) {
            issues.push({
                type: 'warning',
                message: `⚠️ ${narrowRoads.length} 条通道过窄（<4米），可能影响通行`,
                items: narrowRoads.map(r => ({ ...r, objType: 'road' }))
            });
            this.highlightedItems.push(...narrowRoads.map(r => ({ ...r, objType: 'road' })));
        }
        
        if (this.entrances.length > 0 && this.gates.length === 0) {
            issues.push({
                type: 'warning',
                message: '⚠️ 未配置道闸设备：建议在入口处配置道闸',
                items: this.entrances.map(e => ({ ...e, objType: 'entrance' }))
            });
            this.highlightedItems.push(...this.entrances.map(e => ({ ...e, objType: 'entrance' })));
        } else if (this.entrances.length > 0) {
            const uncoveredEntrances = this.entrances.filter(e => {
                const hasGate = this.gates.some(g => 
                    Math.abs(g.x - e.x) < 100 && Math.abs(g.y - e.y) < 100
                );
                return !hasGate;
            });
            if (uncoveredEntrances.length > 0) {
                issues.push({
                    type: 'info',
                    message: `ℹ️ ${uncoveredEntrances.length} 个入口附近未检测到道闸`,
                    items: uncoveredEntrances.map(e => ({ ...e, objType: 'entrance' }))
                });
                this.highlightedItems.push(...uncoveredEntrances.map(e => ({ ...e, objType: 'entrance' })));
            }
        }
        
        if (this.entrances.length > 0 && this.cameras.length === 0) {
            issues.push({
                type: 'warning',
                message: '⚠️ 未配置监控摄像机：建议在入口附近配置摄像机',
                items: this.entrances.map(e => ({ ...e, objType: 'entrance' }))
            });
            this.highlightedItems.push(...this.entrances.map(e => ({ ...e, objType: 'entrance' })));
        } else if (this.entrances.length > 0) {
            const noCameraEntrances = this.entrances.filter(e => {
                const hasCamera = this.cameras.some(c => 
                    Math.abs(c.x - e.x) < 150 && Math.abs(c.y - e.y) < 150
                );
                return !hasCamera;
            });
            if (noCameraEntrances.length > 0) {
                issues.push({
                    type: 'info',
                    message: `ℹ️ ${noCameraEntrances.length} 个入口附近未检测到摄像机`,
                    items: noCameraEntrances.map(e => ({ ...e, objType: 'entrance' }))
                });
                this.highlightedItems.push(...noCameraEntrances.map(e => ({ ...e, objType: 'entrance' })));
            }
        }
        
        const handicapCount = this.parkingSpots.filter(s => s.type === 'handicap').length;
        const requiredHandicap = Math.ceil(this.parkingSpots.length * 0.02);
        if (this.parkingSpots.length > 50 && handicapCount < requiredHandicap) {
            issues.push({
                type: 'warning',
                message: `⚠️ 无障碍车位不足：建议至少设置 ${requiredHandicap} 个（当前${handicapCount}个）`,
                items: []
            });
        }
        
        if (issues.length === 0) {
            issues.push({
                type: 'success',
                message: '✅ 方案校验通过！未发现明显问题',
                items: []
            });
        }
        
        this.validationIssues = issues;
        this.updateValidationResults(issues);
        this.render();
    }
    
    findOverlaps() {
        const overlaps = [];
        const overlapSet = new Set();
        
        for (let i = 0; i < this.parkingSpots.length; i++) {
            for (let j = i + 1; j < this.parkingSpots.length; j++) {
                const a = this.parkingSpots[i];
                const b = this.parkingSpots[j];
                
                const overlap = !(a.x + a.width <= b.x || 
                                  b.x + b.width <= a.x || 
                                  a.y + a.height <= b.y || 
                                  b.y + b.height <= a.y);
                
                if (overlap) {
                    if (!overlapSet.has(a.id)) {
                        overlapSet.add(a.id);
                        overlaps.push({ ...a, objType: 'parking', index: i });
                    }
                    if (!overlapSet.has(b.id)) {
                        overlapSet.add(b.id);
                        overlaps.push({ ...b, objType: 'parking', index: j });
                    }
                }
            }
        }
        
        return overlaps;
    }
    
    updateValidationResults(issues) {
        const container = document.getElementById('validationResults');
        
        if (issues.length === 0) {
            container.innerHTML = '<div class="validation-empty">点击「开始校验」检测方案问题</div>';
            return;
        }
        
        container.innerHTML = issues.map((issue, idx) => `
            <div class="validation-item validation-${issue.type}" 
                 onclick="window.app.focusValidationIssue(${idx})">
                ${issue.message}
            </div>
        `).join('');
    }
    
    focusValidationIssue(idx) {
        const issue = this.validationIssues[idx];
        if (!issue || issue.items.length === 0) return;
        
        this.highlightedItems = issue.items;
        this.render();
    }
    
    startSimulation() {
        this.simulationRunning = true;
        this.simTime = 8 * 60;
        this.simCars = [];
        this.routes = [];
        this.simStats = { entered: 0, exited: 0, blocked: 0 };
        
        document.getElementById('btnStartSimulation').disabled = true;
        document.getElementById('btnStopSimulation').disabled = false;
        document.getElementById('simulationPanel').style.display = 'block';
        
        this.parkingSpots.forEach(s => s.occupied = false);
        
        this.simInterval = setInterval(() => this.simulateTick(), 500 / this.simulationSpeed);
    }
    
    stopSimulation() {
        this.simulationRunning = false;
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
        
        document.getElementById('btnStartSimulation').disabled = false;
        document.getElementById('btnStopSimulation').disabled = true;
        
        this.parkingSpots.forEach(s => s.occupied = false);
        this.simCars = [];
        this.routes = [];
        this.render();
    }
    
    simulateTick() {
        this.simTime += 1;
        if (this.simTime >= 24 * 60) {
            this.simTime = 0;
        }
        
        const hours = Math.floor(this.simTime / 60);
        const mins = this.simTime % 60;
        document.getElementById('simTime').textContent = 
            `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        
        const isPeak = this.isPeakTime(this.simTime);
        const trafficRate = isPeak ? 
            parseFloat(document.getElementById('peakTraffic').value) : 
            parseFloat(document.getElementById('offPeakTraffic').value);
        
        if (this.entrances.length > 0 && Math.random() < trafficRate / 60 / 60 * this.simulationSpeed) {
            this.addSimCar();
        }
        
        this.updateSimCars();
        this.removeExitedCars();
        
        const occupied = this.parkingSpots.filter(s => s.occupied).length;
        const empty = this.parkingSpots.length - occupied;
        const queuing = this.simCars.filter(c => c.queuing).length;
        const blocked = this.simCars.filter(c => c.blocked).length;
        const cannotExit = this.simCars.filter(c => c.cannotExit).length;
        
        document.getElementById('simCars').textContent = occupied;
        document.getElementById('simEmpty').textContent = empty;
        document.getElementById('simEntered').textContent = this.simStats.entered;
        document.getElementById('simExited').textContent = this.simStats.exited;
        document.getElementById('simQueue').textContent = queuing + blocked + cannotExit;
        
        let status = 'running';
        let statusText = '运行中';
        if (this.entrances.length === 0) {
            status = 'no-entrance';
            statusText = '无入口';
        } else if (this.parkingSpots.length > 0 && this.roads.length === 0) {
            status = 'no-road';
            statusText = '无通行通道';
        } else if (cannotExit > 0) {
            status = 'unreachable';
            statusText = '无法离场';
        } else if (blocked > 0 && queuing === 0) {
            status = 'unreachable';
            statusText = '车位不可达';
        } else if (empty === 0 && queuing > 0) {
            status = 'full';
            statusText = '车位已满';
        } else if (queuing > 5) {
            status = 'queue';
            statusText = '排队中';
        }
        
        const statusEl = document.getElementById('simStatus');
        statusEl.className = `sim-status ${status}`;
        statusEl.textContent = statusText;
        
        this.render();
    }
    
    isPeakTime(minutes) {
        const toMin = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };
        
        const peak1Start = toMin(document.getElementById('peakStart').value);
        const peak1End = toMin(document.getElementById('peakEnd').value);
        const peak2Start = toMin(document.getElementById('peakStart2').value);
        const peak2End = toMin(document.getElementById('peakEnd2').value);
        
        return (minutes >= peak1Start && minutes <= peak1End) ||
               (minutes >= peak2Start && minutes <= peak2End);
    }
    
    addSimCar() {
        if (this.entrances.length === 0) return;
        
        const entrance = this.entrances[Math.floor(Math.random() * this.entrances.length)];
        const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];
        const evRatio = parseFloat(document.getElementById('evRatio').value) || 30;
        const isEV = Math.random() * 100 < evRatio;
        
        this.simCars.push({
            id: Date.now() + Math.random(),
            x: entrance.x,
            y: entrance.y,
            targetX: 0,
            targetY: 0,
            color: isEV ? '#52c41a' : colors[Math.floor(Math.random() * colors.length)],
            isEV: isEV,
            queuing: true,
            entered: false,
            parked: false,
            exiting: false,
            blocked: false,
            parkStartTime: 0,
            parkDuration: (parseFloat(document.getElementById('avgParkingTime').value) || 60) * (0.5 + Math.random()),
            route: [],
            routeIndex: 0,
            entranceId: entrance.id
        });
    }
    
    updateSimCars() {
        const allAccessibleSpots = this.getAllAccessibleSpots();
        
        this.simCars.forEach(car => {
            if (car.queuing && !car.blocked) {
                const carEntrance = this.entrances.find(e => e.id === car.entranceId);
                
                let accessibleSpots = [];
                if (carEntrance) {
                    accessibleSpots = this.getAccessibleSpotsFromEntrance(carEntrance);
                }
                
                if (accessibleSpots.length === 0) {
                    if (allAccessibleSpots.length === 0 && this.parkingSpots.length > 0) {
                        car.blocked = true;
                        car.queuing = false;
                        this.simStats.blocked++;
                    }
                    return;
                }
                
                let targetSpot = null;
                
                if (car.isEV) {
                    const chargingSpots = accessibleSpots.filter(s => s.type === 'charging');
                    if (chargingSpots.length > 0) {
                        targetSpot = chargingSpots[0];
                    } else {
                        targetSpot = accessibleSpots[0];
                    }
                } else {
                    const normalSpots = accessibleSpots.filter(s => s.type !== 'charging');
                    targetSpot = normalSpots.length > 0 ? normalSpots[0] : accessibleSpots[0];
                }
                
                if (targetSpot) {
                    car.route = this.calculateRoute(
                        { x: car.x, y: car.y },
                        { x: targetSpot.x + targetSpot.width / 2, y: targetSpot.y + targetSpot.height / 2 }
                    );
                    
                    if (!car.route || car.route.length < 2) {
                        car.blocked = true;
                        car.queuing = false;
                        this.simStats.blocked++;
                        return;
                    }
                    
                    car.queuing = false;
                    car.entered = true;
                    this.simStats.entered++;
                    targetSpot.occupied = true;
                    car.spotId = targetSpot.id;
                    car.targetX = targetSpot.x + targetSpot.width / 2;
                    car.targetY = targetSpot.y + targetSpot.height / 2;
                    car.routeIndex = 0;
                }
            }
            
            if (!car.queuing && !car.parked && !car.blocked && car.route && car.route.length > 0) {
                if (car.routeIndex < car.route.length) {
                    const target = car.route[car.routeIndex];
                    const dx = target.x - car.x;
                    const dy = target.y - car.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 5) {
                        car.routeIndex++;
                    } else {
                        car.x += dx / dist * 4;
                        car.y += dy / dist * 4;
                    }
                } else {
                    const dx = car.targetX - car.x;
                    const dy = car.targetY - car.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 5) {
                        car.parked = true;
                        car.parkStartTime = this.simTime;
                        car.route = [];
                    } else {
                        car.x += dx / dist * 3;
                        car.y += dy / dist * 3;
                    }
                }
            }
            
            if (car.parked && !car.exiting && !car.cannotExit) {
                const parkTime = this.simTime - car.parkStartTime;
                if (parkTime >= car.parkDuration) {
                    const spot = this.parkingSpots.find(s => s.id === car.spotId);
                    if (!spot) {
                        car.exited = true;
                        return;
                    }
                    
                    let accessibleExit = null;
                    if (this.exits.length > 0) {
                        for (const exit of this.exits) {
                            if (this.isExitAccessibleFromSpot(spot, exit)) {
                                accessibleExit = exit;
                                break;
                            }
                        }
                    }
                    
                    if (!accessibleExit && this.exits.length > 0) {
                        car.cannotExit = true;
                        this.simStats.blocked = (this.simStats.blocked || 0) + 1;
                        return;
                    }
                    
                    car.exiting = true;
                    const exit = accessibleExit || { x: 50, y: 50 };
                    car.targetX = exit.x;
                    car.targetY = exit.y;
                    car.exitId = exit.id;
                    
                    car.route = this.calculateRoute(
                        { x: car.x, y: car.y },
                        { x: car.targetX, y: car.targetY }
                    );
                    
                    if (!car.route || car.route.length < 2) {
                        car.exiting = false;
                        car.cannotExit = true;
                        this.simStats.blocked = (this.simStats.blocked || 0) + 1;
                        return;
                    }
                    
                    car.routeIndex = 0;
                }
            }
            
            if (car.exiting && car.route && car.route.length > 0) {
                if (car.routeIndex < car.route.length) {
                    const target = car.route[car.routeIndex];
                    const dx = target.x - car.x;
                    const dy = target.y - car.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 5) {
                        car.routeIndex++;
                    } else {
                        car.x += dx / dist * 4;
                        car.y += dy / dist * 4;
                    }
                } else {
                    const dx = car.targetX - car.x;
                    const dy = car.targetY - car.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist < 10) {
                        car.exited = true;
                        const spot = this.parkingSpots.find(s => s.id === car.spotId);
                        if (spot) spot.occupied = false;
                        this.simStats.exited++;
                    } else {
                        car.x += dx / dist * 3;
                        car.y += dy / dist * 3;
                    }
                }
            }
        });
    }
    
    removeExitedCars() {
        this.simCars = this.simCars.filter(car => !car.exited);
    }
    
    rectsIntersectOrTouch(a, b) {
        const expand = 10;
        return !(a.x + a.width + expand < b.x ||
                 b.x + b.width + expand < a.x ||
                 a.y + a.height + expand < b.y ||
                 b.y + b.height + expand < a.y);
    }
    
    roadsConnected(road1, road2) {
        return this.rectsIntersectOrTouch(road1, road2);
    }
    
    getConnectedRoads(startRoad) {
        const visited = new Set();
        const queue = [startRoad];
        const connected = [];
        
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.id)) continue;
            visited.add(current.id);
            connected.push(current);
            
            this.roads.forEach(r => {
                if (!visited.has(r.id) && this.roadsConnected(current, r)) {
                    queue.push(r);
                }
            });
        }
        
        return connected;
    }
    
    isPointNearRoad(point, road, threshold = 80) {
        const cx = road.x + road.width / 2;
        const cy = road.y + road.height / 2;
        const dx = Math.max(road.x - point.x, 0, point.x - (road.x + road.width));
        const dy = Math.max(road.y - point.y, 0, point.y - (road.y + road.height));
        return Math.sqrt(dx * dx + dy * dy) < threshold;
    }
    
    getRoadsNearPoint(point, threshold = 80) {
        return this.roads.filter(r => this.isPointNearRoad(point, r, threshold));
    }
    
    isSpotAccessibleFromEntrance(spot, entrance) {
        if (this.roads.length === 0) return false;
        
        const spotCenter = { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 };
        const entrancePoint = { x: entrance.x, y: entrance.y };
        
        const roadsNearEntrance = this.getRoadsNearPoint(entrancePoint, 120);
        if (roadsNearEntrance.length === 0) return false;
        
        const roadsNearSpot = this.getRoadsNearPoint(spotCenter, 120);
        if (roadsNearSpot.length === 0) return false;
        
        for (const roadNearEntrance of roadsNearEntrance) {
            const connectedRoads = this.getConnectedRoads(roadNearEntrance);
            for (const roadNearSpot of roadsNearSpot) {
                if (connectedRoads.some(r => r.id === roadNearSpot.id)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    isExitAccessibleFromSpot(spot, exit) {
        if (this.roads.length === 0) return false;
        
        const spotCenter = { x: spot.x + spot.width / 2, y: spot.y + spot.height / 2 };
        const exitPoint = { x: exit.x, y: exit.y };
        
        const roadsNearSpot = this.getRoadsNearPoint(spotCenter, 120);
        if (roadsNearSpot.length === 0) return false;
        
        const roadsNearExit = this.getRoadsNearPoint(exitPoint, 120);
        if (roadsNearExit.length === 0) return false;
        
        for (const roadNearSpot of roadsNearSpot) {
            const connectedRoads = this.getConnectedRoads(roadNearSpot);
            for (const roadNearExit of roadsNearExit) {
                if (connectedRoads.some(r => r.id === roadNearExit.id)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    getAccessibleSpotsFromEntrance(entrance) {
        return this.parkingSpots.filter(spot => 
            !spot.occupied && this.isSpotAccessibleFromEntrance(spot, entrance)
        );
    }
    
    getAllAccessibleSpots() {
        if (this.entrances.length === 0) return [];
        const accessible = new Set();
        
        this.entrances.forEach(entrance => {
            this.getAccessibleSpotsFromEntrance(entrance).forEach(spot => {
                accessible.add(spot.id);
            });
        });
        
        return this.parkingSpots.filter(s => accessible.has(s.id) && !s.occupied);
    }
    
    calculateRoute(from, to) {
        const routePoints = [];
        
        const roadsNearFrom = this.getRoadsNearPoint(from, 120);
        const roadsNearTo = this.getRoadsNearPoint(to, 120);
        
        if (roadsNearFrom.length > 0 && roadsNearTo.length > 0) {
            let connected = false;
            let startRoad = roadsNearFrom[0];
            let endRoad = roadsNearTo[0];
            
            for (const rf of roadsNearFrom) {
                const connectedRoads = this.getConnectedRoads(rf);
                for (const rt of roadsNearTo) {
                    if (connectedRoads.some(r => r.id === rt.id)) {
                        startRoad = rf;
                        endRoad = rt;
                        connected = true;
                        break;
                    }
                }
                if (connected) break;
            }
            
            if (!connected) {
                return null;
            }
            
            routePoints.push({ 
                x: startRoad.x + startRoad.width / 2, 
                y: startRoad.y + startRoad.height / 2 
            });
            
            if (startRoad.id !== endRoad.id) {
                routePoints.push({ 
                    x: endRoad.x + endRoad.width / 2, 
                    y: endRoad.y + endRoad.height / 2 
                });
            }
        } else {
            return null;
        }
        
        routePoints.push({ x: to.x, y: to.y });
        
        this.routes.push(routePoints);
        
        return routePoints;
    }
    
    saveDraft() {
        const draft = {
            parkingSpots: this.parkingSpots,
            zones: this.zones,
            roads: this.roads,
            entrances: this.entrances,
            exits: this.exits,
            gates: this.gates,
            cameras: this.cameras,
            settings: {
                peakTraffic: document.getElementById('peakTraffic').value,
                offPeakTraffic: document.getElementById('offPeakTraffic').value,
                avgParkingTime: document.getElementById('avgParkingTime').value,
                firstHourRate: document.getElementById('firstHourRate').value,
                hourlyRate: document.getElementById('hourlyRate').value,
                dailyMax: document.getElementById('dailyMax').value,
                freeMinutes: document.getElementById('freeMinutes').value,
                chargingFee: document.getElementById('chargingFee').value,
                evRatio: document.getElementById('evRatio').value,
                avgCharge: document.getElementById('avgCharge').value,
                beforeSpots: document.getElementById('beforeSpots').value,
                beforeCharging: document.getElementById('beforeCharging').value
            }
        };
        
        localStorage.setItem('parkingLotDraft', JSON.stringify(draft));
        alert('草稿已保存到本地！');
    }
    
    loadDraft() {
        const draftStr = localStorage.getItem('parkingLotDraft');
        if (!draftStr) {
            alert('没有找到已保存的草稿');
            return;
        }
        
        try {
            const draft = JSON.parse(draftStr);
            this.restoreFromData(draft);
            alert('草稿已加载！');
        } catch (e) {
            alert('加载草稿失败：' + e.message);
        }
    }
    
    loadFromStorage() {
        const draftStr = localStorage.getItem('parkingLotDraft');
        if (draftStr) {
            try {
                const draft = JSON.parse(draftStr);
                this.restoreFromData(draft, true);
            } catch (e) {
            }
        }
    }
    
    restoreFromData(data, silent = false) {
        this.parkingSpots = data.parkingSpots || [];
        this.zones = data.zones || [];
        this.roads = data.roads || [];
        this.entrances = data.entrances || [];
        this.exits = data.exits || [];
        this.gates = data.gates || [];
        this.cameras = data.cameras || [];
        
        if (data.settings) {
            const s = data.settings;
            if (s.peakTraffic) document.getElementById('peakTraffic').value = s.peakTraffic;
            if (s.offPeakTraffic) document.getElementById('offPeakTraffic').value = s.offPeakTraffic;
            if (s.avgParkingTime) document.getElementById('avgParkingTime').value = s.avgParkingTime;
            if (s.firstHourRate) document.getElementById('firstHourRate').value = s.firstHourRate;
            if (s.hourlyRate) document.getElementById('hourlyRate').value = s.hourlyRate;
            if (s.dailyMax) document.getElementById('dailyMax').value = s.dailyMax;
            if (s.freeMinutes) document.getElementById('freeMinutes').value = s.freeMinutes;
            if (s.chargingFee) document.getElementById('chargingFee').value = s.chargingFee;
            if (s.evRatio) document.getElementById('evRatio').value = s.evRatio;
            if (s.avgCharge) document.getElementById('avgCharge').value = s.avgCharge;
            if (s.beforeSpots) document.getElementById('beforeSpots').value = s.beforeSpots;
            if (s.beforeCharging) document.getElementById('beforeCharging').value = s.beforeCharging;
        }
        
        this.selectedItems = [];
        this.highlightedItems = [];
        if (!silent) {
            this.saveState();
        }
        this.render();
        this.updateStats();
        this.updatePropertiesPanel();
    }
    
    exportJSON() {
        const data = {
            version: '1.1',
            exportTime: new Date().toISOString(),
            parkingSpots: this.parkingSpots,
            zones: this.zones,
            roads: this.roads,
            entrances: this.entrances,
            exits: this.exits,
            gates: this.gates,
            cameras: this.cameras,
            settings: {
                peakTraffic: document.getElementById('peakTraffic').value,
                offPeakTraffic: document.getElementById('offPeakTraffic').value,
                avgParkingTime: document.getElementById('avgParkingTime').value,
                firstHourRate: document.getElementById('firstHourRate').value,
                hourlyRate: document.getElementById('hourlyRate').value,
                dailyMax: document.getElementById('dailyMax').value,
                freeMinutes: document.getElementById('freeMinutes').value,
                chargingFee: document.getElementById('chargingFee').value,
                evRatio: document.getElementById('evRatio').value,
                avgCharge: document.getElementById('avgCharge').value,
                beforeSpots: document.getElementById('beforeSpots').value,
                beforeCharging: document.getElementById('beforeCharging').value,
                spotWidth: document.getElementById('spotWidth').value,
                spotHeight: document.getElementById('spotHeight').value,
                roadWidth: document.getElementById('roadWidth').value,
                roadDirection: document.getElementById('roadDirection').value,
                peakStart: document.getElementById('peakStart').value,
                peakEnd: document.getElementById('peakEnd').value,
                peakStart2: document.getElementById('peakStart2').value,
                peakEnd2: document.getElementById('peakEnd2').value,
                simulationSpeed: this.simulationSpeed
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `停车场方案_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    importJSON(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.restoreFromData(data);
                
                if (data.settings) {
                    const s = data.settings;
                    if (s.spotWidth) document.getElementById('spotWidth').value = s.spotWidth;
                    if (s.spotHeight) document.getElementById('spotHeight').value = s.spotHeight;
                    if (s.roadWidth) document.getElementById('roadWidth').value = s.roadWidth;
                    if (s.roadDirection) document.getElementById('roadDirection').value = s.roadDirection;
                    if (s.peakStart) document.getElementById('peakStart').value = s.peakStart;
                    if (s.peakEnd) document.getElementById('peakEnd').value = s.peakEnd;
                    if (s.peakStart2) document.getElementById('peakStart2').value = s.peakStart2;
                    if (s.peakEnd2) document.getElementById('peakEnd2').value = s.peakEnd2;
                    if (s.simulationSpeed) {
                        this.simulationSpeed = parseFloat(s.simulationSpeed);
                        document.getElementById('simSpeed').value = this.simulationSpeed;
                        document.getElementById('simSpeedValue').textContent = this.simulationSpeed + 'x';
                    }
                }
                
                this.updateStats();
                alert('方案导入成功！');
            } catch (err) {
                alert('导入失败：文件格式不正确');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
    
    exportImage() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(this.canvas, 0, 0);
        
        const link = document.createElement('a');
        link.download = `停车场方案_${new Date().toLocaleDateString().replace(/\//g, '-')}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }
    
    generateReport() {
        const totalSpots = this.parkingSpots.length;
        const chargingSpots = this.parkingSpots.filter(s => s.type === 'charging').length;
        const handicapSpots = this.parkingSpots.filter(s => s.type === 'handicap').length;
        const compactSpots = this.parkingSpots.filter(s => s.type === 'compact').length;
        const largeSpots = this.parkingSpots.filter(s => s.type === 'large').length;
        
        const avgParkingTime = parseFloat(document.getElementById('avgParkingTime').value) || 60;
        const turnoverRate = Math.round((1440 / avgParkingTime) * 10) / 10;
        const dailyCars = Math.round(totalSpots * turnoverRate * 0.8);
        const dailyRevenue = document.getElementById('statDailyRevenue').textContent;
        const chargingRevenue = document.getElementById('statChargingRevenue').textContent;
        
        const beforeSpots = document.getElementById('beforeSpots').value;
        const afterSpots = totalSpots;
        const diffSpots = afterSpots - beforeSpots;
        
        const reportHtml = `
            <div class="report-content">
                <h2>🅿️ 停车场规划方案说明</h2>
                <p><strong>生成时间：</strong>${new Date().toLocaleString()}</p>
                
                <h3>📊 车位配置</h3>
                <table>
                    <tr><th>车位类型</th><th>数量</th><th>占比</th></tr>
                    <tr><td>普通车位</td><td>${totalSpots - chargingSpots - handicapSpots - compactSpots - largeSpots}</td><td>${totalSpots > 0 ? Math.round((totalSpots - chargingSpots - handicapSpots - compactSpots - largeSpots) / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>充电车位 🔌</td><td>${chargingSpots}</td><td>${totalSpots > 0 ? Math.round(chargingSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>无障碍车位 ♿</td><td>${handicapSpots}</td><td>${totalSpots > 0 ? Math.round(handicapSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>小型车位 🚗</td><td>${compactSpots}</td><td>${totalSpots > 0 ? Math.round(compactSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>大型车位 🚐</td><td>${largeSpots}</td><td>${totalSpots > 0 ? Math.round(largeSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><strong><td>总计</td><td>${totalSpots}</td><td>100%</td></strong></tr>
                </table>
                
                <h3>🚗 运营指标</h3>
                <ul>
                    <li><strong>预计周转率：</strong>${turnoverRate} 次/天/车位</li>
                    <li><strong>日服务车辆：</strong>${dailyCars} 辆</li>
                    <li><strong>预计日收入：</strong>${dailyRevenue}</li>
                    <li><strong>充电服务收入：</strong>${chargingRevenue}</li>
                    <li><strong>通道数量：</strong>${this.roads.length} 条</li>
                    <li><strong>入口数量：</strong>${this.entrances.length} 个</li>
                    <li><strong>出口数量：</strong>${this.exits.length} 个</li>
                    <li><strong>道闸数量：</strong>${this.gates.length} 台</li>
                    <li><strong>摄像机数量：</strong>${this.cameras.length} 台</li>
                </ul>
                
                <h3>🔄 改造对比</h3>
                <div class="highlight">
                    <p>改造前车位数：<strong>${beforeSpots}</strong> 个</p>
                    <p>改造后车位数：<strong>${afterSpots}</strong> 个</p>
                    <p>增加车位数：<strong style="color:${diffSpots >= 0 ? '#52c41a' : '#ff4d4f'}">${diffSpots >= 0 ? '+' : ''}${diffSpots}</strong> 个</p>
                </div>
                
                <h3>💡 优化建议</h3>
                <ul>
                    ${this.entrances.length === 0 ? '<li>⚠️ 建议至少设置1个车辆入口</li>' : ''}
                    ${this.exits.length === 0 ? '<li>⚠️ 建议至少设置1个车辆出口</li>' : ''}
                    ${this.roads.length === 0 && totalSpots > 0 ? '<li>⚠️ 建议绘制通道以优化车辆通行路线</li>' : ''}
                    ${chargingSpots === 0 ? '<li>💡 建议配置一定比例的充电车位以适配新能源汽车发展</li>' : ''}
                    ${handicapSpots === 0 && totalSpots > 20 ? '<li>💡 建议配置无障碍车位（不少于总车位2%）</li>' : ''}
                    ${this.gates.length === 0 && this.entrances.length > 0 ? '<li>💡 建议在入口处配置道闸设备</li>' : ''}
                    ${this.cameras.length === 0 ? '<li>💡 建议配置监控摄像机以提升安防水平</li>' : ''}
                </ul>
            </div>
        `;
        
        this.showModal('方案说明', reportHtml);
    }
    
    showModal(title, content) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = content;
        document.getElementById('modal').style.display = 'flex';
    }
    
    hideModal() {
        document.getElementById('modal').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new ParkingLotSimulator();
});