// Load data tiles using the JQuery ajax function
L.TileLayer.Ajax = L.TileLayer.extend({
    _requests: [],
    _addTile: function(tilePoint, container) {
        var tile = { datum: null };
        this._tiles[tilePoint.x + ':' + tilePoint.y] = tile;
        this._loadTile(tile, tilePoint);
    },
    _addTileData: function(tile) {
        // override in subclass
    },
    // XMLHttpRequest handler; closure over the XHR object, the layer, and the tile
    _xhrHandler: function (req, layer, tile) {
        return function() {
            if (req.readyState != 4) {
                return;
            }
            var s = req.status;
            if ((s >= 200 && s < 300) || s == 304) {
                tile.datum = JSON.parse(req.responseText);
                layer._addTileData(tile);
            } else {
                layer._tileLoaded();
            }
        }
    },
    // Load the requested tile via AJAX
    _loadTile: function (tile, tilePoint) {
        this._adjustTilePoint(tilePoint);
        var layer = this;
        var req = new XMLHttpRequest();
        this._requests.push(req);
        req.onreadystatechange = this._xhrHandler(req, layer, tile);
        req.open('GET', this.getTileUrl(tilePoint), true);
        req.send();
    },
    _reset: function() {
        for (var i in this._requests) {
            this._requests[i].abort();
        }
        this._requests = [];
        L.TileLayer.prototype._reset.apply(this, arguments);
    },
    _update: function() {
        if (this._map._panTransition && this._map._panTransition._inProgress) { return; }
        if (this._tilesToLoad < 0) this._tilesToLoad = 0;
        L.TileLayer.prototype._update.apply(this, arguments);
    }
});

L.TileLayer.Vector = L.TileLayer.Ajax.extend({
    options: {
        // factory function to create the vector tile layers (defaults to L.GeoJSON)
        layerFactory: L.geoJson,
        // List of available server zoom levels in ascending order. Empty means all  
        // client zooms are available (default). Allows to only request tiles at certain
        // zooms and resizes tiles on the other zooms.
        serverZooms: []
    },
    initialize: function (url, options, vectorOptions) {
        L.TileLayer.Ajax.prototype.initialize.call(this, url, options);
        this.options.tileSizeOrig = this.options.tileSize;
        this.options.zoomOffsetOrig = this.options.zoomOffset;
        this.vectorOptions = vectorOptions || {};
    },
    onAdd: function (map) {
        this._map = map;
        
        this._updateZoom();

        L.TileLayer.Ajax.prototype.onAdd.call(this, map);

        map.on('viewreset', this._updateZoom, this);
        this.on('tileunload', this._unloadTile);

        // root vector layer, contains tile vector layers as children 
        this.vectorLayer = this._createVectorLayer(); 
        map.addLayer(this.vectorLayer);

        // workaround for v0.5.1:
        // Error in projectLatlngs because L.Path._map is null, when layer has been removed 
        // in the same viewreset event (tileunload) and listeners are not removed yet.
        // Not needed for current master (> v0.5.1), because listeners are removed immediately.
        // 
        // Simply removes viewreset listeners right after they have been added, assuming that 
        // we always remove layers on viewreset and therefore projectLatlngs is unnecessary. 
        map.on('layeradd', this._removeViewresetForPaths, this);
    },
    onRemove: function (map) {
        // unload tiles (L.TileLayer only calls _reset in onAdd)
        this._reset();
        map.removeLayer(this.vectorLayer);

        L.TileLayer.Ajax.prototype.onRemove.call(this, map);

        this.off('tileunload', this._unloadTile);
        map.off('viewreset', this._updateZoom, this);
        map.off('layeradd', this._removeViewresetForPaths, this);

        this.vectorLayer = null;
        this._map = null;
    },
    _createVectorLayer: function() {
        return this.options.layerFactory(null, this.vectorOptions);
    },
    _removeViewresetForPaths: function(evt) {
        var layer = evt.layer;
        if (layer.projectLatlngs && this._map) {
            this._map.off('viewreset', layer.projectLatlngs, layer);
        }
    },
    _createTileLayer: function() {
        return this._createVectorLayer();
    },
    _addTileData: function(tile) {
        try {
            var tileLayer = this._createTileLayer();
            tileLayer.addData(tile.datum);
            tile.layer = tileLayer;
            this.vectorLayer.addLayer(tileLayer);
        } catch (e) {
            console.error(e.toString());
        }
        this._tileLoaded();
    },
    _unloadTile: function(evt) {
        var tileLayer = evt.tile.layer;
        if (tileLayer) {
            // L.LayerGroup.hasLayer > v0.5.1 only 
            if (this.vectorLayer._layers[L.stamp(tileLayer)]) {
                this.vectorLayer.removeLayer(tileLayer);
            }
        }
    },
    // on zoom change get the appropriate server zoom for the current zoom and 
    // adjust tileSize and zoomOffset if no server zoom at this level 
    _updateZoom: function() {
        var zoomChanged = (this._zoom !== this._map.getZoom());
        this._zoom = this._map.getZoom();

        if (zoomChanged) {
            var serverZoom = this._getServerZoom(),
                zoom = this._zoom,
                tileSizeOrig = this.options.tileSizeOrig,
                zoomOffsetOrig = this.options.zoomOffsetOrig;
                
            this.options.tileSize = Math.floor(tileSizeOrig * Math.pow(2, (zoom + zoomOffsetOrig) - serverZoom));
            this.options.zoomOffset = serverZoom - (zoom + zoomOffsetOrig);
            console.log('tileSize = ' + this.options.tileSize + ', zoomOffset = ' + this.options.zoomOffset + ', serverZoom = ' + serverZoom + ', zoom = ' + this._zoom);
        }
    },
    // Returns the appropriate server zoom to request tiles for the current zoom level.
    // Next lower or equal server zoom to current zoom, or minimum server zoom if no lower 
    // (should be restricted by setting minZoom to avoid loading too many tiles).
    _getServerZoom: function() {
        var zoom = this._zoom,
            serverZooms = this.options.serverZooms,
            result = zoom;
        // expects serverZooms to be sorted ascending
        for (var i = 0, len = serverZooms.length; i < len; i++) {
            if (serverZooms[i] <= zoom) {
                result = serverZooms[i];
            } else {
                if (i === 0) {
                    // zoom < smallest serverZoom
                    result = serverZooms[0];
                }
                break;
            }
        }
        return result;
    }
});
