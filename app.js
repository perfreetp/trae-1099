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
        
        this.selectedItems = [];
        this.clipboard = [];
        
        this.simulationRunning = false;
        this.simulationSpeed = 1;
        this.simTime = 8 * 60;
        this.simInterval = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.render();
        this.updateStats();
        this.loadFromStorage();
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
        
        document.getElementById('btnStartSimulation').addEventListener('click', () => this.startSimulation());
        document.getElementById('btnStopSimulation').addEventListener('click', () => this.stopSimulation());
        document.getElementById('btnCloseSim').addEventListener('click', () => {
            document.getElementById('simulationPanel').style.display = 'none';
        });
        document.getElementById('simSpeed').addEventListener('input', (e) => {
            this.simulationSpeed = parseFloat(e.target.value);
            document.getElementById('simSpeedValue').textContent = this.simulationSpeed + 'x';
        });
        
        ['peakTraffic', 'offPeakTraffic', 'avgParkingTime', 'firstHourRate', 'hourlyRate', 
         'dailyMax', 'freeMinutes', 'chargingFee', 'beforeSpots', 'beforeCharging'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.updateStats());
        });
        
        document.getElementById('modalClose').addEventListener('click', () => this.hideModal());
        document.getElementById('modalCancel').addEventListener('click', () => this.hideModal());
        document.getElementById('modalConfirm').addEventListener('click', () => this.hideModal());
        
        document.addEventListener('keydown', (e) => {
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
            }
        });
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
        } else if (['parking', 'zone', 'road', 'oneway'].includes(this.currentTool)) {
            this.isDrawing = true;
            this.startX = this.snapToGrid(pos.x);
            this.startY = this.snapToGrid(pos.y);
        } else if (['entrance', 'exit', 'gate', 'camera'].includes(this.currentTool)) {
            this.placeMarker(pos);
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
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                this.parkingSpots.push({
                    id: Date.now() + row * cols + col,
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
    }
    
    createZone(shape) {
        const name = document.getElementById('zoneName').value || `分区${this.zones.length + 1}`;
        this.zones.push({
            id: Date.now(),
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            name: name,
            color: this.getRandomZoneColor()
        });
    }
    
    createRoad(shape) {
        this.roads.push({
            id: Date.now(),
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            oneway: this.currentTool === 'oneway',
            direction: document.getElementById('roadDirection').value
        });
    }
    
    placeMarker(pos) {
        const x = this.snapToGrid(pos.x);
        const y = this.snapToGrid(pos.y);
        
        const marker = {
            id: Date.now(),
            x: x,
            y: y
        };
        
        if (this.currentTool === 'entrance') {
            this.entrances.push(marker);
        } else if (this.currentTool === 'exit') {
            this.exits.push(marker);
        } else if (this.currentTool === 'gate') {
            this.gates.push(marker);
        } else if (this.currentTool === 'camera') {
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
        }
        
        this.render();
    }
    
    getItemAtPosition(pos) {
        for (let i = this.parkingSpots.length - 1; i >= 0; i--) {
            const spot = this.parkingSpots[i];
            if (pos.x >= spot.x && pos.x <= spot.x + spot.width &&
                pos.y >= spot.y && pos.y <= spot.y + spot.height) {
                return { ...spot, type: 'parking', index: i };
            }
        }
        
        for (let i = this.zones.length - 1; i >= 0; i--) {
            const zone = this.zones[i];
            if (pos.x >= zone.x && pos.x <= zone.x + zone.width &&
                pos.y >= zone.y && pos.y <= zone.y + zone.height) {
                return { ...zone, type: 'zone', index: i };
            }
        }
        
        for (let i = this.roads.length - 1; i >= 0; i--) {
            const road = this.roads[i];
            if (pos.x >= road.x && pos.x <= road.x + road.width &&
                pos.y >= road.y && pos.y <= road.y + road.height) {
                return { ...road, type: 'road', index: i };
            }
        }
        
        return null;
    }
    
    deleteAtPosition(pos) {
        const item = this.getItemAtPosition(pos);
        if (item) {
            this.deleteItem(item);
        }
    }
    
    deleteItem(item) {
        if (item.type === 'parking') {
            this.parkingSpots.splice(item.index, 1);
        } else if (item.type === 'zone') {
            this.zones.splice(item.index, 1);
        } else if (item.type === 'road') {
            this.roads.splice(item.index, 1);
        }
        this.render();
        this.updateStats();
    }
    
    deleteSelected() {
        const sorted = [...this.selectedItems].sort((a, b) => b.index - a.index);
        sorted.forEach(item => {
            if (item.type === 'parking') {
                const idx = this.parkingSpots.findIndex(s => s.id === item.id);
                if (idx >= 0) this.parkingSpots.splice(idx, 1);
            } else if (item.type === 'zone') {
                const idx = this.zones.findIndex(z => z.id === item.id);
                if (idx >= 0) this.zones.splice(idx, 1);
            } else if (item.type === 'road') {
                const idx = this.roads.findIndex(r => r.id === item.id);
                if (idx >= 0) this.roads.splice(idx, 1);
            }
        });
        this.selectedItems = [];
        this.render();
        this.updateStats();
    }
    
    clearSelection() {
        this.selectedItems = [];
        this.render();
    }
    
    selectAll() {
        this.selectedItems = [
            ...this.parkingSpots.map((s, i) => ({ ...s, type: 'parking', index: i })),
            ...this.zones.map((z, i) => ({ ...z, type: 'zone', index: i })),
            ...this.roads.map((r, i) => ({ ...r, type: 'road', index: i }))
        ];
        this.render();
    }
    
    copySelected() {
        this.clipboard = JSON.parse(JSON.stringify(this.selectedItems));
    }
    
    pasteItems() {
        if (this.clipboard.length === 0) return;
        
        const offset = 20;
        this.clipboard.forEach(item => {
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = Date.now() + Math.random();
            newItem.x += offset;
            newItem.y += offset;
            
            if (item.type === 'parking') {
                this.parkingSpots.push(newItem);
            } else if (item.type === 'zone') {
                this.zones.push(newItem);
            } else if (item.type === 'road') {
                this.roads.push(newItem);
            }
        });
        
        this.render();
        this.updateStats();
    }
    
    batchCopy() {
        if (this.selectedItems.length === 0) {
            alert('请先选择要复制的车位');
            return;
        }
        
        this.copySelected();
        this.pasteItems();
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
        this.render();
        this.updateStats();
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
        this.drawSimCars();
        
        if (this.tempShape) {
            this.drawTempShape();
        }
        
        this.drawSelection();
        
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
            if (road.width > road.height) {
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
                ctx.font = '14px Arial';
                const arrow = road.direction === 'horizontal' ? '➡️' : '⬇️';
                ctx.fillText(arrow, road.x + road.width / 2 - 7, road.y + road.height / 2 + 5);
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
            ctx.fillText('入口', e.x - 10, e.y + 25);
            ctx.font = '24px Arial';
        });
        
        this.exits.forEach(e => {
            ctx.fillText('⬆️', e.x - 12, e.y + 8);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#ff4d4f';
            ctx.fillText('出口', e.x - 10, e.y + 25);
            ctx.font = '24px Arial';
        });
        
        this.gates.forEach(g => {
            ctx.fillText('🚧', g.x - 12, g.y + 8);
        });
        
        this.cameras.forEach(c => {
            ctx.fillText('📹', c.x - 12, c.y + 8);
        });
    }
    
    drawSimCars() {
        const ctx = this.ctx;
        
        this.simCars.forEach(car => {
            ctx.fillStyle = car.color || '#1890ff';
            ctx.beginPath();
            ctx.arc(car.x, car.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
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
            ctx.strokeRect(item.x - 2, item.y - 2, item.width + 4, item.height + 4);
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
        
        const avgFee = this.calculateAverageFee(avgParkingTime, firstHourRate, hourlyRate, dailyMax, freeMinutes);
        const dailyRevenue = Math.round(dailyCars * avgFee);
        document.getElementById('statDailyRevenue').textContent = '¥' + dailyRevenue.toLocaleString();
        
        const peakTraffic = parseFloat(document.getElementById('peakTraffic').value) || 200;
        const queueLength = Math.max(0, Math.round((peakTraffic - totalSpots * 3) / 10));
        document.getElementById('statQueueLength').textContent = queueLength;
        
        const findTime = Math.round(Math.sqrt(totalSpots) * 0.5 * 10) / 10;
        document.getElementById('statFindTime').textContent = findTime;
        
        this.updateComparison(totalSpots, chargingSpots, dailyCars, dailyRevenue);
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
    
    updateComparison(afterSpots, afterCharging, afterDailyCars, afterRevenue) {
        const beforeSpots = parseInt(document.getElementById('beforeSpots').value) || 0;
        const beforeCharging = parseInt(document.getElementById('beforeCharging').value) || 0;
        
        document.getElementById('afterSpots').textContent = afterSpots;
        document.getElementById('afterCharging').textContent = afterCharging;
        document.getElementById('afterDaily').textContent = afterDailyCars;
        document.getElementById('afterRevenue').textContent = '¥' + afterRevenue.toLocaleString();
        
        const diffSpots = afterSpots - beforeSpots;
        const diffCharging = afterCharging - beforeCharging;
        const beforeDaily = beforeSpots * 4;
        const diffDaily = afterDailyCars - beforeDaily;
        const beforeRev = beforeDaily * 8;
        const diffRev = afterRevenue - beforeRev;
        
        this.setDiff('diffSpots', diffSpots, '+');
        this.setDiff('diffCharging', diffCharging, '+');
        this.setDiff('diffDaily', diffDaily, '+');
        this.setDiff('diffRevenue', diffRev, '+¥');
        
        document.getElementById('beforeDaily').textContent = beforeDaily;
        document.getElementById('beforeRevenue').textContent = beforeRev.toLocaleString();
    }
    
    setDiff(id, value, prefix) {
        const el = document.getElementById(id);
        el.textContent = (value >= 0 ? prefix : '') + value;
        el.className = value >= 0 ? 'diff-positive' : 'diff-negative';
    }
    
    startSimulation() {
        if (this.entrances.length === 0) {
            alert('请先放置至少一个入口！');
            return;
        }
        
        this.simulationRunning = true;
        this.simTime = 8 * 60;
        this.simCars = [];
        
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
        
        if (Math.random() < trafficRate / 60 / 60 * this.simulationSpeed) {
            this.addSimCar();
        }
        
        this.updateSimCars();
        this.removeExitedCars();
        
        const occupied = this.parkingSpots.filter(s => s.occupied).length;
        document.getElementById('simCars').textContent = occupied;
        document.getElementById('simEmpty').textContent = this.parkingSpots.length - occupied;
        
        const entered = this.simCars.filter(c => c.entered).length;
        document.getElementById('simEntered').textContent = entered;
        document.getElementById('simExited').textContent = entered - occupied;
        document.getElementById('simQueue').textContent = this.simCars.filter(c => c.queuing).length;
        
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
        const entrance = this.entrances[Math.floor(Math.random() * this.entrances.length)];
        const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'];
        
        this.simCars.push({
            id: Date.now() + Math.random(),
            x: entrance.x,
            y: entrance.y,
            targetX: 0,
            targetY: 0,
            color: colors[Math.floor(Math.random() * colors.length)],
            queuing: true,
            entered: false,
            parked: false,
            parkStartTime: 0,
            parkDuration: (parseFloat(document.getElementById('avgParkingTime').value) || 60) * (0.5 + Math.random())
        });
    }
    
    updateSimCars() {
        const emptySpots = this.parkingSpots.filter(s => !s.occupied);
        
        this.simCars.forEach(car => {
            if (car.queuing && emptySpots.length > 0) {
                car.queuing = false;
                car.entered = true;
                const spot = emptySpots.shift();
                spot.occupied = true;
                car.spotId = spot.id;
                car.targetX = spot.x + spot.width / 2;
                car.targetY = spot.y + spot.height / 2;
            }
            
            if (!car.queuing && !car.parked) {
                const dx = car.targetX - car.x;
                const dy = car.targetY - car.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 5) {
                    car.parked = true;
                    car.parkStartTime = this.simTime;
                } else {
                    car.x += dx / dist * 3;
                    car.y += dy / dist * 3;
                }
            }
            
            if (car.parked && this.simTime - car.parkStartTime > car.parkDuration) {
                if (car.spotId) {
                    const spot = this.parkingSpots.find(s => s.id === car.spotId);
                    if (spot) spot.occupied = false;
                }
                car.exiting = true;
                const exit = this.exits[Math.floor(Math.random() * this.exits.length)] || this.entrances[0];
                car.targetX = exit.x;
                car.targetY = exit.y;
            }
            
            if (car.exiting) {
                const dx = car.targetX - car.x;
                const dy = car.targetY - car.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < 5) {
                    car.gone = true;
                } else {
                    car.x += dx / dist * 3;
                    car.y += dy / dist * 3;
                }
            }
        });
    }
    
    removeExitedCars() {
        this.simCars = this.simCars.filter(c => !c.gone);
    }
    
    saveDraft() {
        const data = {
            parkingSpots: this.parkingSpots,
            zones: this.zones,
            roads: this.roads,
            entrances: this.entrances,
            exits: this.exits,
            gates: this.gates,
            cameras: this.cameras,
            savedAt: new Date().toISOString()
        };
        
        localStorage.setItem('parkingLotDraft', JSON.stringify(data));
        alert('草稿已保存！');
    }
    
    loadDraft() {
        const dataStr = localStorage.getItem('parkingLotDraft');
        if (!dataStr) {
            alert('没有找到已保存的草稿！');
            return;
        }
        
        try {
            const data = JSON.parse(dataStr);
            this.parkingSpots = data.parkingSpots || [];
            this.zones = data.zones || [];
            this.roads = data.roads || [];
            this.entrances = data.entrances || [];
            this.exits = data.exits || [];
            this.gates = data.gates || [];
            this.cameras = data.cameras || [];
            
            this.render();
            this.updateStats();
            alert('草稿已加载！');
        } catch (e) {
            alert('加载草稿失败！');
        }
    }
    
    loadFromStorage() {
        const dataStr = localStorage.getItem('parkingLotDraft');
        if (dataStr) {
            try {
                const data = JSON.parse(dataStr);
                this.parkingSpots = data.parkingSpots || [];
                this.zones = data.zones || [];
                this.roads = data.roads || [];
                this.entrances = data.entrances || [];
                this.exits = data.exits || [];
                this.gates = data.gates || [];
                this.cameras = data.cameras || [];
                this.render();
                this.updateStats();
            } catch (e) {}
        }
    }
    
    exportImage() {
        this.clearSelection();
        this.render();
        
        const link = document.createElement('a');
        link.download = `停车场方案_${new Date().toLocaleDateString()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
    
    generateReport() {
        const totalSpots = this.parkingSpots.length;
        const chargingSpots = this.parkingSpots.filter(s => s.type === 'charging').length;
        const handicapSpots = this.parkingSpots.filter(s => s.type === 'handicap').length;
        const compactSpots = this.parkingSpots.filter(s => s.type === 'compact').length;
        const largeSpots = this.parkingSpots.filter(s => s.type === 'large').length;
        const normalSpots = totalSpots - chargingSpots - handicapSpots - compactSpots - largeSpots;
        
        const turnoverRate = document.getElementById('statTurnover').textContent;
        const dailyCars = document.getElementById('statDailyCars').textContent;
        const dailyRevenue = document.getElementById('statDailyRevenue').textContent;
        const queueLength = document.getElementById('statQueueLength').textContent;
        const findTime = document.getElementById('statFindTime').textContent;
        
        const beforeSpots = document.getElementById('beforeSpots').value;
        const beforeCharging = document.getElementById('beforeCharging').value;
        const diffSpots = totalSpots - beforeSpots;
        const diffCharging = chargingSpots - beforeCharging;
        
        const reportHtml = `
            <div class="report-content">
                <h2>🅿️ 停车场规划方案说明</h2>
                <p><strong>生成时间：</strong>${new Date().toLocaleString()}</p>
                
                <h3>一、方案概述</h3>
                <div class="highlight">
                    <p>本方案通过优化车位布局和动线设计，提升停车场使用效率和用户体验。</p>
                </div>
                
                <h3>二、车位配置</h3>
                <table>
                    <tr><th>车位类型</th><th>数量</th><th>占比</th></tr>
                    <tr><td>普通车位</td><td>${normalSpots}</td><td>${totalSpots > 0 ? Math.round(normalSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>充电车位 🔌</td><td>${chargingSpots}</td><td>${totalSpots > 0 ? Math.round(chargingSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>无障碍车位 ♿</td><td>${handicapSpots}</td><td>${totalSpots > 0 ? Math.round(handicapSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>小型车位 🚗</td><td>${compactSpots}</td><td>${totalSpots > 0 ? Math.round(compactSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td>大型车位 🚐</td><td>${largeSpots}</td><td>${totalSpots > 0 ? Math.round(largeSpots / totalSpots * 100) : 0}%</td></tr>
                    <tr><td><strong>合计</strong></td><td><strong>${totalSpots}</strong></td><td>100%</td></tr>
                </table>
                
                <h3>三、运营指标</h3>
                <ul>
                    <li><strong>预计周转率：</strong>${turnoverRate} 次/天</li>
                    <li><strong>日服务车辆：</strong>${dailyCars} 辆</li>
                    <li><strong>预计日收入：</strong>${dailyRevenue}</li>
                    <li><strong>高峰排队长度：</strong>${queueLength} 辆</li>
                    <li><strong>平均找位时间：</strong>${findTime} 分钟</li>
                </ul>
                
                <h3>四、改造效果对比</h3>
                <table>
                    <tr><th>指标</th><th>改造前</th><th>改造后</th><th>提升</th></tr>
                    <tr><td>车位数量</td><td>${beforeSpots}</td><td>${totalSpots}</td><td>${diffSpots >= 0 ? '+' : ''}${diffSpots} (${diffSpots >= 0 ? '+' : ''}${beforeSpots > 0 ? Math.round(diffSpots / beforeSpots * 100) : 0}%)</td></tr>
                    <tr><td>充电车位</td><td>${beforeCharging}</td><td>${chargingSpots}</td><td>${diffCharging >= 0 ? '+' : ''}${diffCharging}</td></tr>
                </table>
                
                <h3>五、设施配置</h3>
                <ul>
                    <li><strong>入口：</strong>${this.entrances.length} 个</li>
                    <li><strong>出口：</strong>${this.exits.length} 个</li>
                    <li><strong>道闸：</strong>${this.gates.length} 个</li>
                    <li><strong>摄像机：</strong>${this.cameras.length} 个</li>
                    <li><strong>通道：</strong>${this.roads.length} 条</li>
                    <li><strong>分区：</strong>${this.zones.length} 个</li>
                </ul>
                
                <h3>六、方案特点</h3>
                <ul>
                    <li>合理的车位尺寸设计，兼顾空间利用率和停车便利性</li>
                    <li>充足的充电车位配置，满足新能源汽车发展需求</li>
                    <li>规范的无障碍车位设置，体现人文关怀</li>
                    <li>清晰的动线设计，减少车辆交汇和拥堵</li>
                    <li>完善的安防设施，保障车辆安全</li>
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
