// Load data tiles using the JQuery ajax function
L.TileLayer.Ajax = L.TileLayer.extend({
    onAdd: function (map) {
        L.TileLayer.prototype.onAdd.call(this, map);
        this.on('tileunload', this._unloadTile);
    },
    onRemove: function (map) {
        L.TileLayer.prototype.onRemove.call(this, map);
        this.off('tileunload', this._unloadTile);
    },
    _addTile: function(tilePoint, container) {
        var key = tilePoint.x + ':' + tilePoint.y;
        var tile = { key: key, datum: null };
        this._tiles[key] = tile;
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
                // check if request is about to be aborted, avoid rare error when aborted while parsing
                if (tile._request) {
                    tile._request = null;
                    layer.fire('tileresponse', {tile: tile, request: req});
                    tile.datum = req.responseText;
                    layer._addTileData(tile);
                }
            } else {
                layer.fire('tileerror', {tile: tile});
                layer._tileLoaded();
            }
        }
    },
    // Load the requested tile via AJAX
    _loadTile: function (tile, tilePoint) {
        this._adjustTilePoint(tilePoint);
        var layer = this;
        var req = new XMLHttpRequest();
        tile._request = req;
        req.onreadystatechange = this._xhrHandler(req, layer, tile);
        this.fire('tilerequest', {tile: tile, request: req});
        req.open('GET', this.getTileUrl(tilePoint), true);
        req.send();
    },
    _unloadTile: function(evt) {
        var tile = evt.tile,
            req = tile._request;
        if (req) {
            tile._request = null;
            req.abort();
            this.fire('tilerequestabort', {tile: tile, request: req});
        }
    },
    _update: function() {
        //console.log('_update');
        if (this._map._panTransition && this._map._panTransition._inProgress) { return; }
        if (this._tilesToLoad < 0) this._tilesToLoad = 0;
        L.TileLayer.prototype._update.apply(this, arguments);
    }
});

L.TileLayer.Vector = L.TileLayer.Ajax.extend({
    statics: {
        // number of web workers, not using web workers when falsy
        NUM_WORKERS: 2
    },
    
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
        this._addQueue = new L.TileQueue(L.bind(this._addTileDataInternal, this));
    },
    onAdd: function (map) {
        this._map = map;
        
        this._updateZoom();

        L.TileLayer.Ajax.prototype.onAdd.call(this, map);

        map.on('viewreset', this._updateZoom, this);

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
        
        this._workers = L.TileLayer.Vector.createWorkers();
    },
    onRemove: function (map) {
        // unload tiles (L.TileLayer only calls _reset in onAdd)
        this._reset();
        map.removeLayer(this.vectorLayer);

        L.TileLayer.Ajax.prototype.onRemove.call(this, map);

        map.off('viewreset', this._updateZoom, this);
        map.off('layeradd', this._removeViewresetForPaths, this);

        this.vectorLayer = null;
        this._map = null;

        if (this._workers) {
            // TODO do not close when other layers are still using the static instance
            //this._workers.close();
        }
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
        if (this._workers){ 
            tile._worker = this._workers.data(tile.datum).then(L.bind(function(parsed) {
                if (tile._worker) {
                    tile._worker = null;
                    tile.parsed = parsed;
                    tile.datum = null;
                    this._addQueue.add(tile);
                } else {
                    // tile has been unloaded, don't continue with adding
                    //console.log('worker aborted ' + tile.key);
                }
            }, this));
        } else {
            this._addQueue.add(tile);
        }
    },
    _addTileDataInternal: function(tile) {
        try {
            var tileLayer = this._createTileLayer();
            if (!tile.parsed) {
                tile.parsed = L.TileLayer.Vector.parseData(tile.datum);
                tile.datum = null;
            }
            tileLayer.addData(tile.parsed);
            tile.layer = tileLayer;
            this.vectorLayer.addLayer(tileLayer);
        } catch (e) {
            console.error(e.toString());
        }
        this.fire('tileload', {tile: tile});
        this._tileLoaded();
    },
    _unloadTile: function(evt) {
        L.TileLayer.Ajax.prototype._unloadTile.apply(this, arguments);

        var tile = evt.tile,
            tileLayer = tile.layer;
        this._addQueue.remove(tile);
        if (tile._worker) {
            // TODO abort worker, would need to recreate after close
            //tile._worker.close();
            tile._worker = null;
        }
        if (tileLayer) {
            // L.LayerGroup.hasLayer > v0.5.1 only 
            if (this.vectorLayer._layers[L.stamp(tileLayer)]) {
                this.vectorLayer.removeLayer(tileLayer);
            }
        }
    },
    _reset: function() {
        L.TileLayer.Ajax.prototype._reset.apply(this, arguments);
        this._addQueue.clear();
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
            //console.log('tileSize = ' + this.options.tileSize + ', zoomOffset = ' + this.options.zoomOffset + ', serverZoom = ' + serverZoom + ', zoom = ' + this._zoom);
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

L.extend(L.TileLayer.Vector, {
    parseData: function(data) {
        return JSON.parse(data);
    },

    createWorkers: function() {
        if (L.TileLayer.Vector.NUM_WORKERS && typeof Worker === "function" && typeof communist === "function"
                && !("workers" in L.TileLayer.Vector)) {
            L.TileLayer.Vector.workers = communist({
                data : L.TileLayer.Vector.parseData
            }, L.TileLayer.Vector.NUM_WORKERS);
        }
        return L.TileLayer.Vector.workers;
    }
});
